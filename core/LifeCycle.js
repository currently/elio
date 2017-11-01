class LifeCycle {
  constructor(instance) {
    this.hooks = new Map();
    this.instance = instance;
  }

  add(hook, handle) {
    const hooks = this.hooks.get(hook) || [];
    // Create a unique Set from the hooks array
    const hookSet = new Set(hooks);
    // Verify that handle's hook is a function
    if (!typeof handle[hook] === 'function') throw new Error("Expected a function as a lifecycle handle");
    // Add handle to set
    hookSet.add(handle);
    // Assign back to hooks
    this.hooks.set(hook, [...hookSet]);
  }

  async trigger(hook, ...args) {
    const hooks = this.hooks.get(hook) || [];
    const hookSize = hooks.length;

    // Add instance to args
    args.push(this.instance);

    for (let i = 0; i < hookSize; i++) {
      await hooks[i][hook](...args);
    }
  }
}

module.exports = LifeCycle;