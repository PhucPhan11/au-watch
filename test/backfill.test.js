// History backfill parsers and pure helpers (saved responses, no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDay } from '../src/backfill/pnj.js';
import { parseChart } from '../src/backfill/yahoo.js';
import { mergeTiers, toChangeRows, closeToQuotes, vnDays } from '../src/backfill/build.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

test('PNJ history: TPHCM SJC/PNJ rows → đ/lượng with Vietnam timestamps', () => {
  const day = parseDay(fixture('pnj-history.json'));
  assert.equal(day.vn_sjc.length, 6);
  assert.equal(day.vn_pnj_ring.length, 6);
  assert.deepEqual(day.vn_sjc[0], { ts: Date.parse('2025-11-17T08:00:55+07:00'), buy: 149_000_000, sell: 151_000_000 });
  assert.deepEqual(day.vn_pnj_ring[0], { ts: Date.parse('2025-11-17T08:00:55+07:00'), buy: 146_900_000, sell: 149_900_000 });
  for (const list of Object.values(day)) {
    for (let i = 1; i < list.length; i++) assert.ok(list[i].ts >= list[i - 1].ts);
  }
});

test('PNJ history: day without TPHCM → empty; bad payloads throw', () => {
  assert.deepEqual(parseDay({ locations: [] }), { vn_sjc: [], vn_pnj_ring: [] });
  assert.throws(() => parseDay({}), /locations/);
  const row = (gia_ban) => ({ locations: [{ name: 'TPHCM', gold_type: [{ name: 'SJC', data: [{ gia_ban, gia_mua: '149.000', updated_at: '17/11/2025 08:00:55' }] }] }] });
  assert.throws(() => parseDay(row('151')), /range/); // unit change would be caught
  assert.throws(() => parseDay(row('')), /invalid/);
  // One typo row among good ones is dropped, not the whole day.
  const mixed = row('151.000');
  mixed.locations[0].gold_type[0].data.push({ gia_ban: '1510.000', gia_mua: '149.000', updated_at: '17/11/2025 09:00:00' });
  const rejected = [];
  const day = parseDay(mixed, { onReject: (err) => rejected.push(err.message) });
  assert.equal(day.vn_sjc.length, 1);
  assert.match(rejected[0], /range/);
});

test('Yahoo chart: timestamps → ms, null closes dropped', () => {
  const pts = parseChart(fixture('yahoo-chart.json'));
  assert.equal(pts.length, 3);
  assert.deepEqual(pts[0], { ts: 1794373200_000, close: 4000.5 });
  assert.throws(() => parseChart({ chart: { result: null, error: { description: 'No data found' } } }), /No data found/);
  assert.throws(() => parseChart({ chart: { result: [{}] } }), /missing/);
});

test('mergeTiers: finer tier wins; coarser only adds older points', () => {
  const fine = [{ ts: 50 }, { ts: 60 }];
  const mid = [{ ts: 20 }, { ts: 40 }, { ts: 55 }];
  const coarse = [{ ts: 0 }, { ts: 30 }];
  assert.deepEqual(mergeTiers([fine, [], mid, coarse]).map((p) => p.ts), [0, 20, 40, 50, 60]);
});

test('toChangeRows: dedupes unchanged values, seen_until = next change', () => {
  const rows = toChangeRows([
    { ts: 10, buy: 1, sell: 2 }, { ts: 20, buy: 1, sell: 2 }, { ts: 30, buy: 1, sell: 3 }, { ts: 40, buy: 1, sell: 3 },
  ]);
  assert.deepEqual(rows, [[10, 30, 1, 2], [30, 40, 1, 3]]);
});

test('closeToQuotes scales and rounds; vnDays lists Vietnam calendar days', () => {
  assert.deepEqual(closeToQuotes([{ ts: 1, close: 25_000.4 }], { ratio: 1.01, digits: 0 }), [{ ts: 1, buy: 25_250, sell: 25_250 }]);
  const now = Date.parse('2026-11-17T01:00:00Z'); // 08:00 in Vietnam
  assert.deepEqual(vnDays(now - 2 * 86_400_000, now), ['20261117', '20261116', '20261115']);
});
