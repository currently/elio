const MapList = require('../structures/MapList');

class InMemoryPipelines {
  constructor() {
    this.pipelines = new MapList();
  }

  reset() {
    this.pipelines = new MapList();
  }

  async onCreatePipeline(name, pipeline, instance) {
    this.pipelines.push(name, pipeline);
    instance.flushShortCache();
    return true;
  }

  async onInvokePipeline(name) {
    return this.pipelines.top(name);
  }

  async onRollbackPipeline(name, instance) {
    if (!this.pipelines.has(name)) return false;
    this.pipelines.pop(name);
    instance.flushShortCache();
    return true;
  }

  get registeredHooks() {
    return [
      "onCreatePipeline",
      "onInvokePipeline",
      "onRollbackPipeline"
    ];
  }
}

module.exports = InMemoryPipelines;