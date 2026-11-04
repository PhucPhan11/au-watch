// Minimal fetch wrapper: one attempt, timeout, explicit User-Agent, JSON body.
export function makeHttp({ userAgent = 'au-watch/0.1', timeoutMs = 10_000, fetchImpl = fetch } = {}) {
  return async function request(url, { method = 'GET', body, headers = {} } = {}) {
    const res = await fetchImpl(url, {
      method,
      body,
      headers: { 'User-Agent': userAgent, Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response from ${new URL(url).host}`);
    }
  };
}
