import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createCache } from './cache.js';
import { makeHttp } from './http.js';
import { startScheduler } from './scheduler.js';
import { renderPage } from './render.js';
import { openHistory } from './history.js';

const PORT = Number(process.env.PORT) || 3000;
const MIN_MINUTES = 5; // Vietcombank: at most one request every 5 minutes.
const minutes = Math.max(MIN_MINUTES, Number(process.env.REFRESH_MINUTES) || 10);

const local = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const cache = createCache(local('../data/cache.json'));
await cache.load();
const history = openHistory(local('../data/history.db'), { graceMs: minutes * 60_000 });
const http = makeHttp({ userAgent: process.env.USER_AGENT || 'au-watch/0.1' });
startScheduler({ cache, http, history, intervalMs: minutes * 60_000 });

// Fixed whitelist of static files; nothing else is served from disk.
const ASSETS = {
  '/assets/uPlot.iife.min.js': [local('../node_modules/uplot/dist/uPlot.iife.min.js'), 'text/javascript; charset=utf-8'],
  '/assets/uPlot.min.css': [local('../node_modules/uplot/dist/uPlot.min.css'), 'text/css; charset=utf-8'],
  '/assets/charts.js': [local('./public/charts.js'), 'text/javascript; charset=utf-8'],
};

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
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
}).listen(PORT, () => {
  console.log(`au-watch: http://localhost:${PORT} (refresh every ${minutes} min)`);
});
