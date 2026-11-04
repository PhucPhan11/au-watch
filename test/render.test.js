import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../src/render.js';

const slots = {
  vn_sjc: {
    key: 'vn_sjc', stale: false, source_used: 'pnj', primary: true, ok_at: '2026-11-04T07:00:00.000Z',
    quotes: [{ buy: 138_200_000, sell: 141_200_000 }],
  },
};

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
