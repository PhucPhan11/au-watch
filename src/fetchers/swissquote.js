// Swissquote public bid/ask feed for XAU/USD ("prime" spread profile, first platform).
import { num, inRange } from './util.js';

export const id = 'swissquote';
export const source = 'Swissquote';
const DEFAULT_URL = 'https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD';

export function parse(raw, fetchedAt = new Date()) {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('Swissquote: empty payload');
  const profiles = raw[0].spreadProfilePrices ?? [];
  const p = profiles.find((x) => x.spreadProfile === 'prime') ?? profiles[0];
  if (!p) throw new Error('Swissquote: no spread profile');
  const bid = inRange(num(p.bid, 'Swissquote bid'), 100, 100_000, 'Swissquote bid');
  const ask = inRange(num(p.ask, 'Swissquote ask'), 100, 100_000, 'Swissquote ask');
  return [{
    source, code: 'XAU', product: 'XAU/USD',
    buy: bid, sell: ask, unit: 'oz', currency: 'USD', fetched_at: fetchedAt.toISOString(),
  }];
}

export async function fetch(http) {
  return parse(await http(process.env.SWISSQUOTE_URL || DEFAULT_URL));
}
