// Minimal fetch wrapper: one attempt, timeout, explicit User-Agent.
// Returns parsed JSON by default, or the raw body with { as: 'text' } (HTML sources).
export function makeHttp({ userAgent = 'au-watch/0.1', timeoutMs = 10_000, fetchImpl = fetch } = {}) {
  return async function request(url, { method = 'GET', body, headers = {}, as = 'json' } = {}) {
    const res = await fetchImpl(url, {
      method,
      body,
      headers: { 'User-Agent': userAgent, Accept: as === 'text' ? 'text/html' : 'application/json', ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    const text = await res.text();
    if (as === 'text') return text;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response from ${new URL(url).host}`);
    }
  };
}
