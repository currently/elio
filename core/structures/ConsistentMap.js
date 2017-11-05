const HashRing = require('hashring');

/**
 * @class ConsistentMap
 * @desc The ConsistentMap Map data structure is responsible for
 * maintaining a set of providers in a hashring.
 */
class ConsistentMap {
  constructor() {
    this.map = new Map();
    this.ring = new HashRing();
  }

  _id(provider) {
    return (provider.id || provider).toString();
  }

  get size() {
    return this.map.size;
  }

  [Symbol.iterator]() {
    return this.map[Symbol.iterator]();
  }

  forEach(handler) {
    this.map.forEach(handler);
  }

  add(provider) {
    const id = this._id(provider);
    this.map.set(id, provider);
    this.ring.add(id);
  }

  get(resource) {
    return this.map.get(this.ring.get(resource));
  }

  delete(provider) {
    const id = this._id(provider);
    this.map.delete(id);
    this.ring.remove(id);
  }
}

module.exports = ConsistentMap;