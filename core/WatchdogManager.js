const path = require('path');
const cluster = require('cluster');
const shortid = require('shortid');
const ConsistentMap = require('./structures/ConsistentMap');
const MapSet = require('./structures/MapSet');
const EventEmitter = require('events').EventEmitter;

class WatchdogManager extends EventEmitter {
  constructor(totalNodes, ttl, lifecycle) {
    super();

    this._lifecycle = lifecycle;
    this._totalNodes = totalNodes;
    this._unwarmedNodes = 0;
    this._allocationCache = new Map();
    this._allocations = new MapSet();
    this._env = {
      epoch: process.hrtime()
    };
    this.nodes = new Set();
    this.stats = {
      trackedTimeSum: 0,
      trackedTimeTotal: 0,
      start_time: process.hrtime()
    };
    this.consistentMap = new ConsistentMap();
    this._awaiting = new Map();
    this._nodeTTL = ttl || (60 * 5 * 1000); // Maximum of 5 minutes scheduling and 10 minutes runtime

    cluster.setupMaster({
      exec: path.resolve(__dirname, '../watchdogs/Node.js'),
      args: ['--ttl', this._nodeTTL],
      silent: true
    });

    this.rebalance();
  }

  _handleMessage(message) {
    if (!message || (typeof message !== 'object') || !message.id) return;
    if (message.type === 'uncaughtException') return console.error("uncaughtException", message);
    const error = (message.status === 'ERROR')?new Error(message.error):null;
    if (message.errorCode) error.code = message.errorCode;

    if (this.hasScheduledTask(message.id)) {
      const task = this.getScheduledTask(message.id);
      const duration = process.hrtime(task.time);
      if (error) {
        task.reject(error);
      } else {
        task.resolve(message.response);
      }
      if (task.time) this.trackTime(duration[0] * 1e9 + duration[1]);
    }
  }

  async _handleNodeOnline(node) {
    this.emit('online', node);
    node.on('message', (message) => this._handleMessage(message, node));

    await this._lifecycle.trigger('onNodeOnline', node, this);

    setTimeout(() => {
      this.graceFullyKillNode(node, this._nodeTTL);
    }, this._nodeTTL);

    this.consistentMap.add(node);
    this.nodes.add(node);
    this._unwarmedNodes--;
    this.emit('ready', node);
    await this._lifecycle.trigger('onNodeReady', node, this);
  }

  setModulePath(p) {
    this.env['ELIO_MODULE_PATH'] = p;
  }

  hasScheduledTask(id) {
    return this._awaiting.has(id);
  }

  getScheduledTask(id) {
    const task = this._awaiting.get(id);
    this._awaiting.delete(id);
    return task;
  }

  async scheduleAsync(id) {
    return new Promise((resolve, reject) => {
      this._awaiting.set(id, {
        resolve,
        reject,
        time: process.hrtime()
      });
    });
  }

  async send(message, node) {
    node.send(message);
    return await this.scheduleAsync(message.id);
  }

  getTrackedStats() {
    const { trackedTimeSum, trackedTimeTotal, start_time } = this.stats;
    const average = Math.floor(trackedTimeSum / trackedTimeTotal);
    const averageMilisecond = Math.floor(average / 1000000);
    const start_time_diff = process.hrtime(start_time);
    const runtime = start_time_diff[0] * 1e9 + start_time_diff[1];
    
    return {
      trackedTimeTotal,
      trackedTimeSum,
      runtime,
      overtime: trackedTimeSum - runtime,
      average,
      averageMilisecond
    };
  }

  trackTime(time) {
    this.stats.trackedTimeSum += time;
    this.stats.trackedTimeTotal++;
  }

  rebalance() {
    const additionalNodes = this._totalNodes - (this.consistentMap.size + this._unwarmedNodes);

    if (additionalNodes < 1) return;
    for (let i = 0; i < additionalNodes; i++) {
      this.fork();
    }
  }

  fork() {
    const node = cluster.fork();
    this._unwarmedNodes++;

    node.on('online', () => {
      this._handleNodeOnline(node);
    });

    node.on('exit', (code, signal) => {
      if (signal) {
        console.log(`Node was killed by signal: ${signal}`);
      } else if (code !== 0) {
        console.log(`Node exited with error code: ${code}`);
      } else {
        console.log(`Node ${node.id} has finished execution.`);
      }
      this.consistentMap.delete(node);
      this.nodes.delete(node);
      this.rebalance();
    });

    node.on('disconnect', () => this.nodes.delete(node) && this.consistentMap.delete(node) && this.rebalance());
  }

  graceFullyKillNode(node, ttl) {
    this.consistentMap.delete(node);
    this.unicast({ type: "GRACEFUL_SHUTDOWN", ttl }, node);
    this.rebalance();

    if (ttl) {
      setTimeout(() => {
        if (!node.exitedAfterDisconnect) this.killNode(node);
      }, ttl);
    }
  }

  killNode(node) {
    this.consistentMap.delete(node);
    this.nodes.delete(node);
    node.kill('SIGTERM');
  }

  async allocate(digest, source) {
    const node = this.consistentMap.get(digest);
    this._allocationCache.set(digest, source);
    this._allocations.add(node, digest);

    return await this.unicast({
      type: 'REFDeploy',
      digest,
      source
    }, node);
  }

  async deallocate(digest) {
    const node = this.consistentMap.get(digest);
    this._allocations.remove(node, digest);
    this._allocationCache.delete(digest);

    /* We broadcast to all in case
       the hashring was rebalanced
    */
    return await this.broadcast({
      type: 'REFUndeploy',
      digest
    });
  }

  hasCachedAllocation(digest) {
    return this._allocationCache.has(digest);
  }

  async allocateFromCache(digest) {
    const node = this.consistentMap.get(digest);

    await this.allocate(digest, this._allocationCache.get(digest));
    return true;
  }

  hasAllocation(digest) {
    const node = this.consistentMap.get(digest);

    return this._allocationCache.has(digest) && node && this.nodes.has(node) && this._allocations.has(node, digest);
  }

  getAllocations() {
    return this._allocationCache;
  }

  flushAllocations() {
    this._allocationCache = new Map();
    this._allocations = new MapSet();
  }

  async anycast(digest, message) {
    const provider = this.consistentMap.get(digest);
    if (!provider) throw new Error("No providers were found");

    return await this.unicast(message, provider);
  }

  async unicast(message, node) {
    if (!message.id) message.id = shortid.generate();
    return await this.send(message, node);
  }

  async broadcast(message) {
    let list = [];

    this.consistentMap.forEach((node) => {
      message.id = shortid.generate();
      list.push(this.unicast(message, node));
    });

    await Promise.all(list);
  }
}

module.exports = WatchdogManager;