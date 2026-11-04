import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createCache } from './cache.js';
import { makeHttp } from './http.js';
import { startScheduler } from './scheduler.js';
import { renderPage } from './render.js';

const PORT = Number(process.env.PORT) || 3000;
const MIN_MINUTES = 5; // Vietcombank: at most one request every 5 minutes.
const minutes = Math.max(MIN_MINUTES, Number(process.env.REFRESH_MINUTES) || 10);

const cache = createCache(fileURLToPath(new URL('../data/cache.json', import.meta.url)));
await cache.load();
const http = makeHttp({ userAgent: process.env.USER_AGENT || 'au-watch/0.1' });
startScheduler({ cache, http, intervalMs: minutes * 60_000 });

createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderPage(cache.all()));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Không tìm thấy');
}).listen(PORT, () => {
  console.log(`au-watch: http://localhost:${PORT} (refresh every ${minutes} min)`);
});
