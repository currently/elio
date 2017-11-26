const vm = require('vm');
const { runInNewContext } = vm;
const EventEmitter = require('events').EventEmitter;
const Services = require('./services');
const LifeCycle = require('./LifeCycle');

const WatchdogManager = require('./WatchdogManager');

class Elio extends EventEmitter {
  constructor(config) {
    super();

    const { maxNodes, ttl, shortCacheInterval } = config;
    this._lifecycle = new LifeCycle(this);
    this._readyCriteria = {
      nodesReady: false
    };
    this._hasBeenReadyBefore = false;
    this._pipelineShortCache = new Map();
    this._watchdog = new WatchdogManager(maxNodes || 5, ttl || 300000, this._lifecycle);
    if (config.modulePath) this._watchdog.setModulePath(config.modulePath);
    this._watchdog.once('ready', () => this._completeCriteria('nodesReady'));
    this._shortCacheInterval = setInterval(() => this._pipelineShortCache = new Map(), shortCacheInterval || 5000);
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

  _aggregateConsensus(consensus) {
    return consensus && consensus.reduce((a, b) => (a === true || b === true), false);
  }

  _pickListConsensus(lists) {
    // Last Added Service always precedes
    const items = lists.filter((a) => Array.isArray(a));
    return items[items.length - 1];
  }

  flushShortCache() {
    this._pipelineShortCache = new Map();
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

  async invoke(digest, _context) {
    let allocated = this._watchdog.hasAllocation(digest);
    const context = ((typeof _context === 'string') || (typeof _context === 'function') || (Array.isArray(_context)))?{ value: _context }:_context;
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
    const consensus = await this._lifecycle.trigger('onCreatePipeline', name, pipeline);
    return this._aggregateConsensus(consensus);
  }

  async invokePipeline(name, context) {
    let pipeline = null;
    let data = context;

    // Check if pipeline can be picked up from Cache
    if (this._pipelineShortCache.has(name)) {
      await this._lifecycle.trigger('onInvokePipelineFromCache', name, context);
      pipeline = this._pipelineShortCache.get(name);
    } else {
      const pipelineList = await this._lifecycle.trigger('onInvokePipeline', name, context);

      if (!pipelineList || !pipelineList.length) throw new Error("Pipeline was not found");
      const candidate = this._pickListConsensus(pipelineList);
  
      // Traffic ramp-up, A/B and sampling support
      pipeline = candidate.map((step) => {
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

      this._pipelineShortCache.set(name, pipeline);
    }
    
    const { length } = pipeline;
    for (let i = 0; i < length; i++) {
      data = await this.invoke(pipeline[i], data);
    }

    return data;
  }

  async rollbackPipeline(name) {
    const consensus = await this._lifecycle.trigger('onRollbackPipeline', name);
    return this._aggregateConsensus(consensus);
  }

  async removePipeline(name) {
    const consensus = await this._lifecycle.trigger('onRemovePipeline', name);
    return this._aggregateConsensus(consensus);
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