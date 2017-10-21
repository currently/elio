/**
 * @class SortedSet
 * @desc SortedSet data structure uses a Map and a sorted
 * array to keep a sorted set of weighed unique items
 */
class SortedSet {
  constructor() {
    this.map = new Map();
    this.sortedArray = [];
  }

  [Symbol.iterator]() {
    return this.sortedArray[Symbol.iterator]();
  }

  get size() {
    return this.map.size;
  }

  forEach(handler) {
    this.sortedArray.forEach((col) => handler(col[0], col[1]));
  }

  add(item, weight) {
    this.map.set(item, weight);
    this._sort();
  }

  getWeight(item) {
    return this.map.get(item);
  }

  delete(item) {
    this.map.delete(item);
    this._sort();
  }

  _sort() {
    this.sortedArray = [...this.map].sort((a, b) => a[1] - b[1]);
  }
}

module.exports = SortedSet;