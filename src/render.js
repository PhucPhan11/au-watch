// Server-rendered page. Vietnamese labels, readable on mobile.
import { mid, usdOzToVndLuong, gap } from './convert.js';
import { FETCHERS } from './scheduler.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vnd = (n) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n));
const usd = (n) => new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const pct = (n) => new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' }).format(n);
const time = (iso) => iso
  ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
  : '—';

const VN_ROWS = [
  { key: 'vn_sjc', label: 'Vàng miếng SJC' },
  { key: 'vn_pnj_ring', label: 'Nhẫn trơn PNJ 999.9' },
];

function sourceName(slot) {
  if (!slot?.source_used) return '—';
  const name = FETCHERS[slot.source_used]?.source ?? slot.source_used;
  return slot.primary ? name : `${name} (dự phòng)`;
}

function status(slot) {
  if (!slot || slot.quotes.length === 0) return '<span class="badge bad">Chưa có dữ liệu</span>';
  if (slot.stale) return `<span class="badge bad" title="${esc(slot.last_error ?? '')}">Dữ liệu cũ</span>`;
  return '<span class="badge ok">Mới</span>';
}

const HISTORY_HEAD = '<link rel="stylesheet" href="/assets/uPlot.min.css">\n';
const HISTORY_SECTION = `<section class="history" id="history">
  <h2>Lịch sử giá</h2>
  <div class="seg" role="group" aria-label="Khoảng thời gian" id="range">
    <button type="button" data-range="24h">24 giờ</button><button type="button" data-range="7d">7 ngày</button><button type="button" data-range="30d">30 ngày</button><button type="button" data-range="1y">1 năm</button>
  </div>
  <p class="partial" id="partial" hidden></p>
  <div id="charts">
    <h3>Giá bán ra so với giá thế giới (đ/lượng)</h3>
    <div class="chart" id="chart-price"></div>
    <h3><span>Chênh lệch so với thế giới</span>
      <span class="seg" role="group" aria-label="Đơn vị chênh lệch" id="gap-mode"><button type="button" data-mode="abs">đồng</button><button type="button" data-mode="pct">%</button></span>
    </h3>
    <div class="chart" id="chart-gap"></div>
  </div>
  <div class="empty" id="empty" hidden></div>
</section>
`;
const HISTORY_SCRIPTS = '<script src="/assets/uPlot.iife.min.js"></script>\n<script src="/assets/charts.js"></script>\n';
const NO_HISTORY_NOTE = '<p class="note">Biểu đồ lịch sử chỉ có khi chạy ứng dụng trên máy (npm start).</p>\n';
const NO_STORES_NOTE = '<p class="note">Giá cửa hàng Cần Thơ chỉ có khi chạy ứng dụng trên máy (npm start).</p>\n';

const STORES = [
  { key: 'cantho_ngoctham', name: 'Ngọc Thẩm' },
  { key: 'cantho_minhvu', name: 'Minh Vũ' },
  { key: 'cantho_huythanh', name: 'Huy Thanh' },
];

const gapHtml = (sell, worldVnd) => {
  const g = gap(sell, worldVnd);
  return `${g.abs >= 0 ? '+' : ''}${vnd(g.abs)} đ<br><small>${pct(g.pct)}%</small>`;
};

/** One table per Cần Thơ store; gap only for near-pure gold (24K / 9999 / SJC) with a sell price. */
function renderStores(slots, worldVnd) {
  const tables = STORES.map(({ key, name }) => {
    const slot = slots[key];
    const quotes = slot?.quotes ?? [];
    const updated = quotes[0]?.source_updated_at;
    const rows = quotes.map((q) => `<tr>
        <td data-label="Loại vàng">${esc(q.product)}</td>
        <td data-label="Mua vào">${q.buy != null ? vnd(q.buy) : '—'}</td>
        <td data-label="Bán ra">${q.sell != null ? vnd(q.sell) : '—'}</td>
        <td data-label="Chênh lệch">${q.pure && q.sell != null && worldVnd ? gapHtml(q.sell, worldVnd) : '—'}</td>
      </tr>`).join('');
    return `<div class="store${slot?.stale ? ' stale' : ''}">
    <h3><span>${esc(name)}</span><span class="meta">Cửa hàng cập nhật: ${time(updated)} · Lấy lúc: ${time(slot?.ok_at)} ${status(slot)}</span></h3>
    <table>
      <thead><tr><th>Loại vàng</th><th>Mua vào</th><th>Bán ra</th><th>Chênh lệch so với thế giới</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">Chưa có dữ liệu</td></tr>'}</tbody>
    </table>
  </div>`;
  }).join('\n  ');
  return `<section class="stores" id="stores">
  <h2>Giá vàng tại Cần Thơ</h2>
  <p class="sub">Đơn vị: đồng/lượng (quy đổi từ giá/chỉ × 10). Chênh lệch chỉ tính cho vàng 24K / 9999 / SJC.</p>
  ${tables}
</section>
`;
}

/**
 * withHistory: false → no chart section or chart assets (static GitHub Pages build).
 * withStores: false → no Cần Thơ store section (the stores can't be fetched from a browser).
 */
export function renderPage(slots, { withHistory = true, withStores = true } = {}) {
  const world = slots.world_xau?.quotes?.[0];
  const fx = slots.fx_usdvnd?.quotes?.[0];
  const worldUsd = world ? mid(world) : null;
  const fxRate = fx ? fx.sell : null;
  const worldVnd = worldUsd && fxRate ? usdOzToVndLuong(worldUsd, fxRate) : null;

  const rows = VN_ROWS.map(({ key, label }) => {
    const slot = slots[key];
    const q = slot?.quotes?.[0];
    let gapCell = '—';
    if (q && worldVnd) {
      const g = gap(q.sell, worldVnd);
      gapCell = `${g.abs >= 0 ? '+' : ''}${vnd(g.abs)} đ<br><small>${pct(g.pct)}%</small>`;
    }
    return `<tr${slot?.stale ? ' class="stale"' : ''}>
      <td data-label="Sản phẩm"><strong>${esc(label)}</strong><br><small>Nguồn: ${esc(sourceName(slot))}</small></td>
      <td data-label="Mua vào">${q ? vnd(q.buy) : '—'}</td>
      <td data-label="Bán ra">${q ? vnd(q.sell) : '—'}</td>
      <td data-label="Chênh lệch">${gapCell}</td>
      <td data-label="Cập nhật">${time(slot?.ok_at)}<br>${status(slot)}</td>
    </tr>`;
  }).join('');

  const ws = slots.world_xau;
  const fs = slots.fx_usdvnd;
  const fxKind = fs?.source_used === 'vcb' ? 'giá bán ra' : 'tham khảo';

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="300">
<title>Giá vàng VN so với thế giới</title>
${withHistory ? HISTORY_HEAD : ''}<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0 auto; max-width: 860px; padding: 16px; color: #1d1d1f; background: #fff; line-height: 1.4; }
  h1 { font-size: 1.3rem; margin: 0 0 4px; }
  .sub { color: #666; margin: 0 0 16px; font-size: .9rem; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th, td { padding: 8px; border-bottom: 1px solid #e5e5e5; text-align: right; vertical-align: top; }
  th:first-child, td:first-child { text-align: left; }
  th { font-size: .85rem; color: #555; background: #fafafa; }
  small { color: #666; }
  tr.stale td { background: #fff7e6; }
  .badge { display: inline-block; font-size: .75rem; padding: 1px 6px; border-radius: 4px; }
  .ok { background: #e6f4ea; color: #1e6b34; }
  .bad { background: #fde8e8; color: #9b1c1c; }
  .info { margin-top: 20px; display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
  .card { border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px; }
  .card h2 { font-size: .95rem; margin: 0 0 6px; }
  .big { font-size: 1.15rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  .note { margin-top: 16px; font-size: .8rem; color: #666; }
  @media (max-width: 480px) {
    thead { display: none; }
    table, tbody, tr, td { display: block; width: 100%; box-sizing: border-box; }
    tr { border: 1px solid #e5e5e5; border-radius: 8px; margin-bottom: 12px; }
    td { display: flex; justify-content: space-between; gap: 12px; text-align: right; }
    td:first-child { display: block; text-align: left; }
    td[data-label]:not(:first-child)::before { content: attr(data-label); color: #555; text-align: left; }
    .info { grid-template-columns: 1fr; }
  }
  .stores { margin-top: 28px; }
  .stores h2 { font-size: 1.05rem; margin: 0 0 4px; }
  .store { margin-top: 16px; }
  .store h3 { font-size: .95rem; margin: 0 0 6px; display: flex; flex-wrap: wrap; gap: 4px 12px; justify-content: space-between; align-items: baseline; }
  .store .meta { font-size: .8rem; font-weight: normal; color: #666; }
  .store.stale td { background: #fff7e6; }
  .history { margin-top: 28px; }
  .history h2 { font-size: 1.05rem; margin: 0 0 8px; }
  .history h3 { font-size: .95rem; margin: 20px 0 6px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; justify-content: space-between; }
  .seg { display: inline-flex; border: 1px solid #ccc; border-radius: 6px; overflow: hidden; }
  .seg button { font: inherit; font-size: .85rem; border: 0; background: #fff; padding: 6px 12px; cursor: pointer; color: #1d1d1f; }
  .seg button + button { border-left: 1px solid #ccc; }
  .seg button[aria-pressed="true"] { background: #1d1d1f; color: #fff; }
  .chart { min-height: 40px; }
  .empty { border: 1px dashed #ccc; border-radius: 8px; padding: 24px 12px; text-align: center; color: #666; font-size: .9rem; }
  .partial { font-size: .8rem; color: #666; margin: 4px 0 0; }
  .uplot { font-family: inherit; }
  .u-legend { font-size: .8rem; }
</style>
</head>
<body>
<h1>Giá vàng Việt Nam so với thế giới</h1>
<p class="sub">Đơn vị: đồng/lượng (1 lượng = 37,5 g). Trang tự tải lại mỗi 5 phút.</p>
<table>
  <thead><tr><th>Sản phẩm</th><th>Mua vào</th><th>Bán ra</th><th>Chênh lệch so với thế giới</th><th>Cập nhật</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="info">
  <div class="card">
    <h2>Giá vàng thế giới</h2>
    <div class="big">${worldUsd ? `${usd(worldUsd)} USD/oz` : '—'}</div>
    <div>Quy đổi: <strong>${worldVnd ? `${vnd(worldVnd)} đ/lượng` : '—'}</strong></div>
    <small>Nguồn: ${esc(sourceName(ws))} · Cập nhật: ${time(ws?.ok_at)}</small> ${status(ws)}
  </div>
  <div class="card">
    <h2>Tỷ giá USD/VND</h2>
    <div class="big">${fxRate ? `${vnd(fxRate)} đ` : '—'}</div>
    <div>Loại: ${fx ? esc(fxKind) : '—'}</div>
    <small>Nguồn: ${esc(sourceName(fs))} · Cập nhật: ${time(fs?.ok_at)}</small> ${status(fs)}
  </div>
</div>
${withStores ? renderStores(slots, worldVnd) : NO_STORES_NOTE}${withHistory ? HISTORY_SECTION : NO_HISTORY_NOTE}<p class="note">Chênh lệch = giá bán ra trong nước − giá thế giới quy đổi (giá USD/oz × 1,205653 oz/lượng × tỷ giá). Chưa tính thuế, phí gia công, vận chuyển. Chỉ mang tính tham khảo.</p>
${withHistory ? HISTORY_SCRIPTS : ''}</body>
</html>`;
}
