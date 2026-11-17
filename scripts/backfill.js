// One-off history backfill: fetches past prices for the charted series (gold + USD/CHF/JPY rates), writes the committed
// seed (seed/history.json.gz) and imports it into DATA_DIR/history.db.
// Each range tier (5y, 1y, 30d, 7d/24h) is fetched independently; a tier that fails is skipped.
// Usage: npm run backfill
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeHttp } from '../src/http.js';
import { logEvent } from '../src/scheduler.js';
import { openHistory } from '../src/history.js';
import * as vcb from '../src/fetchers/vcb.js';
import * as pnjHistory from '../src/backfill/pnj.js';
import { fetchChart } from '../src/backfill/yahoo.js';
import { mergeTiers, toChangeRows, closeToQuotes, crossRate, vnDays } from '../src/backfill/build.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA_DIR = resolve(process.env.DATA_DIR || join(ROOT, 'data'));
const SEED_FILE = join(ROOT, 'seed', 'history.json.gz');
const DAY = 86_400_000;
const NOW = Date.now();

// Finest → coarsest. Yahoo serves 5m only for recent days, 15m ≤ 60d, 1h ≤ 730d.
const TIERS = [
  { name: '7d/24h', yahoo: ['7d', '5m'], pnjDays: [0, 7] },
  { name: '30d', yahoo: ['60d', '15m'], pnjDays: [7, 30] },
  { name: '1y', yahoo: ['1y', '1h'], pnjDays: [30, 365] },
  { name: '5y', yahoo: ['5y', '1d'], pnjDays: [365, 5 * 365 + 1] },
];

const http = makeHttp({ userAgent: process.env.USER_AGENT || 'au-watch/0.1', timeoutMs: 20_000 });
// Yahoo rejects unknown clients; use a browser-like UA for those calls only.
const yahooHttp = makeHttp({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', timeoutMs: 20_000 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pool(items, size, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
      await sleep(150); // be polite to PNJ
    }
  }));
  return results;
}

async function pnjTier(tier) {
  const [nearDays, farDays] = tier.pnjDays;
  const newest = vnDays(NOW - nearDays * DAY, NOW - nearDays * DAY)[0];
  const days = vnDays(NOW - farDays * DAY, NOW - nearDays * DAY).filter((d) => nearDays === 0 || d !== newest);
  const out = { vn_sjc: [], vn_pnj_ring: [] };
  let failed = 0;
  await pool(days, 3, async (ymd) => {
    try {
      const day = await pnjHistory.fetchDay(http, ymd, {
        onReject: (err, row) => logEvent('error', 'backfill_row', { source: 'pnj', date: ymd, error: err.message, row }),
      });
      out.vn_sjc.push(...day.vn_sjc);
      out.vn_pnj_ring.push(...day.vn_pnj_ring);
    } catch (err) {
      failed++;
      logEvent('error', 'backfill_day', { source: 'pnj', date: ymd, error: err.message });
    }
  });
  if (failed === days.length) throw new Error(`all ${days.length} PNJ days failed`);
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.ts - b.ts);
  return { ...out, days: days.length, failed };
}

const FX = [
  { ccy: 'USD', key: 'fx_usdvnd', direct: 'USDVND=X', cross: null, digits: 0 },
  { ccy: 'CHF', key: 'fx_chfvnd', direct: 'CHFVND=X', cross: 'CHF=X', digits: 0 },
  { ccy: 'JPY', key: 'fx_jpyvnd', direct: 'JPYVND=X', cross: 'JPY=X', digits: 2 },
];
const MIN_POINTS = 10; // Yahoo returns a single point for CHFVND=X / JPYVND=X at 5y@1d

/** Today's VCB transfer (buy) and sell per currency: fresh call, else the last cached table. */
async function vcbRates() {
  let quotes = null;
  try {
    quotes = await vcb.fetch(http);
  } catch (err) {
    logEvent('error', 'backfill_fx_ratio', { source: 'vcb', error: err.message });
    const cacheFile = join(DATA_DIR, 'cache.json');
    if (existsSync(cacheFile)) {
      const c = JSON.parse(readFileSync(cacheFile, 'utf8'));
      const slots = c.slots ?? c;
      if (slots.fx_rates?.source_used === 'vcb') quotes = slots.fx_rates.quotes;
    }
  }
  if (!quotes) throw new Error('no Vietcombank rates available to scale Yahoo rates');
  return Object.fromEntries(quotes.map((q) => [q.code.slice(0, 3), { buy: q.buy, sell: q.sell }]));
}

/** One FX tier: direct VND pair, or USDVND ÷ USD/XXX when the direct pair is too thin. */
async function fxTier(fx, tier, usdPoints) {
  let direct = [];
  try {
    direct = await fetchChart(yahooHttp, fx.direct, ...tier.yahoo);
  } catch (err) {
    if (!fx.cross) throw err;
  }
  if (direct.length >= MIN_POINTS || !fx.cross) return { points: direct, via: fx.direct };
  if (!usdPoints?.length) throw new Error(`${fx.direct} too thin and no USDVND=X points for a cross rate`);
  const points = crossRate(usdPoints, await fetchChart(yahooHttp, fx.cross, ...tier.yahoo));
  if (points.length < MIN_POINTS) throw new Error(`cross rate via ${fx.cross} too thin (${points.length} points)`);
  return { points, via: `USDVND=X ÷ ${fx.cross}` };
}

async function main() {
  // per-series lists of tiers, finest first
  const series = Object.fromEntries(['vn_sjc', 'vn_pnj_ring', 'world_xau', ...FX.map((f) => f.key)].map((k) => [k, []]));

  for (const tier of TIERS) {
    const status = { tier: tier.name };
    try {
      const p = await pnjTier(tier);
      series.vn_sjc.push(p.vn_sjc);
      series.vn_pnj_ring.push(p.vn_pnj_ring);
      status.pnj = `ok (${p.days - p.failed}/${p.days} days)`;
    } catch (err) {
      status.pnj = `skipped: ${err.message}`;
    }
    try {
      series.world_xau.push(await fetchChart(yahooHttp, 'GC=F', ...tier.yahoo));
      status.world_xau = `ok (${series.world_xau.at(-1).length} points @${tier.yahoo[1]})`;
    } catch (err) {
      series.world_xau.push([]);
      status.world_xau = `skipped: ${err.message}`;
    }
    for (const fx of FX) {
      try {
        const { points, via } = await fxTier(fx, tier, series.fx_usdvnd.at(-1));
        series[fx.key].push(points);
        status[fx.key] = `ok (${points.length} points @${tier.yahoo[1]}${via === fx.direct ? '' : `, ${via}`})`;
      } catch (err) {
        series[fx.key].push([]);
        status[fx.key] = `skipped: ${err.message}`;
      }
    }
    logEvent(Object.values(status).some((v) => String(v).startsWith('skipped')) ? 'error' : 'info', 'backfill_tier', status);
  }

  // PNJ tiers cover disjoint day windows, so merging is a plain concatenation.
  const merged = Object.fromEntries(Object.entries(series).map(([k, tiers]) => [k, k.startsWith('vn_') ? tiers.flat() : mergeTiers(tiers)]));

  const seed = { version: 2, generated_at: new Date(NOW).toISOString(), fx_ratios: {}, series: {} };
  for (const key of ['vn_sjc', 'vn_pnj_ring']) {
    if (merged[key].length) seed.series[key] = { ...pnjHistory.META[key], rows: toChangeRows(merged[key]) };
  }
  if (merged.world_xau.length) {
    seed.series.world_xau = {
      source: 'Yahoo Finance (COMEX GC=F)', product: 'XAU/USD', unit: 'oz', currency: 'USD',
      rows: toChangeRows(closeToQuotes(merged.world_xau, { digits: 2 })),
    };
  }
  // Yahoo rates are mid-market; scale buy/sell separately so history carries VCB's spread.
  let bank = null;
  try {
    bank = await vcbRates();
  } catch (err) {
    logEvent('error', 'backfill_series', { series: 'fx_*', state: 'skipped', error: err.message });
  }
  for (const fx of FX) {
    const points = merged[fx.key];
    if (!points.length || !bank?.[fx.ccy]) continue;
    const latest = points.at(-1).close;
    const ratio = {
      buy: Math.round((bank[fx.ccy].buy / latest) * 1e6) / 1e6,
      sell: Math.round((bank[fx.ccy].sell / latest) * 1e6) / 1e6,
    };
    seed.fx_ratios[fx.ccy] = ratio;
    seed.series[fx.key] = {
      source: 'Yahoo Finance (scaled to Vietcombank)', product: `${fx.ccy}/VND (bán ra)`, unit: fx.ccy, currency: 'VND',
      rows: toChangeRows(closeToQuotes(points, { buyRatio: ratio.buy, sellRatio: ratio.sell, digits: fx.digits })),
    };
  }
  if (Object.keys(seed.series).length === 0) throw new Error('nothing fetched; seed not written');

  mkdirSync(dirname(SEED_FILE), { recursive: true });
  const gz = gzipSync(JSON.stringify(seed), { level: 9 });
  writeFileSync(SEED_FILE, gz);
  const rows = Object.fromEntries(Object.entries(seed.series).map(([k, s]) => [k, s.rows.length]));
  logEvent('info', 'backfill_seed', { file: SEED_FILE, bytes: gz.length, fx_ratios: seed.fx_ratios, rows });

  const history = openHistory(join(DATA_DIR, 'history.db'));
  try {
    logEvent('info', 'backfill_import', history.importSeed(SEED_FILE));
  } finally {
    history.close();
  }
}

main().catch((err) => {
  logEvent('error', 'backfill', { error: err.message });
  process.exit(1);
});
