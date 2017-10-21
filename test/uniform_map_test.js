const UniformDistributionMap = require('../core/structures/UniformDistributionMap');

const ITERATABLE_HAS_MEMBER = (iter, member) => {
  for (const m of iter) {
    if (m[0] === member) return true;
  }

  return false;
};

describe('Uniform Distribution Map test suite', function () {
  it('should create a new instance', function () {
    const map = new UniformDistributionMap();
    expect(map).to.have.property(Symbol.iterator);
    expect(map).to.have.property('forEach');
    expect(map).to.have.property('add');
    expect(map).to.have.property('increment');
    expect(map).to.have.property('decrement');
    expect(map).to.have.property('getNextAvailableProvider');
    expect(map).to.have.property('delete');
    expect(map[Symbol.iterator]).to.be.a('function');
    expect(map).to.have.property('size', 0);
  });

  it('should add a new provider', function () {
    const map = new UniformDistributionMap();
    map.add('test', 2);
    expect(ITERATABLE_HAS_MEMBER(map, 'test')).to.be.true;
    expect(map.getNextAvailableProvider()).to.be.eql(['test', 2]);
  });

  it('should correctly place an incremented/decremented provider', function () {
    const map = new UniformDistributionMap();
    map.add('t1');
    map.add('t2');
    map.add('t3');

    expect(ITERATABLE_HAS_MEMBER(map, 't1')).to.be.true;
    expect(ITERATABLE_HAS_MEMBER(map, 't2')).to.be.true;
    expect(ITERATABLE_HAS_MEMBER(map, 't3')).to.be.true;

    expect(map.getNextAvailableProvider()).to.be.eql(['t1', 0]);

    map.increment('t1', 2);
    expect(map.getNextAvailableProvider()).to.be.eql(['t2', 0]);

    map.increment('t2', 4);
    map.increment('t3', 4);
    expect(map.getNextAvailableProvider()).to.be.eql(['t1', 2]);

    map.decrement('t3', 4);
    expect(map.getNextAvailableProvider()).to.be.eql(['t3', 0]);

    expect(map).to.have.property('size', 3);
  });

  it('should have a minimum weight of 0', function () {
    const map = new UniformDistributionMap();
    map.add('t1');

    map.decrement('t1', 4);
    expect(map.getNextAvailableProvider()).to.be.eql(['t1', 0]);
  });

  it('should delete a provider', function () {
    const map = new UniformDistributionMap();
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

    map.increment('t1', 4);
    map.increment('t3', 4);

    expect(map.getNextAvailableProvider()).to.be.eql(['t1', 4]);
  });
});