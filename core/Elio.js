const vm = require('vm');
const { runInNewContext } = vm;
const crypto = require('crypto');
const anyBody = require('body/any');
const EventEmitter = require('events').EventEmitter;

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
    this._resolvers = {
      IDENTITY: (identity, callback) => callback(new Error("No Identity Resolver was registered"))
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

  setIdentityResolver(handler) {
    this._resolvers.IDENTITY = handler; 
  }

  async unsafe_deploy(digest, source, callback) {
    const results = await this._clusterManager.allocate(digest, source);
    callback(null, results);
    this.emit('deploy', digest, source);
  }

  async invoke(digest, context) {
    return await this._clusterManager.anycast(digest, {
      type: 'REFInvoke',
      digest,
      context
    });
  }

  async invokeRoute(route, context) {
    return this.invoke(this._internalRoutingMap.get(route), context);
  }

  deploy(identity, source, signature, callback) {
    // Verify Message Signature (RSA-SHA256)
    this._resolvers.IDENTITY(identity, (error, publicKey) => {
      if (error) return callback(error);
      if (!publicKey || !Buffer.isBuffer(publicKey)) return callback(new Error("Invalid identity"));

      const RSA_SHA_256 = crypto.createVerify('RSA-SHA256');
      RSA_SHA_256.update(source);

      if (RSA_SHA_256.verify(publicKey, signature, 'hex')) {
        // Override publicKey Buffer in memory
        publicKey.fill && publicKey.fill('0');
        // Deploy Source
        this.unsafe_deploy(signature, source, (error) => callback(error, signature));
      } else {
        return callback(new Error("Bad signature"));
      }
    });
  }

  assignRoute(route, digest) {
    this._internalRoutingMap.set(route, digest);
  }

  removeRoute(route) {
    this._internalRoutingMap.delete(route);
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

  async undeploy(digest, callback) {
    const results = await this._clusterManager.deallocate(digest);
    callback(null, results);
    this.emit('undeploy', digest);
  }

  listDeployments() {
    return Array.from(this._clusterManager.getAllocations());
  }
}

module.exports = Elio;