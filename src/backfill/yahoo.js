// Yahoo Finance chart API (history backfill only; not a live fetcher).
// GC=F = COMEX gold futures (USD/oz), USDVND=X = USD/VND mid-market rate.
const DEFAULT_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';

/** Chart response → [{ ts (ms), close }] sorted, null closes dropped. */
export function parseChart(raw) {
  const err = raw?.chart?.error;
  if (err) throw new Error(`Yahoo: ${err.description ?? err.code ?? 'error'}`);
  const r = raw?.chart?.result?.[0];
  const ts = r?.timestamp;
  const close = r?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(ts) || !Array.isArray(close) || ts.length !== close.length) {
    throw new Error('Yahoo: missing timestamp/close arrays');
  }
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const c = close[i];
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) out.push({ ts: ts[i] * 1000, close: c });
  }
  if (out.length === 0) throw new Error('Yahoo: no data points');
  return out.sort((a, b) => a.ts - b.ts);
}

export async function fetchChart(http, symbol, range, interval) {
  const base = process.env.YAHOO_CHART_URL || DEFAULT_URL;
  return parseChart(await http(`${base}${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`));
}
