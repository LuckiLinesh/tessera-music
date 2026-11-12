/* A small TTL cache plus a shared coalescer. Serverless instances are recycled
   often, so this is an optimisation rather than a guarantee - which is fine,
   because every upstream call is also rate-limited on its own. */

const store = new Map();
const inflight = new Map();
const MAX_ENTRIES = 400;

export const cacheGet = (key) => {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
};

export const cacheSet = (key, value, ttlMs = 10 * 60 * 1000) => {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
};

/** Run `fn` once per key even when several requests ask at the same moment. */
export const once = (key, fn) => {
  if (inflight.has(key)) return inflight.get(key);
  const promise = Promise.resolve()
    .then(fn)
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
};

export const cached = (key, ttlMs, fn) => {
  const hit = cacheGet(key);
  if (hit !== undefined) return Promise.resolve(hit);
  return once(key, () => fn().then((value) => cacheSet(key, value, ttlMs)));
};

export const cacheStats = () => ({ entries: store.size });
