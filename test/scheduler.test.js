import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCache } from '../src/cache.js';
import { refreshOnce } from '../src/scheduler.js';
import { renderPage } from '../src/render.js';
import * as pnj from '../src/fetchers/pnj.js';
import * as goldapi from '../src/fetchers/goldapi.js';
import * as swissquote from '../src/fetchers/swissquote.js';
import * as vcb from '../src/fetchers/vcb.js';
import * as erapi from '../src/fetchers/erapi.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

// Fake fetchers built on the real parsers + fixtures. `down` lists sources that fail.
function fakeFetchers(down = new Set(), counts = {}) {
  const make = (mod, file) => ({
    source: mod.source,
    fetch: async () => {
      counts[file] = (counts[file] ?? 0) + 1;
      if (down.has(file)) throw new Error('connect ECONNREFUSED');
      return mod.parse(fixture(`${file}.json`));
    },
  });
  return {
    pnj: make(pnj, 'pnj'),
    goldapi: make(goldapi, 'goldapi'),
    swissquote: make(swissquote, 'swissquote'),
    vcb: make(vcb, 'vcb'),
    erapi: make(erapi, 'erapi'),
  };
}

test('all slots filled; SJC row comes from PNJ; PNJ fetched once per cycle', async () => {
  const cache = createCache(null);
  const counts = {};
  const slots = await refreshOnce({ cache, http: null, fetchers: fakeFetchers(new Set(), counts) });
  assert.equal(slots.vn_sjc.stale, false);
  assert.equal(slots.vn_sjc.source_used, 'pnj');
  assert.equal(slots.vn_sjc.primary, true);
  assert.equal(slots.vn_sjc.quotes[0].sell, 141_200_000);
  assert.equal(slots.vn_pnj_ring.quotes[0].sell, 139_200_000);
  assert.equal(slots.world_xau.source_used, 'goldapi');
  assert.equal(slots.fx_usdvnd.source_used, 'vcb');
  assert.equal(counts.pnj, 1);
});

test('world primary down → Swissquote fallback, not stale', async () => {
  const cache = createCache(null);
  const slots = await refreshOnce({ cache, http: null, fetchers: fakeFetchers(new Set(['goldapi'])) });
  assert.equal(slots.world_xau.stale, false);
  assert.equal(slots.world_xau.source_used, 'swissquote');
});

test('one source dead → its rows keep last value, flagged stale; others stay fresh; page renders', async () => {
  const cache = createCache(null);
  let t = new Date('2026-11-04T01:00:00Z');
  const now = () => t;
  await refreshOnce({ cache, http: null, fetchers: fakeFetchers(), now });

  t = new Date('2026-11-04T01:10:00Z');
  const slots = await refreshOnce({ cache, http: null, fetchers: fakeFetchers(new Set(['pnj'])), now });

  assert.equal(slots.vn_pnj_ring.stale, true);
  assert.equal(slots.vn_pnj_ring.quotes[0].sell, 139_200_000, 'last known value kept');
  assert.equal(slots.vn_pnj_ring.ok_at, '2026-11-04T01:00:00.000Z');
  assert.match(slots.vn_pnj_ring.last_error, /pnj: connect ECONNREFUSED/);
  assert.equal(slots.world_xau.stale, false);
  assert.equal(slots.world_xau.ok_at, '2026-11-04T01:10:00.000Z');
  assert.equal(slots.fx_usdvnd.stale, false);

  const html = renderPage(slots);
  assert.match(html, /Dữ liệu cũ/);
  assert.match(html, /139\.200\.000/);
  assert.match(html, /Giá vàng thế giới/);
});

test('source dead with no previous value → empty stale slot, page still renders', async () => {
  const cache = createCache(null);
  const slots = await refreshOnce({ cache, http: null, fetchers: fakeFetchers(new Set(['goldapi', 'swissquote'])) });
  assert.equal(slots.world_xau.stale, true);
  assert.deepEqual(slots.world_xau.quotes, []);
  assert.match(renderPage(slots), /Chưa có dữ liệu/);
});
