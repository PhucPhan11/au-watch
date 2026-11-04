// gold-api.com free spot price, USD per troy ounce.
import { num, inRange } from './util.js';

export const id = 'goldapi';
export const source = 'gold-api.com';
const DEFAULT_URL = 'https://api.gold-api.com/price/XAU';

export function parse(raw, fetchedAt = new Date()) {
  if (!raw || raw.symbol !== 'XAU' || raw.currency !== 'USD') throw new Error('gold-api: unexpected payload');
  const price = inRange(num(raw.price, 'gold-api price'), 100, 100_000, 'gold-api price');
  return [{
    source, code: 'XAU', product: 'XAU/USD',
    buy: price, sell: price, unit: 'oz', currency: 'USD', fetched_at: fetchedAt.toISOString(),
  }];
}

export async function fetch(http) {
  return parse(await http(process.env.GOLDAPI_URL || DEFAULT_URL));
}
