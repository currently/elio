const vm = require('vm');
const { runInNewContext } = vm;
const EventEmitter = require('events').EventEmitter;
const Services = require('./services');
const LifeCycle = require('./LifeCycle');

const WatchdogManager = require('./WatchdogManager');

class Elio extends EventEmitter {
  constructor(config) {
    super();

    const { maxNodes, ttl } = config;
    this._lifecycle = new LifeCycle(this);
    this._readyCriteria = {
      nodesReady: false
    };
    this._hasBeenReadyBefore = false;
    this._internalSourceRegistry = new Map();
    this._internalRoutingMap = new Map();
    this._watchdog = new WatchdogManager(maxNodes || 5, ttl || 300000, this._lifecycle);
    if (config.modulePath) this._watchdog.setModulePath(config.modulePath);
    this._watchdog.once('ready', () => this._completeCriteria('nodesReady'));
  }

  _completeCriteria(key) {
    this._readyCriteria[key] = true;

    // Attempt to invalidate ready state
    for (const innerKey in this._readyCriteria) {
      if (this._readyCriteria[innerKey] !== true) return;
    }

    // Otherwise we are ready
    if (!this._hasBeenReadyBefore) {
      this._hasBeenReadyBefore = true;
      this.emit('ready');
    }
  }

  flushDeployments() {
    this._watchdog.flushAllocations();
  }

  use(service) {
    const { registeredHooks } = service;
    const length = (registeredHooks)?registeredHooks.length:0;

    for (let i = 0; i < length; i++) {
      this._lifecycle.add(registeredHooks[i], service);
    }
  }

  async invoke(digest, context) {
    let allocated = this._watchdog.hasAllocation(digest);
    if (this._watchdog.hasCachedAllocation(digest)) {
      allocated = await this._watchdog.allocateFromCache(digest);
    }
    await this._lifecycle.trigger('onInvoke', digest, context, allocated);

    return await this._watchdog.anycast(digest, {
      type: 'REFInvoke',
      digest,
      context
    });
  }

  async invokeRoute(route, context) {
    await this._lifecycle.trigger('onInvokeRoute', route, context);

    return this.invoke(this._internalRoutingMap.get(route), context);
  }

  async assignRoute(route, digest) {
    this._internalRoutingMap.set(route, digest);
    await this._lifecycle.trigger('onAssignRoute', digest);
  }

  async removeRoute(route) {
    this._internalRoutingMap.delete(route);
    await this._lifecycle.trigger('onRemoveRoute', digest);
  }

  getRoute(route) {
    return this._internalRoutingMap.get(route);
  }

  listRoutes() {
    return Array.from(this._internalRoutingMap).map((a) => {
      return {
        route: a[0],
        digest: a[1]
      }
    });
  }

  async deploy(identity, source, signature, dependencies) {
    const deployment = { identity, source, signature, dependencies };
    await this._lifecycle.trigger('onDeploy', deployment);
 
    // Deploy Source
    const results = await this._watchdog.allocate(signature, source);
    this.emit('deploy', signature, source);

    return signature;
  }

  async undeploy(digest) {
    await this._lifecycle.trigger('onInvokeRoute', digest);

    const results = await this._watchdog.deallocate(digest);
    this.emit('undeploy', digest);
  }

  listDeployments() {
    return Array.from(this._watchdog.getAllocations());
  }

  get services() {
    return Services;
  }

  static get services() {
    return Services;
  }
}

module.exports = Elio;