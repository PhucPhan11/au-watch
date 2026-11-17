// open.er-api.com (ExchangeRate-API free tier): daily mid-market rates. Reference only.
// USD-based, so CHF/VND and JPY/VND are cross rates: VND per USD ÷ CHF (JPY) per USD.
import { num, inRange } from './util.js';
import { FX } from './vcb.js';

export const id = 'erapi';
export const source = 'ExchangeRate-API';
const DEFAULT_URL = 'https://open.er-api.com/v6/latest/USD';

export function parse(raw, fetchedAt = new Date()) {
  if (raw?.result !== 'success' || raw.base_code !== 'USD') throw new Error('ExchangeRate-API: unexpected payload');
  const vnd = num(raw.rates?.VND, 'USD/VND');
  const quotes = [];
  for (const { ccy, min, max } of FX) {
    if (ccy !== 'USD' && raw.rates?.[ccy] == null) continue;
    const perUsd = ccy === 'USD' ? 1 : num(raw.rates[ccy], `${ccy}/USD`);
    const rate = inRange(vnd / perUsd, min, max, `${ccy}/VND`);
    quotes.push({
      source, code: `${ccy}VND`, product: `${ccy}/VND (tham khảo)`,
      buy: rate, sell: rate, unit: ccy, currency: 'VND', fetched_at: fetchedAt.toISOString(),
    });
  }
  return quotes;
}

export async function fetch(http) {
  return parse(await http(process.env.ERAPI_URL || DEFAULT_URL));
}
