import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../src/render.js';
import { usdOzToVndLuong, gap } from '../src/convert.js';

const AT = '2026-11-04T07:00:00.000Z';
const slots = {
  vn_sjc: {
    key: 'vn_sjc', stale: false, source_used: 'pnj', primary: true, ok_at: AT,
    quotes: [{ buy: 138_200_000, sell: 141_200_000 }],
  },
};

const withWorld = {
  ...slots,
  world_xau: { key: 'world_xau', stale: false, source_used: 'goldapi', primary: true, ok_at: AT, quotes: [{ buy: 4000, sell: 4000 }] },
  fx_usdvnd: { key: 'fx_usdvnd', stale: false, source_used: 'vcb', primary: true, ok_at: AT, quotes: [{ buy: 25_550, sell: 25_930 }] },
  cantho_ngoctham: {
    key: 'cantho_ngoctham', stale: false, source_used: 'ngoctham', primary: true, ok_at: AT,
    quotes: [
      { product: 'Nhẫn Trơn 24K', buy: 128_500_000, sell: 132_000_000, pure: true, source_updated_at: '2026-11-04T06:37:00.000Z' },
      { product: 'Vàng 18K 750', buy: 93_950_000, sell: 99_450_000, pure: false, source_updated_at: '2026-11-04T06:37:00.000Z' },
    ],
  },
  cantho_minhvu: {
    key: 'cantho_minhvu', stale: true, source_used: 'minhvu', primary: true, ok_at: AT, last_error: 'minhvu: HTTP 503',
    quotes: [{ product: '9999', buy: 125_400_000, sell: 127_800_000, pure: true, source_updated_at: null }],
  },
};

const vnd = (n) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n));

test('default page includes the history charts and their assets', () => {
  const html = renderPage(slots);
  assert.match(html, /id="history"/);
  assert.match(html, /\/assets\/uPlot\.min\.css/);
  assert.match(html, /\/assets\/charts\.js/);
});

test('withHistory: false → price table only, no chart section or /assets/ references', () => {
  const html = renderPage(slots, { withHistory: false });
  assert.doesNotMatch(html, /id="history"/);
  assert.doesNotMatch(html, /\/assets\//);
  assert.match(html, /141\.200\.000/);
  assert.match(html, /Biểu đồ lịch sử chỉ có khi chạy ứng dụng trên máy/);
});

test('Cần Thơ stores: one table per store, gap only on pure rows, stale store marked', () => {
  const html = renderPage(withWorld);
  const i = html.indexOf('id="stores"');
  assert.ok(i > 0, 'store section present');
  const section = html.slice(i, html.indexOf('</section>', i));
  for (const name of ['Ngọc Thẩm', 'Minh Vũ', 'Huy Thanh']) assert.match(section, new RegExp(name));

  const world = usdOzToVndLuong(4000, 25_930);
  const pureGap = vnd(gap(132_000_000, world).abs);
  const alloyGap = vnd(gap(99_450_000, world).abs);
  assert.ok(section.includes(pureGap), 'gap shown for 24K row');
  assert.ok(!section.includes(alloyGap), 'no gap for 18K row');
  assert.match(section, /99\.450\.000/);

  assert.match(section, /class="store stale"/);
  assert.match(section, /Dữ liệu cũ/);
  // Huy Thanh never fetched → empty table, not an error.
  assert.match(section, /Chưa có dữ liệu/);
});

test('withStores: false → no store section, note instead', () => {
  const html = renderPage(withWorld, { withStores: false });
  assert.doesNotMatch(html, /id="stores"/);
  assert.match(html, /Giá cửa hàng Cần Thơ chỉ có khi chạy ứng dụng trên máy/);
});
