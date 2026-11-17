// History store tests: temp SQLite file per test, no network.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openHistory, bucketize, clip, RANGES } from '../src/history.js';
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
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

test('store slots (Cần Thơ price lists) are not recorded', () => {
  const h = openHistory(file);
  const s = allSlots(T0);
  s.cantho_ngoctham = { ...slot('vn_sjc', 128_500_000, 132_000_000, T0), key: 'cantho_ngoctham' };
  assert.deepEqual(h.record(s), { inserted: 4, touched: 0 });
  h.close();
  assert.ok(!rows().some((r) => r.series.startsWith('cantho_')));
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
  const expected = { '24h': [10 * MIN, 144], '7d': [HOUR, 168], '30d': [24 * HOUR, 30], '1y': [24 * HOUR, 365], '5y': [24 * HOUR, 1825] };
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

// --- Backfill seed import ---

function writeSeed(generated_at, series) {
  const f = join(dir, 'seed.json.gz');
  writeFileSync(f, gzipSync(JSON.stringify({ version: 1, generated_at, series })));
  return f;
}
const SJC_META = { source: 'PNJ', product: 'SJC', unit: 'luong', currency: 'VND' };

test('clip: returns the parts of an interval not covered by spans', () => {
  const spans = [{ ts: 10, seen_until: 20 }, { ts: 30, seen_until: 40 }];
  assert.deepEqual(clip(0, 50, spans), [[0, 9], [21, 29], [41, 50]]);
  assert.deepEqual(clip(12, 18, spans), []);
  assert.deepEqual(clip(15, 35, spans), [[21, 29]]);
  assert.deepEqual(clip(0, 5, []), [[0, 5]]);
});

test('importSeed fills gaps around live rows and never overwrites them', () => {
  const h = openHistory(file);
  h.record(allSlots(T0)); // live vn_sjc row at T0 (sell 141.2M)
  h.record(allSlots(T0 + 30 * MIN)); // extends it to T0+30m
  const seed = writeSeed('2026-11-17T00:00:00.000Z', {
    vn_sjc: { ...SJC_META, rows: [[T0 - HOUR, T0 + HOUR, 100_000_000, 101_000_000]] },
  });
  const res = h.importSeed(seed);
  assert.deepEqual(res.rows, { vn_sjc: 2 });
  const sjc = rows().filter((r) => r.series === 'vn_sjc');
  assert.deepEqual(sjc.map((r) => [r.ts, r.seen_until, r.sell]), [
    [T0 - HOUR, T0 - 1, 101_000_000],
    [T0, T0 + 30 * MIN, 141_200_000], // live row untouched
    [T0 + 30 * MIN + 1, T0 + HOUR, 101_000_000],
  ]);
  h.close();
});

test('importSeed: same seed is skipped, newer seed replaces older seed rows, missing file is ignored', () => {
  const h = openHistory(file);
  const a = writeSeed('2026-11-17T00:00:00.000Z', { vn_sjc: { ...SJC_META, rows: [[T0, T0 + HOUR, 1e8, 1.01e8]] } });
  assert.equal(h.importSeed(a).imported, true);
  assert.deepEqual(h.importSeed(a), { imported: false, reason: 'already imported' });
  const b = writeSeed('2026-11-18T00:00:00.000Z', { vn_sjc: { ...SJC_META, rows: [[T0, T0 + 2 * HOUR, 1e8, 1.02e8]] } });
  assert.equal(h.importSeed(b).imported, true);
  assert.deepEqual(rows().map((r) => [r.ts, r.seen_until, r.sell]), [[T0, T0 + 2 * HOUR, 1.02e8]]);
  assert.deepEqual(h.importSeed(join(dir, 'nope.gz')), { imported: false, reason: 'missing' });
  h.close();
});

test('live record never extends a seed row; seeded history shows in 5y query', () => {
  const h = openHistory(file);
  h.importSeed(writeSeed('2026-11-17T00:00:00.000Z', {
    vn_sjc: { ...SJC_META, rows: [[T0 - 400 * 24 * HOUR, T0 - HOUR, 139_000_000, 141_200_000]] },
  }));
  h.record(allSlots(T0)); // same sjc values as the seed row, still inserted as a live row
  assert.equal(rows().filter((r) => r.series === 'vn_sjc').length, 2);
  const q = h.query('5y', T0);
  assert.equal(q.sjc_sell.at(-1), 141_200_000);
  assert.equal(q.sjc_sell.filter((v) => v === 141_200_000).length >= 399, true);
  h.close();
});

// --- Exchange-rate series (USD / CHF / JPY) ---

function fxRates(at, { chf = 32_128.11, jpy = 167.78 } = {}, stale = false) {
  return {
    key: 'fx_rates', stale, ok_at: new Date(at).toISOString(), source_used: 'vcb',
    quotes: [
      { source: 'Vietcombank', code: 'USDVND', product: 'USD', buy: 25_550, sell: 25_930, unit: 'USD', currency: 'VND' },
      { source: 'Vietcombank', code: 'CHFVND', product: 'CHF', buy: 31_130.1, sell: chf, unit: 'CHF', currency: 'VND' },
      { source: 'Vietcombank', code: 'JPYVND', product: 'JPY', buy: 158.55, sell: jpy, unit: 'JPY', currency: 'VND' },
    ],
  };
}

test('fx_rates slot is recorded as fx_chfvnd / fx_jpyvnd with change detection; stale skipped', () => {
  const h = openHistory(file);
  assert.deepEqual(h.record({ ...allSlots(T0), fx_rates: fxRates(T0) }), { inserted: 6, touched: 0 });
  assert.deepEqual(h.record({ ...allSlots(T0 + 10 * MIN), fx_rates: fxRates(T0 + 10 * MIN, { jpy: 168 }) }), { inserted: 1, touched: 5 });
  assert.deepEqual(h.record({ fx_rates: fxRates(T0 + 20 * MIN, { chf: 1 }, true) }), { inserted: 0, touched: 0 });
  const fx = rows().filter((r) => r.series.startsWith('fx_'));
  assert.deepEqual(fx.map((r) => [r.series, r.sell]), [
    ['fx_chfvnd', 32_128.11], ['fx_jpyvnd', 167.78], ['fx_jpyvnd', 168], ['fx_usdvnd', 25_930],
  ]);
  h.close();
});

test('query: FX buy/sell columns per currency and fx_enough', () => {
  const h = openHistory(file);
  h.record({ fx_rates: fxRates(T0) });
  h.record({ fx_rates: fxRates(T0 + 10 * MIN) });
  const q = h.query('24h', T0 + 15 * MIN);
  assert.equal(q.chf_sell.at(-1), 32_128.11);
  assert.equal(q.jpy_buy.at(-1), 158.55);
  assert.equal(q.usd_sell.at(-1), null, 'USD comes from the fx_usdvnd slot, not fx_rates');
  assert.equal(q.fx_enough, true);
  assert.equal(q.enough, false, 'no gold data → gold charts stay empty');
  h.close();
});

test('importSeed loads CHF/JPY series', () => {
  const h = openHistory(file);
  const meta = (ccy) => ({ source: 'Yahoo Finance (scaled to Vietcombank)', product: `${ccy}/VND`, unit: ccy, currency: 'VND' });
  const res = h.importSeed(writeSeed('2026-11-17T00:00:00.000Z', {
    fx_chfvnd: { ...meta('CHF'), rows: [[T0, T0 + HOUR, 31_000, 32_000]] },
    fx_jpyvnd: { ...meta('JPY'), rows: [[T0, T0 + HOUR, 158, 167]] },
  }));
  assert.deepEqual(res.rows, { fx_chfvnd: 1, fx_jpyvnd: 1 });
  h.close();
});
