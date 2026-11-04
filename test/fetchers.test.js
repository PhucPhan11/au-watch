// Parsers are tested against real responses saved on 2026-11-04 (test/fixtures). No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as pnj from '../src/fetchers/pnj.js';
import * as goldapi from '../src/fetchers/goldapi.js';
import * as swissquote from '../src/fetchers/swissquote.js';
import * as vcb from '../src/fetchers/vcb.js';
import * as erapi from '../src/fetchers/erapi.js';
import * as ngoctham from '../src/fetchers/ngoctham.js';
import * as minhvu from '../src/fetchers/minhvu.js';
import * as huythanh from '../src/fetchers/huythanh.js';
import { isPure, vndPerChiToLuong } from '../src/fetchers/util.js';

const fixturePath = (name) => new URL(`./fixtures/${name}`, import.meta.url);
const fixture = (name) => JSON.parse(readFileSync(fixturePath(name), 'utf8'));
const fixtureText = (name) => readFileSync(fixturePath(name), 'utf8');
const T = new Date('2026-11-04T04:35:00Z');
const KEYS = ['source', 'product', 'buy', 'sell', 'unit', 'currency', 'fetched_at'];

function assertShape(q) {
  for (const k of KEYS) assert.ok(k in q, `missing ${k}`);
  assert.equal(q.fetched_at, T.toISOString());
}

test('PNJ: SJC bar and N24K ring, converted to đ/lượng', () => {
  const quotes = pnj.parse(fixture('pnj.json'), T);
  quotes.forEach(assertShape);
  const bar = quotes.find((q) => q.code === 'SJC');
  assert.deepEqual([bar.buy, bar.sell, bar.unit, bar.currency], [138_200_000, 141_200_000, 'luong', 'VND']);
  const ring = quotes.find((q) => q.code === 'N24K');
  assert.deepEqual([ring.buy, ring.sell], [135_200_000, 139_200_000]);
  assert.ok(!quotes.some((q) => q.code === 'RAW_9999'), 'buy-only rows are skipped');
});

test('PNJ: rejects malformed payload', () => {
  assert.throws(() => pnj.parse({}), /missing data/);
  assert.throws(() => pnj.parse({ data: [{ masp: 'SJC', tensp: 'x', giaban: 14, giamua: 13 }] }), /range/);
});

test('gold-api: XAU/USD price', () => {
  const [q] = goldapi.parse(fixture('goldapi.json'), T);
  assertShape(q);
  assert.deepEqual([q.buy, q.sell, q.unit, q.currency], [3940.300049, 3940.300049, 'oz', 'USD']);
  assert.throws(() => goldapi.parse({ symbol: 'XAG', currency: 'USD', price: 30 }), /unexpected/);
});

test('Swissquote: prime bid/ask', () => {
  const [q] = swissquote.parse(fixture('swissquote.json'), T);
  assertShape(q);
  assert.deepEqual([q.buy, q.sell], [3941.081, 3941.719]);
  assert.throws(() => swissquote.parse([]), /empty/);
});

test('Vietcombank: USD transfer/sell', () => {
  const [q] = vcb.parse(fixture('vcb.json'), T);
  assertShape(q);
  assert.deepEqual([q.buy, q.sell, q.unit, q.currency], [25_550, 25_930, 'USD', 'VND']);
  assert.throws(() => vcb.parse({ Data: [] }), /not found/);
});

test('Vietcombank: date is computed in Vietnam time', () => {
  assert.equal(vcb.vnDate(new Date('2026-11-04T18:00:00Z')), '2026-11-05');
});

test('ExchangeRate-API: USD/VND mid', () => {
  const [q] = erapi.parse(fixture('erapi.json'), T);
  assertShape(q);
  assert.equal(q.sell, 25_769.065289);
  assert.throws(() => erapi.parse({ result: 'error' }), /unexpected/);
});

// --- Cần Thơ stores (prices per chỉ → ×10 to đ/lượng) ---
const rows = (quotes) => quotes.map((q) => [q.product, q.buy, q.sell, q.pure]);

test('Ngọc Thẩm: JSON feed, per chỉ → đ/lượng, update time', () => {
  const quotes = ngoctham.parse(fixture('ngoctham.json'), T);
  quotes.forEach(assertShape);
  assert.deepEqual(rows(quotes), [
    ['Nhẫn Trơn 24K', 128_500_000, 132_000_000, true],
    ['Vàng 24K', 128_500_000, 132_000_000, true],
    ['Vàng 990', 126_500_000, 130_500_000, false],
    ['Vàng 18K 750', 93_950_000, 99_450_000, false],
    ['Vàng Trắng AU750', 93_950_000, 99_450_000, false],
    ['Vàng Miếng SJC (Loại 10 chỉ)', 138_500_000, 142_000_000, true],
  ]);
  assert.equal(quotes[0].source_updated_at, '2026-11-04T06:37:00.000Z'); // 13:37 Vietnam time
});

test('Ngọc Thẩm: hidden sides become null; malformed payload throws', () => {
  const raw = { date: '2026-11-04 13:37:00', chitiet: [
    { idloaivang: ['1'], loaivang: 'Vàng 24K', giamua: '12850000', giaban: '13200000', chihiengiamua: 1, chihiengiaban: 0 },
  ] };
  const [q] = ngoctham.parse(raw, T);
  assert.equal(q.buy, null);
  assert.equal(q.sell, 132_000_000);
  assert.throws(() => ngoctham.parse({}), /missing chitiet/);
  assert.throws(() => ngoctham.parse({ chitiet: [] }), /no priced/);
});

test('Minh Vũ: homepage price table, per chỉ → đ/lượng, update time', () => {
  const quotes = minhvu.parse(fixtureText('minhvu.html'), T);
  quotes.forEach(assertShape);
  assert.deepEqual(rows(quotes), [
    ['Trang sức 9999', 123_900_000, 127_800_000, true],
    ['9999', 125_400_000, 127_800_000, true],
    ['Nhẫn trơn 983', 122_400_000, 125_800_000, false],
    ['Trang sức 980', 119_400_000, 125_800_000, false],
    ['Trang sức 610', 76_600_000, 80_800_000, false],
  ]);
  assert.equal(quotes[0].source_updated_at, '2026-11-03T04:25:00.000Z'); // 03/11/2026 11:25
});

test('Minh Vũ: missing table throws', () => {
  assert.throws(() => minhvu.parse('<html><body>no prices</body></html>'), /not found/);
});

test('Huy Thanh: Next.js page data, store labels, buy-only row', () => {
  const quotes = huythanh.parse(fixtureText('huythanh.html'), T);
  quotes.forEach(assertShape);
  assert.deepEqual(rows(quotes), [
    ['Vàng Huy Thanh 24k', 136_800_000, 140_500_000, true],
    ['Vàng thị trường 24k', 126_500_000, null, true],
    ['Giá nguyên liệu 22K', 125_310_000, 128_700_000, false],
    ['Giá nguyên liệu 18K', 100_450_000, 105_380_000, false],
    ['Giá nguyên liệu 14K', 78_350_000, 82_190_000, false],
    ['Giá nguyên liệu 10K', 55_710_000, 58_450_000, false],
  ]);
  assert.equal(quotes[0].source_updated_at, '2026-11-04T07:12:00.000Z'); // 04/11/2026 14:12
});

test('Huy Thanh: page without price data throws', () => {
  assert.throws(() => huythanh.parse('<html><script>self.__next_f.push([1,"{}"])</script></html>'), /prices not found/);
});

test('store helpers: purity and per-chỉ conversion with range guard', () => {
  for (const name of ['Nhẫn Trơn 24K', '9999', 'Trang sức 9999', 'Vàng Miếng SJC', 'Vàng 999']) assert.ok(isPure(name), name);
  for (const name of ['Vàng 990', 'Nhẫn trơn 983', 'Vàng 18K 750', 'Trang sức 610', '22K']) assert.ok(!isPure(name), name);
  assert.equal(vndPerChiToLuong('12.780.000 đ', 'x'), 127_800_000);
  assert.equal(vndPerChiToLuong(0, 'x'), null);
  assert.equal(vndPerChiToLuong('', 'x'), null);
  assert.throws(() => vndPerChiToLuong('127', 'x'), /range/); // unit change would be caught
});

test('fetch() goes through the injected http function (no network)', async () => {
  const seen = [];
  const http = async (url, opts) => { seen.push([url, opts?.method ?? 'GET']); return fixture('pnj.json'); };
  const quotes = await pnj.fetch(http);
  assert.ok(quotes.length > 0);
  assert.match(seen[0][0], /edge-api\.pnj\.io/);
});
