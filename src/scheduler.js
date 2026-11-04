// Refresh loop. Each slot tries its sources in order (primary → fallback); if all fail it
// keeps its last known quotes and is marked stale. Slots are independent of each other.
import * as pnj from './fetchers/pnj.js';
import * as goldapi from './fetchers/goldapi.js';
import * as swissquote from './fetchers/swissquote.js';
import * as vcb from './fetchers/vcb.js';
import * as erapi from './fetchers/erapi.js';

export const FETCHERS = { pnj, goldapi, swissquote, vcb, erapi };

const byCode = (code) => (quotes) => quotes.filter((q) => q.code === code);
const first = (quotes) => quotes.slice(0, 1);

export const SLOTS = [
  // SJC bars come from PNJ's price list (sjc.com.vn's robots.txt blocks AI agents; not used).
  { key: 'vn_sjc', sources: [{ fetcher: 'pnj', pick: byCode('SJC') }] },
  { key: 'vn_pnj_ring', sources: [{ fetcher: 'pnj', pick: byCode('N24K') }] },
  { key: 'world_xau', sources: [{ fetcher: 'goldapi', pick: first }, { fetcher: 'swissquote', pick: first }] },
  { key: 'fx_usdvnd', sources: [{ fetcher: 'vcb', pick: first }, { fetcher: 'erapi', pick: first }] },
];

export async function refreshOnce({ cache, http, fetchers = FETCHERS, slots = SLOTS, now = () => new Date() }) {
  // Each source is requested at most once per cycle, even if several slots use it.
  const calls = new Map();
  const call = (fid) => {
    if (!calls.has(fid)) calls.set(fid, fetchers[fid].fetch(http));
    return calls.get(fid);
  };

  await Promise.allSettled(slots.map(async (slot) => {
    const errors = [];
    for (const { fetcher, pick } of slot.sources) {
      try {
        const quotes = pick(await call(fetcher));
        if (quotes.length === 0) throw new Error('product not found in response');
        cache.set(slot.key, {
          key: slot.key, quotes, source_used: fetcher, primary: fetcher === slot.sources[0].fetcher,
          ok_at: now().toISOString(), last_error: null, stale: false,
        });
        return;
      } catch (err) {
        errors.push(`${fetcher}: ${err.message}`);
      }
    }
    const prev = cache.get(slot.key);
    cache.set(slot.key, {
      key: slot.key, quotes: prev?.quotes ?? [], source_used: prev?.source_used ?? null,
      primary: prev?.primary ?? false, ok_at: prev?.ok_at ?? null,
      last_error: errors.join('; '), stale: true,
    });
  }));
  return cache.all();
}

export function startScheduler({ cache, http, intervalMs, history = null, log = console.log }) {
  const tick = async () => {
    const slots = await refreshOnce({ cache, http });
    for (const s of Object.values(slots)) {
      log(`[refresh] ${s.key}: ${s.stale ? `STALE (${s.last_error})` : `ok via ${s.source_used}`}`);
    }
    if (history) {
      try {
        const { inserted, touched } = history.record(slots);
        log(`[history] ${inserted} new row(s), ${touched} unchanged`);
      } catch (err) {
        log(`[history] write failed: ${err.message}`);
      }
    }
    await cache.save().catch((err) => log(`[cache] save failed: ${err.message}`));
  };
  tick();
  return setInterval(tick, intervalMs);
}
