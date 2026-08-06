// Short-lived, in-memory cache for the finance module's heaviest read-only
// reports (dashboard overview, treasury analytics, anomaly report, audit
// timeline). These recompute from a school's ENTIRE financial history on
// every request (see treasuryGovernanceService.js's running-balance
// calculation for why that can't just be date-bounded), so as the amount of
// historical data grows, every load gets slower - this cache doesn't fix
// that growth, it just stops the exact same expensive computation from
// re-running for near-simultaneous or rapid repeat page loads.
//
// Freshness: entries expire after DEFAULT_TTL_MS regardless of anything
// else, so staleness is always bounded even if a write path forgets to
// invalidate. invalidateAll() is also called from the most common
// money-moving actions (see wrapAction in financeAdminActionService.js and
// the handful of other mutation routes that call it directly) so routine
// actions like approving a payment are reflected immediately, not just
// after the TTL.
//
// Deliberately whole-cache invalidation, not per-key: trying to compute
// exactly which cached report a given mutation could affect is error-prone
// (miss one path, and that report silently goes stale for the full TTL
// every time) - clearing everything is cheap since nothing recomputes until
// the next actual page view.

const DEFAULT_TTL_MS = 20000;

const store = new Map();

function buildCacheKey(prefix, params = {}) {
  const normalized = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      const value = params[key];
      if (value !== undefined && value !== null && value !== '') acc[key] = value;
      return acc;
    }, {});
  return `${prefix}:${JSON.stringify(normalized)}`;
}

function getCached(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCached(key, value, ttlMs = DEFAULT_TTL_MS) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/**
 * Runs `compute()` only on a cache miss/expiry; otherwise returns the cached
 * value immediately. `compute` must return a plain-JSON-serializable value
 * (the same object may be returned to multiple callers, so callers must not
 * mutate what they get back).
 */
async function withReportCache(key, compute, ttlMs = DEFAULT_TTL_MS) {
  const cached = getCached(key);
  if (cached !== undefined) return cached;
  const value = await compute();
  setCached(key, value, ttlMs);
  return value;
}

function invalidateAll() {
  store.clear();
}

module.exports = {
  DEFAULT_TTL_MS,
  buildCacheKey,
  getCached,
  setCached,
  withReportCache,
  invalidateAll
};
