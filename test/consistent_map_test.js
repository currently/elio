const ConsistentMap = require('../core/structures/ConsistentMap');

const ITERATABLE_HAS_MEMBER = (iter, member) => {
  for (const m of iter) {
    if (m[0] === member) return true;
  }

  return false;
};

describe('Consistent Map test suite', function () {
  it('should create a new instance', function () {
    const map = new ConsistentMap();
    expect(map).to.have.property(Symbol.iterator);
    expect(map).to.have.property('forEach');
    expect(map).to.have.property('add');
    expect(map).to.have.property('get');
    expect(map).to.have.property('delete');
    expect(map[Symbol.iterator]).to.be.a('function');
    expect(map).to.have.property('size', 0);
  });

  it('should add a new provider', function () {
    const map = new ConsistentMap();
    map.add('test');
    expect(ITERATABLE_HAS_MEMBER(map, 'test')).to.be.true;
    expect(map.get('x')).to.be.eql('test');
  });

  it('should distribute in the map', function () {
    const map = new ConsistentMap();
    map.add('t1');
    map.add('t2');
    map.add('t3');
    map.add('t4');
    map.add('t5');

    expect(ITERATABLE_HAS_MEMBER(map, 't1')).to.be.true;
    expect(ITERATABLE_HAS_MEMBER(map, 't2')).to.be.true;
    expect(ITERATABLE_HAS_MEMBER(map, 't3')).to.be.true;
    expect(ITERATABLE_HAS_MEMBER(map, 't4')).to.be.true;
    expect(ITERATABLE_HAS_MEMBER(map, 't5')).to.be.true;

    const first = map.get('x');

    expect(map.get('y')).to.not.be.equal(first);
    expect(map.get('x')).to.be.equal(first);
  });

  it('should delete a provider', function () {
    const map = new ConsistentMap();
    map.add('t1');
    map.add('t2');
    map.add('t3');

    expect(ITERATABLE_HAS_MEMBER(map, 't1')).to.be.true;
    expect(ITERATABLE_HAS_MEMBER(map, 't2')).to.be.true;
    expect(ITERATABLE_HAS_MEMBER(map, 't3')).to.be.true;

    map.delete('t2');

    expect(ITERATABLE_HAS_MEMBER(map, 't1')).to.be.true;
    expect(ITERATABLE_HAS_MEMBER(map, 't2')).to.be.false;
    expect(ITERATABLE_HAS_MEMBER(map, 't3')).to.be.true;

    map.delete('t3');

    expect(map.get('x')).to.be.eql('t1');
  });
});