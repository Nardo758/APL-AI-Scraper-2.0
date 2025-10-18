class RedisStub {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    return this.store.get(key) ?? null;
  }

  async set(key, value) {
    this.store.set(key, value);
  }

  async del(key) {
    this.store.delete(key);
  }
}

module.exports = RedisStub;
