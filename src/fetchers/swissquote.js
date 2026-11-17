// Swissquote public bid/ask feed ("prime" spread profile, first platform). One module per metal.
import { num, inRange } from './util.js';

/** Fetcher (id/source/parse/fetch) for one Swissquote instrument vs USD, with a plausible band. */
export function makeSwissquote({ id, symbol, env, min, max }) {
  const source = 'Swissquote';
  const DEFAULT_URL = `https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/${symbol}/USD`;
  function parse(raw, fetchedAt = new Date()) {
    if (!Array.isArray(raw) || raw.length === 0) throw new Error('Swissquote: empty payload');
    const profiles = raw[0].spreadProfilePrices ?? [];
    const p = profiles.find((x) => x.spreadProfile === 'prime') ?? profiles[0];
    if (!p) throw new Error('Swissquote: no spread profile');
    const bid = inRange(num(p.bid, 'Swissquote bid'), min, max, 'Swissquote bid');
    const ask = inRange(num(p.ask, 'Swissquote ask'), min, max, 'Swissquote ask');
    return [{
      source, code: symbol, product: `${symbol}/USD`,
      buy: bid, sell: ask, unit: 'oz', currency: 'USD', fetched_at: fetchedAt.toISOString(),
    }];
  }
  return {
    id, source, parse,
    fetch: async (http) => parse(await http(process.env[env] || DEFAULT_URL)),
  };
}

const xau = makeSwissquote({ id: 'swissquote', symbol: 'XAU', env: 'SWISSQUOTE_URL', min: 100, max: 100_000 });
export const { id, source, parse, fetch } = xau;
export const xag = makeSwissquote({ id: 'swissquote_xag', symbol: 'XAG', env: 'SWISSQUOTE_XAG_URL', min: 1, max: 1_000 });
