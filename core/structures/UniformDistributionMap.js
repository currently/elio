const SortedSet = require('./SortedSet');

/**
 * @class UniformDistributionMap
 * @desc The UniformDistribution Map data structure is responsible for
 * maintaining a set of providers with a total load number of allocated
 * resources for least executed resource balancing between providers.
 */
class UniformDistributionMap {
  constructor() {
    this.sortedSet = new SortedSet();
  }

  get size() {
    return this.sortedSet.size;
  }

  [Symbol.iterator]() {
    return this.sortedSet[Symbol.iterator]();
  }

  forEach(handler) {
    this.sortedSet.forEach(handler);
  }

  add(provider, defaultWeight) {
    this.sortedSet.add(provider, defaultWeight || 0);
  }

  increment(provider, total) {
    this.sortedSet.add(provider, (this.sortedSet.getWeight(provider) || 0) + (total || 1));
  }

  decrement(provider, total) {
    this.sortedSet.add(provider, Math.max(0, (this.sortedSet.getWeight(provider) || 0) - (total || 1)));
  }

  getNextAvailableProvider(resource) {
    return this.sortedSet[Symbol.iterator]().next().value;
  }

  delete(provider) {
    this.sortedSet.delete(provider);
  }
}

module.exports = UniformDistributionMap;