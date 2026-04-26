class SimpleCache {
  constructor(ttlMs = 5 * 60 * 1000) { // Default TTL: 5 minutes
    this.cache = new Map();
    this.ttlMs = ttlMs;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() - item.time > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }

  set(key, data) {
    this.cache.set(key, { time: Date.now(), data });
  }

  clear() {
    this.cache.clear();
  }
}

module.exports = new SimpleCache();
