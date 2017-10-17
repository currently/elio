const Elio = require('../Elio');
const request = require('request');
const crypto = require('crypto');

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
    } catch (error) {
      callback(error);
    }
  });
};

describe('Elio Integration Test Suite', function () {
  const port = 8090;
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

    elio.setIdentityResolver((identity, callback) => {
      if (identity === 'test') return callback(null, Buffer.from(publicKey));
      else if (identity === 'banned_identity') return callback(new Error("Identity was banned"));
      else return callback();
    });

    elio.on('ready', done);
  });

  it('should create a new instance', function () {
    expect(elio).to.have.property('deploy');
    expect(elio).to.have.property('undeploy');
    expect(elio).to.have.property('invoke');
    expect(elio).to.have.property('listDeployments');
  });

  it('should deploy new function', function (done) {
    const source = `
      module.exports = async (context) => ({
        result: context.name || "echo"
      });
    `;
    elio.deploy('test', source, signSource(source), (error, digest) => {
      expect(error).to.be.null;
      expect(digest).to.be.equal(signSource(source));
      f1_digest = digest;
      done();
    });
  });

  it('should reject a bad identity', function (done) {
    const source = `console.log("test")`;
    elio.deploy('bad_identity', source, signSource(source), (error, digest) => {
      expect(error).to.not.be.null;
      expect(error).to.have.property("message", "Invalid identity");
      expect(digest).to.be.undefined;
      done();
    });
  });

  it('should reject a bad signature', function (done) {
    const source = `console.log("test")`;
    elio.deploy('test', source, signSource(source + '; console.log("BADCODE")'), (error, digest) => {
      expect(error).to.not.be.null;
      expect(error).to.have.property("message", "Bad signature");
      expect(digest).to.be.undefined;
      done();
    });
  });

  it('should have passthrough errors for identity resolver', function (done) {
    const source = `console.log("test")`;
    elio.deploy('banned_identity', source, signSource(source), (error, digest) => {
      expect(error).to.not.be.null;
      expect(error).to.have.property("message", "Identity was banned");
      expect(digest).to.be.undefined;
      done();
    });
  });

  it('should list function under available deployments', function () {
    expect(elio.listDeployments().map((r) => r[0])).to.have.members([f1_digest]);
  });

  it('should invoke a function through local API', async () => {
    const response = await elio.invoke(f1_digest, { name: 'test' });
    expect(response).to.eql({
      result: 'test'
    });
  });

  it('should undeploy a function', function (done) {
    elio.undeploy(f1_digest, function (error) {
      if (error) throw error;

      expect(elio.listDeployments().map((r) => r[0])).to.not.have.members([f1_digest]);
      done();
    });
  });
});