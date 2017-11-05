class MapSet {
  constructor() {
    this.map = new Map();
  }

  set(key, ...values) {
    this.map.set(key, new Set(values));
  }

  add(key, value) {
    const set = this.map.get(key) || new Set();
    set.add(value);
    this.map.set(key, set);
  }

  remove(key, value) {
    if (!this.map.has(key)) return false;

    const set = this.map.get(key);
    set.delete(value);
    this.map.set(key, set);

    return true;
  }

  delete(key) {
    return this.map.delete(key);
  }

  has(key, value) {
    const set = this.map.get(key);
    return set && set.has(value);
  }
}

module.exports = MapSet;