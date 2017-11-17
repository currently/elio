const vm = require('vm');
const { runInNewContext } = vm;
const EventEmitter = require('events').EventEmitter;
const Services = require('./services');
const LifeCycle = require('./LifeCycle');
const MapList = require('./structures/MapList');

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
    this._pipelines = new MapList();
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

  async createPipeline(name, pipeline) {
    await this._lifecycle.trigger('onCreatePipeline', name, pipeline);

    /** @todo: Add validation */
    this._pipelines.push(name, pipeline);
  }

  async invokePipeline(name, context) {
    await this._lifecycle.trigger('onInvokePipeline', name, context, this._pipelines.has(name));

    if (!this._pipelines.has(name)) throw new Error("Pipeline was not found");

    // Traffic ramp-up, A/B and sampling support
    const pipeline = this._pipelines.top(name).map((step) => {
      if (typeof step === 'string') return step;
      if (!step || !step.type) return null;

      switch(step.type) {
        // Inspired by https://stackoverflow.com/questions/8435183/generate-a-weighted-random-number
        case 'SPLIT':
          let sum = 0;
          const random = Math.random();
          
          for (const digest in step.spec) {
            sum += step.spec[digest];
            if (random <= sum) return digest;
          }
        break;
      }
    }).filter((v) => !!v);
    
    const { length } = pipeline;
    let data = context;

    for (let i = 0; i < length; i++) {
      data = await this.invoke(pipeline[i], data);
    }

    return data;
  }

  async readPipeline(name) {
    await this._lifecycle.trigger('onReadPipeline', name, this._pipelines.has(name));

    return this._pipelines.top(name);
  }

  async rollbackPipeline(name) {
    await this._lifecycle.trigger('onRollbackPipeline', name, this._pipelines.top(name));

    return this._pipelines.pop(name);
  }

  async removePipeline(name) {
    await this._lifecycle.trigger('onRemovePipeline', name);
    this._pipelines.delete(name);
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

  async hasDeployment(digest) {
    await this._lifecycle.trigger('onHasDeployment', digest);

    return this.listDeployments().indexOf(digest) !== -1;
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