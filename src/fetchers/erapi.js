// open.er-api.com (ExchangeRate-API free tier): daily mid-market USD/VND. Reference only.
import { num, inRange } from './util.js';

export const id = 'erapi';
export const source = 'ExchangeRate-API';
const DEFAULT_URL = 'https://open.er-api.com/v6/latest/USD';

export function parse(raw, fetchedAt = new Date()) {
  if (raw?.result !== 'success' || raw.base_code !== 'USD') throw new Error('ExchangeRate-API: unexpected payload');
  const rate = inRange(num(raw.rates?.VND, 'USD/VND'), 10_000, 100_000, 'USD/VND');
  return [{
    source, code: 'USDVND', product: 'USD/VND (tham khảo)',
    buy: rate, sell: rate, unit: 'USD', currency: 'VND', fetched_at: fetchedAt.toISOString(),
  }];
}

export async function fetch(http) {
  return parse(await http(process.env.ERAPI_URL || DEFAULT_URL));
}
