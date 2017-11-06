const fs = require('fs');
const npmi = require('npmi');
const getPackageJson = require('get-package-json-from-registry');

class Package {
  constructor(packageDirectory) {
    if (!fs.existsSync(packageDirectory)) fs.mkdirSync(packageDirectory);
    this.packageDirectory = packageDirectory;
  }
  
  async onDeploy(deployment) {
    let { dependencies } = deployment;
    if (!Array.isArray(dependencies) || !dependencies.length) return;

    dependencies.map((dependency) => new Promise(async (resolve, reject) => {
      const { name, version } = await getPackageJson(dependency);
      npmi({
        name, 
        version,
        path: this.packageDirectory
      }, (error, results) => {
        if (error) return reject(error);
        resolve(results);
      })
    }));

    await Promise.all(dependencies);
  }

  async onNodeOnline(node, cluster) {
    const registered = await cluster.unicast({
      type: "EXPAND_SANDBOX",
      source: `
        const path = require('path');
        const { resolve } = require;
        const packageDirectory = "${this.packageDirectory}/node_modules/";
        const core = new Set(['util', 'assert', 'crypto', 'dns', 'events', 'path', 'querystring', 'stream', 'url', 'zlib']);

        module.exports = async (sandbox) => {
          sandbox.require = function ELIO_RESOLVER(package) {
            if (core.has(package)) return require(package);
            const cleanPackage = path.normalize(package);
            const packagePath = path.join(packageDirectory, cleanPackage);
            const resolvedPath = resolve(packagePath);
            return require(resolvedPath);
          };
        };
      `
    }, node);
  }

  get registeredHooks() {
    return ["onNodeOnline", "onDeploy"];
  }
}

module.exports = Package;