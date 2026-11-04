// History store tests: temp SQLite file per test, no network.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openHistory, bucketize, RANGES } from '../src/history.js';
import { usdOzToVndLuong, gap } from '../src/convert.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.parse('2026-11-04T01:00:00Z');

let dir;
let file;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'au-watch-test-')); file = join(dir, 'history.db'); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function slot(key, buy, sell, at, stale = false) {
  const unit = key.startsWith('vn') ? 'luong' : key === 'world_xau' ? 'oz' : 'USD';
  return {
    key, stale, ok_at: new Date(at).toISOString(),
    quotes: [{ source: 'test', product: key, buy, sell, unit, currency: unit === 'oz' ? 'USD' : 'VND' }],
  };
}

function allSlots(at, { sjc = 141_200_000, ring = 139_200_000, xau = 3941, fx = 25_930 } = {}) {
  return {
    vn_sjc: slot('vn_sjc', sjc - 3_000_000, sjc, at),
    vn_pnj_ring: slot('vn_pnj_ring', ring - 4_000_000, ring, at),
    world_xau: slot('world_xau', xau, xau, at),
    fx_usdvnd: slot('fx_usdvnd', 25_550, fx, at),
  };
}

const rows = () => {
  const db = new DatabaseSync(file);
  const r = db.prepare('SELECT series, ts, seen_until, buy, sell FROM snapshots ORDER BY series, ts').all();
  db.close();
  return r;
};

test('first write inserts one row per series', () => {
  const h = openHistory(file);
  assert.deepEqual(h.record(allSlots(T0)), { inserted: 4, touched: 0 });
  h.close();
  assert.equal(rows().length, 4);
});

test('unchanged values insert nothing and advance seen_until', () => {
  const h = openHistory(file);
  h.record(allSlots(T0));
  assert.deepEqual(h.record(allSlots(T0 + 10 * MIN)), { inserted: 0, touched: 4 });
  h.close();
  const r = rows();
  assert.equal(r.length, 4);
  for (const row of r) {
    assert.equal(row.ts, T0);
    assert.equal(row.seen_until, T0 + 10 * MIN);
  }
});

test('changed values insert a new row only for that series', () => {
  const h = openHistory(file);
  h.record(allSlots(T0));
  assert.deepEqual(h.record(allSlots(T0 + 10 * MIN, { xau: 3950 })), { inserted: 1, touched: 3 });
  h.close();
  const world = rows().filter((r) => r.series === 'world_xau');
  assert.deepEqual(world.map((r) => r.sell), [3941, 3950]);
});

test('stale or empty slots are not written', () => {
  const h = openHistory(file);
  const s = allSlots(T0);
  s.vn_pnj_ring.stale = true;
  s.fx_usdvnd = { key: 'fx_usdvnd', stale: true, quotes: [], ok_at: null };
  assert.deepEqual(h.record(s), { inserted: 2, touched: 0 });
  // A stale slot carrying an old value must not advance seen_until either.
  h.record(allSlots(T0));
  const later = allSlots(T0 + 30 * MIN);
  later.vn_sjc.stale = true;
  h.record(later);
  h.close();
  const sjc = rows().find((r) => r.series === 'vn_sjc');
  assert.equal(sjc.seen_until, T0);
});

test('history survives close and reopen (restart)', () => {
  let h = openHistory(file);
  h.record(allSlots(T0));
  h.close();
  h = openHistory(file);
  assert.deepEqual(h.record(allSlots(T0 + 10 * MIN)), { inserted: 0, touched: 4 });
  const q = h.query('24h', T0 + 20 * MIN);
  h.close();
  assert.equal(q.first_recorded, T0);
  assert.equal(q.sjc_sell.at(-1), 141_200_000);
});

test('each range returns its bucket size and point count', () => {
  const h = openHistory(file);
  h.record(allSlots(T0));
  const expected = { '24h': [10 * MIN, 144], '7d': [HOUR, 168], '30d': [24 * HOUR, 30], '1y': [24 * HOUR, 365] };
  for (const [range, [bucket, count]] of Object.entries(expected)) {
    const q = h.query(range, T0 + 5 * MIN);
    assert.equal(q.bucket_ms, bucket, range);
    assert.equal(q.t.length, count, range);
    assert.equal(q.to - q.from, RANGES[range].span, range);
    for (const key of ['sjc_sell', 'world_vnd_luong', 'gap_sjc_pct']) assert.equal(q[key].length, count);
  }
  h.close();
});

test('unknown range is rejected', () => {
  const h = openHistory(file);
  assert.throws(() => h.query('5d'), RangeError);
  h.close();
});

test('bucketize: last value per bucket wins', () => {
  const r = [
    { series: 'vn_sjc', ts: T0 + 1 * MIN, seen_until: T0 + 1 * MIN, buy: 1, sell: 100_000_000 },
    { series: 'vn_sjc', ts: T0 + 7 * MIN, seen_until: T0 + 7 * MIN, buy: 1, sell: 101_000_000 },
  ];
  const out = bucketize(r, { from: T0, to: T0 + 10 * MIN, bucketMs: 10 * MIN, graceMs: 10 * MIN });
  assert.deepEqual(out.sjc_sell, [101_000_000]);
});

test('bucketize: unchanged value carries forward while seen, null across downtime', () => {
  const grace = 10 * MIN;
  const r = [
    // Seen continuously from T0 to T0+3h (unchanged), then the app was down until T0+6h.
    { series: 'vn_sjc', ts: T0, seen_until: T0 + 3 * HOUR, buy: 1, sell: 141_000_000 },
    { series: 'vn_sjc', ts: T0 + 6 * HOUR + 5 * MIN, seen_until: T0 + 8 * HOUR, buy: 1, sell: 142_000_000 },
  ];
  const out = bucketize(r, { from: T0, to: T0 + 8 * HOUR, bucketMs: HOUR, graceMs: grace });
  // Buckets are (end-1h, end], ending at T0+1h … T0+8h.
  assert.deepEqual(out.sjc_sell, [
    141_000_000, 141_000_000, 141_000_000, // T0..T0+3h covered
    141_000_000, // bucket (3h,4h]: seen_until 3h + grace still overlaps the bucket start
    null, null, // (4h,5h], (5h,6h]: no data → gap, not a flat line
    142_000_000, 142_000_000,
  ]);
});

test('bucketize: gap per bucket matches convert.js; enough needs 2 complete buckets', () => {
  const mk = (series, buy, sell) => ({ series, ts: T0, seen_until: T0 + 20 * MIN, buy, sell });
  const r = [
    mk('vn_sjc', 138_200_000, 141_200_000),
    mk('vn_pnj_ring', 135_200_000, 139_200_000),
    mk('world_xau', 3940, 3942),
    mk('fx_usdvnd', 25_550, 25_930),
  ];
  const opts = { bucketMs: 10 * MIN, graceMs: 0 };
  const out = bucketize(r, { from: T0, to: T0 + 20 * MIN, ...opts });
  const world = usdOzToVndLuong(3941, 25_930);
  const g = gap(141_200_000, world);
  assert.equal(out.world_vnd_luong[0], world);
  assert.equal(out.gap_sjc_abs[0], g.abs);
  assert.equal(out.gap_sjc_pct[0], g.pct);
  assert.equal(out.gap_ring_abs[1], gap(139_200_000, world).abs);
  assert.equal(out.enough, true);

  // Buckets (T0-15m, T0-5m] has no data yet; (T0-5m, T0+5m] has the rows → only 1 complete bucket.
  const one = bucketize(r, { from: T0 - 15 * MIN, to: T0 + 5 * MIN, ...opts });
  assert.deepEqual(one.sjc_sell, [null, 141_200_000]);
  assert.equal(one.enough, false);

  const noFx = bucketize(r.filter((x) => x.series !== 'fx_usdvnd'), { from: T0, to: T0 + 20 * MIN, ...opts });
  assert.deepEqual(noFx.gap_sjc_abs, [null, null]);
  assert.equal(noFx.enough, false);
});

test('empty database: nothing recorded, not enough', () => {
  const h = openHistory(file);
  const q = h.query('7d', T0);
  h.close();
  assert.equal(q.first_recorded, null);
  assert.equal(q.enough, false);
  assert.ok(q.sjc_sell.every((v) => v === null));
});
