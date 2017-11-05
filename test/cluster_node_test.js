const vm = require('vm');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events').EventEmitter;

describe('Cluster Node integration test suite', function () {
  let instance = null;
  let listener = new EventEmitter();

  before(function () {
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../watchdogs/Node.js')), {
      process: {
        on: (event, handler) => listener.on(event, handler),
        send: (...args) => listener.emit(':incoming_message', ...args)
      },
      Error,
      Buffer,
      setTimeout,
      clearTimeout,
      console,
      setInterval,
      clearInterval,
      setImmediate,
      require,
      module: {}
    });
  });

  it('should respond to ping', function (done) {
    listener.once(':incoming_message', function (message) {
      expect(message).to.have.property('type', 'ACK');
      expect(message).to.have.property('status', 'OK');
      expect(message).to.have.property('id', 'test');
      expect(message).to.have.property('response');

      done();
    });

    listener.emit('message', {
      id: 'test',
      type: 'PING'
    });
  });

  it('should deploy new source', function (done) {
    listener.once(':incoming_message', function (message) {
      expect(message).to.have.property('type', 'ACK');
      expect(message).to.have.property('status', 'OK');
      expect(message).to.have.property('id', 't2');

      done();
    });

    listener.emit('message', {
      id: 't2',
      type: 'REFDeploy',
      digest: 'DIGESTS_ARE_NOT_VERIFIED_AT_THIS_STEP',
      source: `
        module.exports = async (context) => \`\Hello \${context.name || "World"}!\`;
      `
    });
  });

  it('should invoke source', function (done) {
    listener.once(':incoming_message', function (message) {
      expect(message).to.have.property('type', 'ACK');
      expect(message).to.have.property('status', 'OK');
      expect(message).to.have.property('id', 't3');
      expect(message).to.have.property('response', 'Hello Test!');

      done();
    });

    listener.emit('message', {
      id: 't3',
      type: 'REFInvoke',
      digest: 'DIGESTS_ARE_NOT_VERIFIED_AT_THIS_STEP',
      context: {
        name: "Test"
      }
    });
  });

  it('should undeploy source', function (done) {
    listener.once(':incoming_message', function (message) {
      expect(message).to.have.property('type', 'ACK');
      expect(message).to.have.property('status', 'OK');
      expect(message).to.have.property('id', 't4');

      done();
    });

    listener.emit('message', {
      id: 't4',
      type: 'REFUndeploy',
      digest: 'DIGESTS_ARE_NOT_VERIFIED_AT_THIS_STEP'
    });
  });

  it('should not invoke undeployed source', function (done) {
    listener.once(':incoming_message', function (message) {
      expect(message).to.have.property('type', 'ACK');
      expect(message).to.have.property('status', 'ERROR');
      expect(message).to.have.property('id', 't5');

      done();
    });

    listener.emit('message', {
      id: 't5',
      type: 'REFInvoke',
      digest: 'DIGESTS_ARE_NOT_VERIFIED_AT_THIS_STEP',
      context: {
        name: "Test"
      }
    });
  });
});