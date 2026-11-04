// /health, per-fetch reporting and the single-scheduler lock. No network, temp files only.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createCache } from '../src/cache.js';
import { openHistory } from '../src/history.js';
import { refreshOnce } from '../src/scheduler.js';
import { createHandler, createStatus } from '../src/app.js';
import { acquireSchedulerLock } from '../src/lock.js';
import * as pnj from '../src/fetchers/pnj.js';
import * as goldapi from '../src/fetchers/goldapi.js';
import * as swissquote from '../src/fetchers/swissquote.js';
import * as vcb from '../src/fetchers/vcb.js';
import * as erapi from '../src/fetchers/erapi.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const fake = (mod, file, down) => ({
  source: mod.source,
  fetch: async () => {
    if (down.has(file)) throw new Error('connect ECONNREFUSED');
    return mod.parse(fixture(`${file}.json`));
  },
});
const fakeFetchers = (down = new Set()) => ({
  pnj: fake(pnj, 'pnj', down), goldapi: fake(goldapi, 'goldapi', down), swissquote: fake(swissquote, 'swissquote', down),
  vcb: fake(vcb, 'vcb', down), erapi: fake(erapi, 'erapi', down),
});

let dir;
let history;
let server;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'au-watch-health-'));
  history = openHistory(join(dir, 'history.db'));
});
afterEach(async () => {
  if (server) await new Promise((r) => server.close(r));
  server = null;
  history.close();
  rmSync(dir, { recursive: true, force: true });
});

async function getHealth(deps) {
  server = createServer(createHandler(deps));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/health`);
  return { code: res.status, body: await res.json() };
}

async function refreshWith(down) {
  const cache = createCache(null);
  const status = createStatus();
  status.scheduler = 'running';
  const slots = await refreshOnce({ cache, http: null, fetchers: fakeFetchers(down), onFetch: (e) => status.recordFetch(e) });
  history.record(slots);
  status.recordHistoryWrite();
  return { cache, status };
}

test('/health: all sources ok', async () => {
  const deps = await refreshWith(new Set());
  const { code, body } = await getHealth({ ...deps, history });
  assert.equal(code, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.scheduler, 'running');
  for (const s of ['pnj', 'goldapi', 'vcb']) {
    assert.ok(body.sources[s].last_ok_at, `${s} last_ok_at`);
    assert.equal(body.sources[s].last_error, null);
    assert.equal(typeof body.sources[s].last_duration_ms, 'number');
  }
  // Fallbacks are only called when a primary fails.
  assert.equal(body.sources.swissquote, undefined);
  assert.equal(body.slots.vn_sjc.stale, false);
  assert.equal(body.history.rows, 4);
  assert.ok(body.history.last_write_at);
});

test('/health: failing source → degraded with reason, still HTTP 200', async () => {
  const deps = await refreshWith(new Set(['pnj']));
  const { code, body } = await getHealth({ ...deps, history });
  assert.equal(code, 200);
  assert.equal(body.status, 'degraded');
  assert.equal(body.sources.pnj.last_ok_at, null);
  assert.match(body.sources.pnj.last_error, /ECONNREFUSED/);
  assert.ok(body.sources.pnj.last_error_at);
  assert.equal(body.slots.vn_pnj_ring.stale, true);
  assert.match(body.slots.vn_pnj_ring.error, /pnj: connect ECONNREFUSED/);
  assert.equal(body.slots.world_xau.stale, false);
});

test('/health: primary down → fallback reported per source', async () => {
  const deps = await refreshWith(new Set(['goldapi']));
  const { body } = await getHealth({ ...deps, history });
  assert.match(body.sources.goldapi.last_error, /ECONNREFUSED/);
  assert.ok(body.sources.swissquote.last_ok_at);
  assert.equal(body.slots.world_xau.source_used, 'swissquote');
  assert.equal(body.status, 'ok');
});

test('/health: before the first fetch and on a standby process', async () => {
  const status = createStatus();
  status.scheduler = 'standby';
  const { code, body } = await getHealth({ cache: createCache(null), history, status });
  assert.equal(code, 200);
  assert.equal(body.status, 'degraded');
  assert.equal(body.scheduler, 'standby');
  assert.deepEqual(body.sources, {});
  assert.deepEqual(body.history, { last_write_at: null, rows: 0 });
});

test('scheduler lock: second holder is refused until the first releases', () => {
  const file = join(dir, 'scheduler.lock');
  const first = acquireSchedulerLock(file);
  assert.ok(first, 'first acquire succeeds');
  assert.equal(acquireSchedulerLock(file), null, 'second acquire is refused');
  first.release();
  const again = acquireSchedulerLock(file);
  assert.ok(again, 'acquire succeeds after release');
  again.release();
});
