// HTTP request handler (routes) and the in-memory status behind /health.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderPage } from './render.js';

const local = (rel) => fileURLToPath(new URL(rel, import.meta.url));

// Fixed whitelist of static files; nothing else is served from disk.
const ASSETS = {
  '/assets/uPlot.iife.min.js': [local('../node_modules/uplot/dist/uPlot.iife.min.js'), 'text/javascript; charset=utf-8'],
  '/assets/uPlot.min.css': [local('../node_modules/uplot/dist/uPlot.min.css'), 'text/css; charset=utf-8'],
  '/assets/charts.js': [local('./public/charts.js'), 'text/javascript; charset=utf-8'],
};

/** Per-source fetch results and scheduler state, kept in memory for /health. */
export function createStatus({ now = () => new Date() } = {}) {
  const sources = {};
  let lastHistoryWrite = null;
  return {
    scheduler: 'starting',
    recordFetch({ source, ok, duration_ms, error }) {
      const s = (sources[source] ??= { last_ok_at: null, last_error: null, last_error_at: null, last_duration_ms: null });
      const at = now().toISOString();
      s.last_duration_ms = duration_ms;
      if (ok) s.last_ok_at = at;
      else { s.last_error = error ?? 'unknown error'; s.last_error_at = at; }
    },
    recordHistoryWrite() { lastHistoryWrite = now().toISOString(); },
    snapshot() { return { sources: structuredClone(sources), last_history_write_at: lastHistoryWrite }; },
  };
}

export function healthReport({ cache, history, status }) {
  const slots = cache.all();
  const { sources, last_history_write_at } = status.snapshot();
  const slotView = Object.fromEntries(Object.values(slots).map((s) => [s.key, {
    stale: s.stale, ok_at: s.ok_at, source_used: s.source_used, ...(s.stale ? { error: s.last_error } : {}),
  }]));
  const expected = ['vn_sjc', 'vn_pnj_ring', 'world_xau', 'fx_usdvnd'];
  const healthy = status.scheduler === 'running' && expected.every((k) => slots[k] && !slots[k].stale);
  let rows = null;
  try { rows = history.count(); } catch { /* reported as null */ }
  return {
    status: healthy ? 'ok' : 'degraded',
    scheduler: status.scheduler,
    sources,
    slots: slotView,
    history: { last_write_at: last_history_write_at, rows },
  };
}

export function createHandler({ cache, history, status }) {
  const json = (res, code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET') {
      res.writeHead(405, { Allow: 'GET' });
      res.end();
      return;
    }
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderPage(cache.all()));
      return;
    }
    if (url.pathname === '/health') {
      // Always 200 while the process is up: an outage at a price source is not a reason to restart.
      json(res, 200, healthReport({ cache, history, status }));
      return;
    }
    if (url.pathname === '/api/history') {
      const range = url.searchParams.get('range') ?? '24h';
      try {
        json(res, 200, history.query(range));
      } catch (err) {
        if (err instanceof RangeError) json(res, 400, { error: 'range must be one of 24h, 7d, 30d, 1y' });
        else { console.error('[history] query failed:', err); json(res, 500, { error: 'history unavailable' }); }
      }
      return;
    }
    const asset = ASSETS[url.pathname];
    if (asset) {
      try {
        const body = await readFile(asset[0]);
        res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'public, max-age=300' });
        res.end(body);
      } catch {
        res.writeHead(500);
        res.end();
      }
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Không tìm thấy');
  };
}
