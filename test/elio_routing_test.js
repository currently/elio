const Elio = require('../core/Elio');
const request = require('request');
const crypto = require('crypto');
const { Signature } = Elio.services;

const privateKey =
`-----BEGIN RSA PRIVATE KEY-----
MIICXAIBAAKBgQCrGNI30r9R9XDZw6GuVrVxLgd+Em96NEwkQW53ihfU9/vbzajL
pzIanVxF7fMIvR21PrJk4SUYT9jIL1qkLZ2YSR0Fhtco+18yl53UQyw20xlol1qr
bJFINao9Bj8J7U+WTpzK1Xrxn3ylYCXnbAVBOxACxGqBnXDLJxwBww0A/wIDAQAB
AoGBAIU/73hKSXYrEJiII4MDRIvArVUiRm+GC0axLrcqdSUHfL7SjIMO05amtxY/
GufTYS+mhIjMT3d/t/Uv7Aew/uo1BJno+sx5PU5ntKq7j3Kj9QHZMqz4pFqwswyS
X0fFBPfJYqXRwqyFKpH3kN3sE+VueKbYLhmZF8e8ZO9ArtgBAkEA06Jxwc5YAyuc
T3Cz8CRIPrGFyyfb7CWe6fmn0GWscmBf2bhkg0/nkEd0i0SLZiDz0TM0wQijZRrC
c0l51Z6m3wJBAM725Bziq3jf7Wi+IJBfLG+c0oQHw+OGDA8cnTVO4bZBkOhSG0Ou
LX2tc23S95B5zVJHRVeKYsIeqCPJ90mRieECQEztSUhXRuqwGXtOzjlGFvSi9q0n
6ermqeMGmpdHve09Vtn/Cpoom1V4g8Zzve/7nmS2pkBccXg4x+G8HYsmxiUCQFrr
3aTO85OjlFGajQW/ue7Cjz0PiEARKIUPBgVgRQpjXXyibXXbNALtSzNpJfcje071
HoJpuh8bhrRKSsfYFyECQC95Obs1Nt/Rgfodm0Sf/ZbFwHqKJRXs1sGbW2JnrQvL
tZwMednOBZB58DJC9zUTgWU9+q4qQqKUBtW9xDzE26o=
-----END RSA PRIVATE KEY-----`;

const publicKey = 
`-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCrGNI30r9R9XDZw6GuVrVxLgd+
Em96NEwkQW53ihfU9/vbzajLpzIanVxF7fMIvR21PrJk4SUYT9jIL1qkLZ2YSR0F
htco+18yl53UQyw20xlol1qrbJFINao9Bj8J7U+WTpzK1Xrxn3ylYCXnbAVBOxAC
xGqBnXDLJxwBww0A/wIDAQAB
-----END PUBLIC KEY-----`;

const GET_JSON_FROM_RESPONSE = (response, callback) => {
  let body = "";
  response.on('data', (chunk) => body += chunk);
  response.on('end', function () {
    try {
      let data = JSON.parse(body);
      callback(null, data);
    } catch(error) {
      callback(error);
    }
  });
};

describe('Elio Routing Test Suite', function () {
  this.timeout(5000);
  const port = 8091;
  let elio, f1_digest, f2_digest;
  const signSource = (source) => {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(source);
    return sign.sign(Buffer.from(privateKey)).toString('hex')
  };

  before(function (done) {
    elio = new Elio({
      port,
      maxNodes: 3,
      ttl: 30000
    });

    elio.use(new Signature([["test", Buffer.from(publicKey)]]));

    elio.on('ready', done);
  });

  it('should create a new instance', function () {
    expect(elio).to.have.property('deploy');
    expect(elio).to.have.property('undeploy');
    expect(elio).to.have.property('invoke');
    expect(elio).to.have.property('listDeployments');
  });

  it('should deploy new functions', async () => {
    const s1 = `
      module.exports = async (context) => ({
        result: context.name || "echo"
      });
    `;
    const s2 = `
      module.exports = async (context) => ({
        result: context.name || "echo",
        type: 's2'
      });
    `;
    const digest = await elio.deploy('test', s1, signSource(s1));
    f1_digest = digest;
    const digest2 = await elio.deploy('test', s2, signSource(s2));
    f2_digest = digest2;
    expect(elio.listDeployments().map((r) => r[0])).to.have.members([f1_digest, f2_digest]);
  });

  it('should create a route for the function', async () => {
    await elio.createPipeline('my_test_function', [f1_digest]);
    expect(await elio.readPipeline('my_test_function')).to.eql([f1_digest]);
  });

  it('should pipeline functions', async () => {
    const s1 = `
      module.exports = async ({ value }) => ({ value: value * 2 });
    `;
    const digest = await elio.deploy('test', s1, signSource(s1));
    await elio.createPipeline('multiply', [digest, digest, digest]);
    
    const response = await elio.invokePipeline('multiply', { value: 2 });
    expect(response.value).to.be.equal(Math.pow(2, 4));
  });

  it('should pile pipelines', async () => {
    const s1 = `
      module.exports = async ({ value }) => ({ value: value * 2.5 });
    `;
    const digest = await elio.deploy('test', s1, signSource(s1));
    await elio.createPipeline('multiply', [digest, digest]);
    
    const response = await elio.invokePipeline('multiply', { value: 4 });
    expect(response.value).to.be.equal(25);
  });

  it('should rollback pipelines', async () => {
    await elio.rollbackPipeline('multiply');
    
    const response = await elio.invokePipeline('multiply', { value: 4 });
    expect(response.value).to.be.equal(Math.pow(2, 5));
  });

  it('should support sampling in pipelines', async () => {
    const s1 = `module.exports = async ({ value }) => ({ value: value * 2 });`;
    const s2 = `module.exports = async ({ value }) => ({ value: value * 3 });`;
    const timesTwo = await elio.deploy('test', s1, signSource(s1));
    const timesThree = await elio.deploy('test', s2, signSource(s2));
    await elio.createPipeline('multiply', [{
      type: "SPLIT",
      spec: {
        [timesTwo]: 0.3,
        [timesThree]: 0.7
      }
    }]);

    // Run in parallel
    let runList = [];
    let runs = {
      [timesTwo]: 0,
      [timesThree]: 0,
      total: 0,
      expected: 500
    };

    for (let i = 0; i < runs.expected; i++) {
      runList.push(new Promise(async (resolve, reject) => {
        try {
          const { value: response } = await elio.invokePipeline('multiply', { value: 2 });
          runs.total++;
          if (response === 6) {
            runs[timesThree]++;
          } else if (response === 4) {
            runs[timesTwo]++;
          } else {
            throw new Error(`Bad response ${response}`);
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      }));
    }

    await Promise.all(runList);

    expect(runs.total).to.be.equal(runs.expected);
    expect(runs[timesTwo] + runs[timesThree]).to.be.equal(runs.expected);
    expect(runs[timesTwo]/runs.expected).to.be.closeTo(0.3, 0.07);   
    expect(runs[timesThree]/runs.expected).to.be.closeTo(0.7, 0.07);    
  });

  it('should invoke a function through local API', async () => {
    const response = await elio.invokePipeline('my_test_function', { name: 'test' });
    expect(response).to.eql({
      result: 'test'
    });
  });

  it('should swap a route', async () => {
    await elio.createPipeline('my_test_function', [f2_digest]);

    const response = await elio.invokePipeline('my_test_function', { name: 'test' });
    expect(response).to.eql({
      result: 'test',
      type: 's2'
    });
  });
});