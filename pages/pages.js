// GitHub Pages entry point: the visitor's browser fetches current prices directly from the
// sources (all send CORS headers except Swissquote) and renders the same page as the local app,
// without the history charts. Reuses src/ modules unchanged.
import { refreshOnce } from './src/scheduler.js';
import { renderPage } from './src/render.js';

// Fetchers read optional URL overrides from process.env; the browser has no `process`.
globalThis.process ??= { env: {} };

const RELOAD_MS = 5 * 60_000;

// Plain fetch: no custom headers, so requests stay "simple" and need no CORS preflight.
async function http(url, { method = 'GET', body, headers } = {}) {
  const res = await fetch(url, { method, body, headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

function memoryCache() {
  const slots = {};
  return { get: (k) => slots[k], set: (k, v) => { slots[k] = v; }, all: () => ({ ...slots }) };
}

async function main() {
  const cache = memoryCache();
  await refreshOnce({
    cache,
    http,
    onFetch: (e) => { if (!e.ok) console.warn(`[au-watch] ${e.source}: ${e.error}`); },
  });
  const doc = new DOMParser().parseFromString(renderPage(cache.all(), { withHistory: false }), 'text/html');
  document.head.replaceWith(doc.head);
  document.body.replaceWith(doc.body);
}

main().catch((err) => {
  console.error(err);
  const p = document.getElementById('loading');
  if (p) p.textContent = 'Không tải được giá. Vui lòng thử lại sau.';
});
setTimeout(() => location.reload(), RELOAD_MS);
