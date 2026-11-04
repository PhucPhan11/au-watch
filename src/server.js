import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCache } from './cache.js';
import { makeHttp } from './http.js';
import { startScheduler, logEvent } from './scheduler.js';
import { openHistory } from './history.js';
import { acquireSchedulerLock } from './lock.js';
import { createHandler, createStatus } from './app.js';

const PORT = Number(process.env.PORT) || 3000;
const MIN_MINUTES = 5; // Vietcombank: at most one request every 5 minutes.
const minutes = Math.max(MIN_MINUTES, Number(process.env.REFRESH_MINUTES) || 10);
const DATA_DIR = resolve(process.env.DATA_DIR || fileURLToPath(new URL('../data', import.meta.url)));
mkdirSync(DATA_DIR, { recursive: true });

const cache = createCache(join(DATA_DIR, 'cache.json'));
await cache.load();
const history = openHistory(join(DATA_DIR, 'history.db'), { graceMs: minutes * 60_000 });
const status = createStatus();

// Only one process per data directory may run the scheduler (and write history).
const lock = acquireSchedulerLock(join(DATA_DIR, 'scheduler.lock'));
let timer = null;
if (lock) {
  status.scheduler = 'running';
  const http = makeHttp({ userAgent: process.env.USER_AGENT || 'au-watch/0.1' });
  timer = startScheduler({ cache, http, history, status, intervalMs: minutes * 60_000 });
} else {
  status.scheduler = 'standby';
  logEvent('error', 'scheduler', { state: 'standby', reason: 'another process holds the scheduler lock' });
}

const server = createServer(createHandler({ cache, history, status })).listen(PORT, () => {
  logEvent('info', 'start', { port: PORT, refresh_minutes: minutes, data_dir: DATA_DIR, scheduler: status.scheduler });
});

let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  logEvent('info', 'shutdown', { signal });
  clearInterval(timer);
  server.close();
  const finish = () => {
    try { history.close(); } catch { /* already closed */ }
    lock?.release();
    process.exit(0);
  };
  // Give an in-flight refresh a moment to finish its history write.
  setTimeout(finish, 1000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
