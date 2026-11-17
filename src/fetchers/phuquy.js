// Phú Quý silver price table (Hà Nội): the HTML partial their own page loads by AJAX. No CORS,
// so local app only. Prices include VAT. Units: đ/lượng, one row in đ/kg.
import {
  num, inRange, htmlText, vnDateTime, VND_LUONG_SILVER_MIN, VND_LUONG_SILVER_MAX, LUONG_PER_KG,
} from './util.js';

export const id = 'phuquy';
export const source = 'Phú Quý';
const BASE = 'https://giabac.phuquygroup.vn';
const DEFAULT_URL = `${BASE}/PhuQuyPrice/SilverPricePartial`;
const TIME_URL = `${BASE}/PhuQuyPrice/GetDateTimeUpdate`;

/** "BẠC MIẾNG PHÚ QUÝ 999 1 LƯỢNG" → "Bạc Miếng Phú Quý 999 1 Lượng". */
const titleCase = (s) => s.toLocaleLowerCase('vi').replace(/(^|[\s(-])(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('vi'));

function cell(row, cls) {
  const m = new RegExp(`<td[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</td>`).exec(row);
  return m ? htmlText(m[1]) : null;
}

function price(text, unit, what) {
  if (text == null || !/\d/.test(text)) return null; // "_" = not offered
  const f = unit === 'kg' ? LUONG_PER_KG : 1;
  return inRange(num(text, what), VND_LUONG_SILVER_MIN * f, VND_LUONG_SILVER_MAX * f, what);
}

/** HTML partial (+ optional GetDateTimeUpdate JSON) → quotes. The 1-lượng bar has code PQ_1L. */
export function parse(html, fetchedAt = new Date(), time = null) {
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(String(html))?.[1];
  if (!body) throw new Error('Phú Quý: price table not found');
  const updated = time?.success ? vnDateTime(time.lastDate, time.lastTime) : null;
  const quotes = [];
  let group = null;
  for (const [, row] of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const heading = /<th[^>]*>([\s\S]*?)<\/th>/.exec(row);
    if (heading) {
      group = titleCase(htmlText(heading[1]));
      continue;
    }
    const name = cell(row, 'silver-product-name');
    if (!name) continue;
    const unitText = cell(row, 'silver-unit') ?? '';
    const unit = /KG/i.test(unitText) ? 'kg' : /L[ƯU]ỢNG/i.test(unitText) ? 'luong' : null;
    if (!unit) throw new Error(`Phú Quý: unknown unit ${JSON.stringify(unitText)}`);
    const product = titleCase(name);
    const buy = price(cell(row, 'silver-buy-price'), unit, `Phú Quý ${product} buy`);
    const sell = price(cell(row, 'silver-sell-price'), unit, `Phú Quý ${product} sell`);
    if (buy == null && sell == null) continue;
    const code = /miếng.*999.*\b1 lượng/i.test(product) ? 'PQ_1L' : `PQ_${quotes.length + 1}`;
    quotes.push({
      source, code, product, group, buy, sell, unit, currency: 'VND', fetched_at: fetchedAt.toISOString(),
      source_updated_at: updated, pure: unit === 'luong' && /999/.test(product),
    });
  }
  if (!quotes.some((q) => q.code === 'PQ_1L')) throw new Error('Phú Quý: 1-lượng bar (Bạc miếng 999 1 lượng) not found');
  return quotes;
}

export async function fetch(http) {
  const [html, time] = await Promise.all([
    http(process.env.PHUQUY_URL || DEFAULT_URL, { as: 'text' }),
    http(process.env.PHUQUY_TIME_URL || TIME_URL).catch(() => null), // update time is optional
  ]);
  return parse(html, new Date(), time);
}
