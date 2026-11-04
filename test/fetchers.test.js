// Parsers are tested against real responses saved on 2026-11-04 (test/fixtures). No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as pnj from '../src/fetchers/pnj.js';
import * as goldapi from '../src/fetchers/goldapi.js';
import * as swissquote from '../src/fetchers/swissquote.js';
import * as vcb from '../src/fetchers/vcb.js';
import * as erapi from '../src/fetchers/erapi.js';

const fixturePath = (name) => new URL(`./fixtures/${name}`, import.meta.url);
const fixture = (name) => JSON.parse(readFileSync(fixturePath(name), 'utf8'));
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

test('fetch() goes through the injected http function (no network)', async () => {
  const seen = [];
  const http = async (url, opts) => { seen.push([url, opts?.method ?? 'GET']); return fixture('pnj.json'); };
  const quotes = await pnj.fetch(http);
  assert.ok(quotes.length > 0);
  assert.match(seen[0][0], /edge-api\.pnj\.io/);
});
