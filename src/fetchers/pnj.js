// PNJ public price API. Raw values are in units of 10.000 đ (i.e. nghìn đồng/chỉ):
// API 14120 is shown on https://giavang.pnj.com.vn as 141.200 "ngàn đồng/lượng" = 141.200.000 đ/lượng.
import { num, inRange, VND_LUONG_MIN, VND_LUONG_MAX } from './util.js';

export const id = 'pnj';
export const source = 'PNJ';
const DEFAULT_URL = 'https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price?zone=00';
const RAW_TO_VND_LUONG = 10_000;

export function parse(raw, fetchedAt = new Date()) {
  if (!raw || !Array.isArray(raw.data)) throw new Error('PNJ: missing data array');
  const quotes = [];
  for (const row of raw.data) {
    if (row.giaban === '' || row.giamua === '' || row.giaban == null) continue; // buy-only rows
    const buy = inRange(num(row.giamua, 'PNJ buy') * RAW_TO_VND_LUONG, VND_LUONG_MIN, VND_LUONG_MAX, 'PNJ buy');
    const sell = inRange(num(row.giaban, 'PNJ sell') * RAW_TO_VND_LUONG, VND_LUONG_MIN, VND_LUONG_MAX, 'PNJ sell');
    quotes.push({
      source, code: String(row.masp), product: String(row.tensp),
      buy, sell, unit: 'luong', currency: 'VND', fetched_at: fetchedAt.toISOString(),
    });
  }
  if (quotes.length === 0) throw new Error('PNJ: no priced products');
  return quotes;
}

export async function fetch(http) {
  return parse(await http(process.env.PNJ_URL || DEFAULT_URL));
}
