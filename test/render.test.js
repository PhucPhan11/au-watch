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

test('FX table: USD, CHF, JPY rows from VCB; empty slot shows placeholder', () => {
  const fx_rates = {
    key: 'fx_rates', stale: false, source_used: 'vcb', primary: true, ok_at: AT,
    quotes: [
      { code: 'USDVND', buy_cash: 25_520, buy: 25_550, sell: 25_930 },
      { code: 'CHFVND', buy_cash: 30_818.8, buy: 31_130.1, sell: 32_128.11 },
      { code: 'JPYVND', buy_cash: 156.96, buy: 158.55, sell: 167.78 },
    ],
  };
  const html = renderPage({ ...withWorld, fx_rates });
  assert.match(html, /Tỷ giá ngoại tệ/);
  for (const s of ['25.930', '32.128', '31.130', '30.819', '156,96', '158,55', '167,78']) assert.ok(html.includes(s), s);
  assert.match(html, /Nguồn: Vietcombank/);
  assert.match(renderPage(slots), /id="fx"[\s\S]*?Chưa có dữ liệu/);
  // Also on the static build (VCB / ExchangeRate-API are fetched from the browser there).
  assert.match(renderPage({ ...withWorld, fx_rates }, { withHistory: false, withStores: false }), /Tỷ giá ngoại tệ/);
});

test('FX history chart has its own 5 range buttons', () => {
  const html = renderPage(slots);
  const block = /id="fx-range"[\s\S]*?<\/div>/.exec(html)?.[0] ?? '';
  for (const r of ['24h', '7d', '30d', '1y', '5y']) assert.ok(block.includes(`data-range="${r}"`), r);
});

test('silver section: Phú Quý rows with gap on 999 per-lượng rows; world card; Pages note', () => {
  const silver = {
    ...withWorld,
    world_xag: { key: 'world_xag', stale: false, source_used: 'goldapi_xag', primary: true, ok_at: AT, quotes: [{ buy: 47.5, sell: 47.5 }] },
    vn_silver_pq: {
      key: 'vn_silver_pq', stale: false, source_used: 'phuquy', primary: true, ok_at: AT,
      quotes: [
        { code: 'PQ_1L', product: 'Bạc Miếng Phú Quý 999 1 Lượng', group: 'Bạc Thương Hiệu Phú Quý', buy: 1_458_000, sell: 1_503_000, unit: 'luong', pure: true },
        { code: 'PQ_4', product: 'Bạc Thỏi Phú Quý 999 1kilo', group: 'Bạc Thương Hiệu Phú Quý', buy: 38_879_903, sell: 40_079_900, unit: 'kg', pure: false },
      ],
    },
  };
  const html = renderPage(silver);
  const world = usdOzToVndLuong(47.5, 25_930);
  assert.match(html, /id="silver"/);
  assert.match(html, /Giá bạc thế giới/);
  assert.ok(html.includes(vnd(world)), 'converted world silver đ/lượng');
  assert.ok(html.includes(`${vnd(gap(1_503_000, world).abs)} đ`), 'gap on the 1-lượng bar');
  assert.match(html, /40\.079\.900/);
  assert.match(html, /đ\/kg/);
  assert.match(html, /id="ag-range"/);
  const pages = renderPage(silver, { withHistory: false, withStores: false, withSilver: false });
  assert.doesNotMatch(pages, /id="silver"/);
  assert.match(pages, /Giá bạc Phú Quý chỉ có khi chạy ứng dụng trên máy/);
});
