const SortedSet = require('../core/structures/SortedSet');

const ITERATABLE_HAS_MEMBER = (iter, member) => {
  for (const m of iter) {
    if (m[0] === member) return true;
  }

  return false;
};

const ITERATABLE_IS_SORTED = (iter, compareFn) => {
  let lastItem = null;
  
  for (const m of iter) {
    if (!lastItem) {
      lastItem = m;
      continue;
    }
    if (compareFn(lastItem, m) === false) return false;
    lastItem = m;
  }

  return true;
};

describe('Sorted Set test suite', function () {
  it('should create a new instance', function () {
    const set = new SortedSet();
    expect(set).to.have.property(Symbol.iterator);
    expect(set).to.have.property('forEach');
    expect(set).to.have.property('add');
    expect(set).to.have.property('getWeight');
    expect(set).to.have.property('delete');
    expect(set[Symbol.iterator]).to.be.a('function');
    expect(set).to.have.property('size', 0);
  });

  it('should add a new item', function () {
    const set = new SortedSet();
    set.add('test', 2);
    expect(ITERATABLE_HAS_MEMBER(set, 'test')).to.be.true;
  });

  it('should increase in size', function () {
    const set = new SortedSet();
    expect(set).to.have.property('size', 0);
    set.add('test', 2);
    expect(set).to.have.property('size', 1);
    set.add('test2', 2);
    expect(set).to.have.property('size', 2);
  });

  it('should accept multiple items and sort them', function () {
    const set = new SortedSet();
    
    for (let i = 0; i < 10; i++) {
      set.add(`#${i}`, Math.floor(Math.random() * 10));
    }

    expect(ITERATABLE_IS_SORTED(set, (m1, m2) => m1[1] <= m2[1])).to.be.true;
  });

  it('should return the weight of an item', function () {
    const set = new SortedSet();
    set.add('test', 2);
    set.add('test2', 32);
    set.add('test3', 0);
    expect(set.getWeight('test2')).to.be.equal(32);
  });

  it('should delete an item', function () {
    const set = new SortedSet();
    set.add('test', 1);
    set.add('test2', 2);
    set.add('test3', 3);
    set.delete('test2');
    expect(set.getWeight('test2')).to.be.undefined;
    expect(set.getWeight('test')).to.be.equal(1);
    expect(set.getWeight('test3')).to.be.equal(3);
  });
});