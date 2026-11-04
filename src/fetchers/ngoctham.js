// Ngọc Thẩm (Cần Thơ): the JSON feed the store's own price page polls.
// Unit on the site: "ĐƠN VỊ TÍNH VND/CHỈ" → converted to VND per lượng.
import { vndPerChiToLuong, isPure } from './util.js';

export const id = 'ngoctham';
export const source = 'Ngọc Thẩm';
const DEFAULT_URL = 'https://ngoctham.com/ajax/proxy_banggia.php';

const hidden = (flag) => String(flag) === '1';

export function parse(raw, fetchedAt = new Date()) {
  if (!raw || !Array.isArray(raw.chitiet)) throw new Error('Ngọc Thẩm: missing chitiet array');
  // "2026-11-04 13:37:00" is Vietnam local time.
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}(?::\d{2})?)$/.exec(String(raw.date ?? ''));
  const updated = m ? new Date(`${m[1]}T${m[2].length === 5 ? `${m[2]}:00` : m[2]}+07:00`).toISOString() : null;
  const quotes = raw.chitiet.map((row) => {
    const product = String(row.loaivang ?? '').trim();
    return {
      source, code: String(row.idloaivang?.[0] ?? product), product,
      buy: hidden(row.chihiengiamua) ? null : vndPerChiToLuong(row.giamua, `${product} buy`),
      sell: hidden(row.chihiengiaban) ? null : vndPerChiToLuong(row.giaban, `${product} sell`),
      unit: 'luong', currency: 'VND', fetched_at: fetchedAt.toISOString(),
      source_updated_at: updated, pure: isPure(product),
    };
  }).filter((q) => q.product && (q.buy != null || q.sell != null));
  if (quotes.length === 0) throw new Error('Ngọc Thẩm: no priced products');
  return quotes;
}

export async function fetch(http) {
  return parse(await http(process.env.NGOCTHAM_URL || DEFAULT_URL));
}
