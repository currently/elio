# elio
Full-blown, fully open-source server-less infrastructure for Node.js that can run anywhere, anytime and at any scale.

## Architecture
Elio was built from ground up to rely on short-running processes called *Nodes* that handle numerous functions under the same VM. This means that optimization passes done by a VM can apply to the entire session.

## Getting Started
```javascript
const Elio = require('elio');
const crypto = require('crypto');
const { InMemoryPipelines } = Elio.services;

const elio = new Elio({
  maxNodes: 3, // Total number of concurrent workers (should be higher than core count for redundancy)
  ttl: 30000 // Maximum execution time for functions
});

// In Memory Storage
elio.use(new InMemoryPipelines());

const source = `
  module.exports = async (context) => ({
    result: context.name || "echo"
  });
`;
const sourceSHA1 = crypto.createHash('sha1').update(source).digest("hex");

// Emitted after at least one Node is online
elio.on('ready', async () => {
  await elio.deploy('myFunction', source, sourceSHA1);
  const result = await elio.invoke(sourceSHA1, { name: 'test' });
  console.log(result);
});

/* Output: 
{
  result: "test"
}
*/
```

## Extending Elio
Features such as NPM support and signing are available as Elio services:

```javascript
const Elio = require('elio');
const { Signature } = Elio.services;

const elio = new Elio();

// Requires digest to be a signature of source code signed by a key pair
elio.use(new Signature([["userA", Buffer.from(publicKey)]]));
```

## Services
- Package (support for NPM)
- Signature (key pair signing for all deployments)

## Roadmap
- Support for pipelines
- Support for A/B
- API for custom services
- Rollbacks

## License
[MIT License](./LICENSE)