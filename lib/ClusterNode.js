// Cluster Node Daemon
const vm = require('vm');
const path = require('path');
const { runInNewContext } = vm;
const REFAllocationMap = new Map();

let NODE_CONFIG = {};
let NODE_READY = false;

const SUPPORT_ERROR = (type) => {
  return () => {
    throw new Error(`No support for ${type} in this node`);
  };
};

const LOCAL_REQUIRE = function (p) {
  const basePath = NODE_CONFIG['ELIO_MODULE_PATH'];
};

let NODE_CAPABILITIES = {
  require: false,
  Buffer: true
};

const ALLOCATE_REF = (digest, ref) => {
  REFAllocationMap.set(digest, ref);
};

const DEALLOCATE_REF = (digest) => {
  REFAllocationMap.delete(digest);
};

const REF_DEPLOY = (digest, source, callback) => {
  const sandbox = {
    module: {},
    console: console, /** @todo: Replace console with output stream */
    setTimeout,
    clearTimeout,
    setImmediate,
    Buffer: (NODE_CAPABILITIES.Buffer)
      ? Buffer
      : SUPPORT_ERROR("Buffer"),
    require: (NODE_CAPABILITIES.require)
      ? LOCAL_REQUIRE
      : SUPPORT_ERROR("require")
  };
  runInNewContext(new Buffer(source).toString('utf8'), sandbox);

  (function (allocate, callback) {
    allocate(digest, sandbox.module.exports);
    callback(null, digest);
  })(ALLOCATE_REF, callback);
};

const REF_UNDEPLOY = function (digest, callback) {
  callback(null, DEALLOCATE_REF(digest));
};

const REF_INVOKE_FROM_ALLOCATION = function (digest, context, callback) {
  REFAllocationMap.get(digest)(context || {}, callback);
};

const REF_INVOKE = (digest, context, callback) => {
  try {
    if (REFAllocationMap.has(digest)) REF_INVOKE_FROM_ALLOCATION(digest, context, callback);
    else {
      const error = new Error("Digest was not found");
      error.code = 404;
      callback(error);
    }
  } catch (error) {
    callback(error);
  }
};

const SET_CONFIG = (config, callback) => {
  NODE_CONFIG = config;
  NODE_CAPABILITIES = {
    require: config['ELIO_MODULE_PATH'] && (config['ELIO_MODULE_PATH'].length > 1),
    Buffer: true
  };

  callback(null, {
    capabilities: NODE_CAPABILITIES
  });
};

const HANDLE_REF_ACK_FACTORY = (id) => (error, response, meta) => {
  if (!process.send) return;
  else if (error) return process.send({ type: 'ACK', id, error: error.message, errorCode: error.code, status: 'ERROR' });
  else return process.send({ type: 'ACK', id, response, status: 'OK', meta });
};

const HANDLE_IPC_MESSAGE = function (packet) {
  if (!packet || (typeof packet !== 'object') || !packet.type) return;

  switch (packet.type) {
    case 'REFDeploy':
      return REF_DEPLOY(packet.digest, packet.source, HANDLE_REF_ACK_FACTORY(packet.id));

    case 'REFInvoke':
      return REF_INVOKE(packet.digest, packet.context, HANDLE_REF_ACK_FACTORY(packet.id));

    case 'REFUndeploy':
      return REF_UNDEPLOY(packet.digest, HANDLE_REF_ACK_FACTORY(packet.id));

    case 'SET_CONFIG':
      return SET_CONFIG(packet.config, HANDLE_REF_ACK_FACTORY(packet.id));

    case 'PING':
      return HANDLE_REF_ACK_FACTORY(packet.id)(null, { pong: true });
  }
};

process.on('uncaughtException', (error) => {
  process.send({ type: 'uncaughtException', error, status: 'ERROR' })
});

process.on('message', HANDLE_IPC_MESSAGE);

module.exports = HANDLE_IPC_MESSAGE;