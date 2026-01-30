/**
 * Simple in-memory cache with TTL to reduce loading on page navigation.
 * Cache is cleared on logout so next login gets fresh data.
 */

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes for list data
const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

function set(key, data, ttlMs = CACHE_TTL_MS) {
  store.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

function invalidate(key) {
  store.delete(key);
}

function clearAll() {
  store.clear();
}

export const queryCache = {
  get,
  set,
  invalidate,
  clearAll,
  TTL: CACHE_TTL_MS,
};
