const vm = require('vm');
const { runInNewContext } = vm;
const anyBody = require('body/any');
const EventEmitter = require('events').EventEmitter;
const Services = require('./services');

const ClusterManager = require('./ClusterManager');

class Elio extends EventEmitter {
  constructor(config) {
    super();

    const { port, maxNodes, ttl } = config;
    this._readyCriteria = {
      nodesReady: false
    };
    this._hasBeenReadyBefore = false;
    this._internalSourceRegistry = new Map();
    this._internalRoutingMap = new Map();
    this._clusterManager = new ClusterManager(maxNodes || 5, ttl || 300000);
    if (config.modulePath) this._clusterManager.setModulePath(config.modulePath);
    this._clusterManager.once('online', () => this._completeCriteria('nodesReady'));
    this._services = {
      onDeploy: [],
      onUndeploy: [],
      onInvoke: [],
      onInvokeRoute: [],
      onAssignRoute: [],
      onRemoveRoute: []
    };
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

  async _serviceCycle(lifecycle, ...args) {
    const services = this._services[lifecycle];
    let promises = [];

    for (let i = 0; i < services.length; i++) {
      promises.push(services[i][lifecycle](...args));
    }

    return await Promise.all(promises);
  }

  use(service) {
    for (const lifecycle in this._services) {
      if (typeof service[lifecycle] === 'function') {
        this._services[lifecycle].push(service);
      }
    }
  }

  async invoke(digest, context) {
    await this._serviceCycle('onInvoke', digest, context);

    return await this._clusterManager.anycast(digest, {
      type: 'REFInvoke',
      digest,
      context
    });
  }

  async invokeRoute(route, context) {
    await this._serviceCycle('onInvokeRoute', route, context);

    return this.invoke(this._internalRoutingMap.get(route), context);
  }

  async deploy(identity, source, signature) {
    const deployment = { identity, source, signature };
    await this._serviceCycle('onDeploy', deployment);
 
    // Deploy Source
    const results = await this._clusterManager.allocate(signature, source);
    this.emit('deploy', signature, source);

    return signature;
  }

  async assignRoute(route, digest) {
    this._internalRoutingMap.set(route, digest);
    await this._serviceCycle('onAssignRoute', digest);
  }

  async removeRoute(route) {
    this._internalRoutingMap.delete(route);
    await this._serviceCycle('onRemoveRoute', digest);
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

  async undeploy(digest) {
    await this._serviceCycle('onInvokeRoute', digest);

    const results = await this._clusterManager.deallocate(digest);
    this.emit('undeploy', digest);
  }

  listDeployments() {
    return Array.from(this._clusterManager.getAllocations());
  }

  get services() {
    return Services;
  }

  static get services() {
    return Services;
  }
}

module.exports = Elio;