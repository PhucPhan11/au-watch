// gold-api.com free spot price, USD per troy ounce. One module per metal via makeGoldApi.
import { num, inRange } from './util.js';

/** Fetcher (id/source/parse/fetch) for one gold-api.com symbol, with a plausible USD/oz band. */
export function makeGoldApi({ id, symbol, env, min, max }) {
  const source = 'gold-api.com';
  const DEFAULT_URL = `https://api.gold-api.com/price/${symbol}`;
  function parse(raw, fetchedAt = new Date()) {
    if (!raw || raw.symbol !== symbol || raw.currency !== 'USD') throw new Error('gold-api: unexpected payload');
    const price = inRange(num(raw.price, 'gold-api price'), min, max, 'gold-api price');
    return [{
      source, code: symbol, product: `${symbol}/USD`,
      buy: price, sell: price, unit: 'oz', currency: 'USD', fetched_at: fetchedAt.toISOString(),
    }];
  }
  return {
    id, source, parse,
    fetch: async (http) => parse(await http(process.env[env] || DEFAULT_URL)),
  };
}

const xau = makeGoldApi({ id: 'goldapi', symbol: 'XAU', env: 'GOLDAPI_URL', min: 100, max: 100_000 });
export const { id, source, parse, fetch } = xau;
export const xag = makeGoldApi({ id: 'goldapi_xag', symbol: 'XAG', env: 'GOLDAPI_XAG_URL', min: 1, max: 1_000 });
