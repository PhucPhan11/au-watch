import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OZ_PER_LUONG, usdOzToVndLuong, gap, mid } from '../src/convert.js';

test('1 lượng = 37.5 g = 1.205653 troy oz', () => {
  assert.ok(Math.abs(OZ_PER_LUONG - 1.2056530) < 1e-6);
});

test('USD/oz → VND/lượng', () => {
  // 2000 USD/oz × 25 000 VND/USD × 37.5/31.1034768 = 60 282 649.816 (exact rational arithmetic)
  assert.ok(Math.abs(usdOzToVndLuong(2000, 25_000) - 60_282_649.816) < 0.01);
  // Values seen live on 2026-11-04: 3941.1 USD/oz, VCB sell 25 930 → ≈ 123.21 M đ/lượng
  assert.ok(Math.abs(usdOzToVndLuong(3941.1, 25_930) / 1e6 - 123.21) < 0.01);
});

test('conversion rejects non-positive inputs', () => {
  assert.throws(() => usdOzToVndLuong(0, 25_000), RangeError);
  assert.throws(() => usdOzToVndLuong(2000, -1), RangeError);
});

test('gap absolute and percent (positive premium)', () => {
  const g = gap(70_000_000, 60_000_000);
  assert.equal(g.abs, 10_000_000);
  assert.ok(Math.abs(g.pct - 16.6667) < 1e-3);
});

test('gap can be negative (VN below world)', () => {
  const g = gap(57_000_000, 60_000_000);
  assert.equal(g.abs, -3_000_000);
  assert.equal(g.pct, -5);
});

test('gap rejects zero world price', () => {
  assert.throws(() => gap(1, 0), RangeError);
});

test('mid of bid/ask', () => {
  assert.equal(mid({ buy: 3941, sell: 3943 }), 3942);
});
