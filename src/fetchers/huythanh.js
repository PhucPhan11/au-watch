// Huy Thanh Jewelry: prices are embedded as JSON in the Next.js page data
// (self.__next_f.push chunks → "prices":[…], "updateInfo":{date,time}).
// Unit on the site: "Đơn vị: Đồng/chỉ" → converted to VND per lượng.
import { vndPerChiToLuong, isPure, vnDateTime } from './util.js';

export const id = 'huythanh';
export const source = 'Huy Thanh';
const DEFAULT_URL = 'https://huythanhjewelry.vn/gia-vang-hom-nay';

// Display labels and order, as on the store's own page (SJC is hidden there too).
const LABELS = [
  ['24K', 'Vàng Huy Thanh 24k'],
  ['24KTT', 'Vàng thị trường 24k'],
  ['22K', 'Giá nguyên liệu 22K'],
  ['18K', 'Giá nguyên liệu 18K'],
  ['14K', 'Giá nguyên liệu 14K'],
  ['10K', 'Giá nguyên liệu 10K'],
];

/** Concatenate the decoded strings of every self.__next_f.push([1,"…"]) call. */
function nextPayload(html) {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let out = '';
  for (const m of html.matchAll(re)) out += JSON.parse(`"${m[1]}"`);
  return out;
}

/** JSON value (array/object) that starts at `start` in `text`. */
function jsonAt(text, start) {
  const open = text[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error('Huy Thanh: unterminated JSON');
}

export function parse(html, fetchedAt = new Date()) {
  const payload = nextPayload(String(html ?? ''));
  const p = payload.indexOf('"prices":[');
  if (p < 0) throw new Error('Huy Thanh: prices not found in page data');
  const prices = jsonAt(payload, payload.indexOf('[', p));
  const u = payload.indexOf('"updateInfo":{');
  const info = u >= 0 ? jsonAt(payload, payload.indexOf('{', u)) : null;
  const updated = info ? vnDateTime(info.date, info.time) : null;

  const quotes = [];
  for (const [code, label] of LABELS) {
    const row = prices.find((r) => r.loaivang === code);
    if (!row) continue;
    const buy = vndPerChiToLuong(row.giamua, `${label} buy`);
    const sell = vndPerChiToLuong(row.giaban, `${label} sell`);
    if (buy == null && sell == null) continue;
    quotes.push({
      source, code, product: label, buy, sell,
      unit: 'luong', currency: 'VND', fetched_at: fetchedAt.toISOString(),
      source_updated_at: updated, pure: isPure(code),
    });
  }
  if (quotes.length === 0) throw new Error('Huy Thanh: no priced products');
  return quotes;
}

export async function fetch(http) {
  return parse(await http(process.env.HUYTHANH_URL || DEFAULT_URL, { as: 'text' }));
}
