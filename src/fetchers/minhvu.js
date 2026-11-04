// Minh Vũ Jewelry (Cần Thơ): no feed, so the "Bảng giá vàng" table on the homepage is parsed.
// Prices are shown as "12.780.000 đ"; the size of the numbers means VND per chỉ → converted to per lượng.
import { vndPerChiToLuong, isPure, vnDateTime, htmlText } from './util.js';

export const id = 'minhvu';
export const source = 'Minh Vũ';
const DEFAULT_URL = 'https://minhvujewelry.vn/';

export function parse(html, fetchedAt = new Date()) {
  const s = String(html ?? '');
  const at = s.indexOf('bang-giavang');
  if (at < 0) throw new Error('Minh Vũ: price table (bang-giavang) not found');
  const end = s.indexOf('</table>', at);
  if (end < 0) throw new Error('Minh Vũ: price table not closed');
  const table = s.slice(at, end);

  // "Cập nhật ngày <span>03/11/2026 - 11:25</span>" just before the table.
  const head = htmlText(s.slice(Math.max(0, at - 600), at));
  const u = /Cập nhật ngày\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}:\d{2})/.exec(head);
  const updated = u ? vnDateTime(u[1], u[2]) : null;

  const quotes = [];
  for (const row of table.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const cells = (row.match(/<td[\s\S]*?<\/td>/g) ?? []).map(htmlText);
    if (cells.length < 3) continue; // header row uses <th>
    const [product, buy, sell] = cells;
    quotes.push({
      source, code: product, product,
      buy: vndPerChiToLuong(buy, `${product} buy`),
      sell: vndPerChiToLuong(sell, `${product} sell`),
      unit: 'luong', currency: 'VND', fetched_at: fetchedAt.toISOString(),
      source_updated_at: updated, pure: isPure(product),
    });
  }
  const priced = quotes.filter((q) => q.buy != null || q.sell != null);
  if (priced.length === 0) throw new Error('Minh Vũ: no priced rows');
  return priced;
}

export async function fetch(http) {
  return parse(await http(process.env.MINHVU_URL || DEFAULT_URL, { as: 'text' }));
}
