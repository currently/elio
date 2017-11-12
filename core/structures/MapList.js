class MapList {
  constructor() {
    this.map = new Map();
  }

  set(key, ...values) {
    this.map.set(key, values);
  }

  top(key) {
    const list = this.map.get(key);
    if (!list || !list.length) return null;
    return list[list.length - 1];
  }

  bottom(key) {
    const list = this.map.get(key);
    if (!list || !list.length) return null;
    return list[0];
  }

  push(key, value) {
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key).push(value);  
  }

  pop(key) {
    return (this.map.get(key) || []).pop();
  }

  unshift() {
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key).unshift(value);  
  }

  shift() {
    return (this.map.get(key) || []).shift();
  }

  delete(key) {
    return this.map.delete(key);
  }

  has(key) {
    return this.map.has(key) && this.map.get(key).length;
  }

  indexOf(key, value) {
    return (this.map.get(key) || []).indexOf(value);
  }
}

module.exports = MapList;