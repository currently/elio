class Package {
  constructor() {

  }
  
  async onDeploy(deployment) {
    const { dependencies } = deployment;
    if (!Array.isArray(dependencies) || !dependencies.length) return;

    /** @todo: Add package installaion */
  }

  async onNodeOnline(node, cluster) {
    const registered = await cluster.unicast({
      type: "EXPAND_SANDBOX",
      source: `
        module.exports = async (sandbox) => {
          sandbox.x = 2;
        };
      `
    }, node);
  }

  get registeredHooks() {
    return ["onNodeOnline"];
  }
}

module.exports = Package;