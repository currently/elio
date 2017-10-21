const crypto = require('crypto');

class Signature {
  constructor(data) {
    this.identities = new Map(data);
  }

  addIdentity(name, key) {
    this.identities.set(name, key);
  }

  async onDeploy(deployment) {
    const { identity, source, signature } = deployment;
    // Verify Message Signature (RSA-SHA256)
    const publicKey = this.identities.get(identity);
    if (!publicKey || !Buffer.isBuffer(publicKey)) throw new Error("Invalid identity");
    
    const RSA_SHA_256 = crypto.createVerify('RSA-SHA256');
    RSA_SHA_256.update(source);

    if (!RSA_SHA_256.verify(publicKey, signature, 'hex')) throw new Error("Bad signature");
  }

  get registeredHooks() {
    return ["onDeploy"];
  }
}

module.exports = Signature;