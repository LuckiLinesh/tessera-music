/* Upstream etiquette. MusicBrainz allows one request per second per client and
   asks for a descriptive User-Agent; their search service also returns 503 when
   busy, so requests are serialised and retried with backoff. */

export const USER_AGENT =
  process.env.MUSICBRAINZ_USER_AGENT ||
  'TesseraCatalog/1.0 ( https://github.com/tessera-catalog )';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const queue = (() => {
  let chain = Promise.resolve();
  let last = 0;

  return (task, spacingMs) => {
    const run = chain.then(async () => {
      const wait = Math.max(0, last + spacingMs - Date.now());
      if (wait) await sleep(wait);
      last = Date.now();
      return task();
    });
    // Keep the chain alive even when a task rejects.
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
})();

export class UpstreamError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * Fetch JSON with a timeout and a hard byte guard.
 * `spacingMs` serialises requests for sources with strict per-client limits.
 */
export const fetchJson = async (
  url,
  { headers = {}, timeout = 9000, tries = 2, spacingMs = 0, retryOn = [429, 502, 503, 504] } = {},
) => {
  const attempt = async (n) => {
    const call = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const res = await fetch(url, {
          headers: { accept: 'application/json', 'user-agent': USER_AGENT, ...headers },
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new UpstreamError(`${new URL(url).host} responded ${res.status}`, {
            status: res.status,
            retryable: retryOn.includes(res.status),
          });
        }
        const text = await res.text();
        if (text.length > 4_000_000) throw new UpstreamError('Response too large');
        return JSON.parse(text);
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      return spacingMs ? await queue(call, spacingMs) : await call();
    } catch (error) {
      const retryable = error?.retryable || error?.name === 'AbortError' || error?.name === 'TypeError';
      if (n < tries - 1 && retryable) {
        await sleep(600 * (n + 1));
        return attempt(n + 1);
      }
      throw error;
    }
  };

  return attempt(0);
};
