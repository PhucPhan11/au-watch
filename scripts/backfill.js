// One-off history backfill: fetches past prices for the 4 charted series, writes the committed
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
import { mergeTiers, toChangeRows, closeToQuotes, vnDays } from '../src/backfill/build.js';

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

async function fxRatio(latestYahoo) {
  let vcbSell = null;
  try {
    vcbSell = (await vcb.fetch(http)).find((q) => q.code === 'USDVND').sell;
  } catch (err) {
    logEvent('error', 'backfill_fx_ratio', { source: 'vcb', error: err.message });
    const cacheFile = join(DATA_DIR, 'cache.json');
    if (existsSync(cacheFile)) {
      const c = JSON.parse(readFileSync(cacheFile, 'utf8'));
      vcbSell = (c.slots ?? c).fx_usdvnd?.quotes?.[0]?.sell ?? null;
    }
  }
  if (!vcbSell) throw new Error('no VCB sell rate available to scale Yahoo USD/VND');
  return vcbSell / latestYahoo;
}

async function main() {
  const series = { vn_sjc: [], vn_pnj_ring: [], world_xau: [], fx_usdvnd: [] }; // per-series tier lists
  const report = [];

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
    for (const [key, symbol] of [['world_xau', 'GC=F'], ['fx_usdvnd', 'USDVND=X']]) {
      try {
        series[key].push(await fetchChart(yahooHttp, symbol, ...tier.yahoo));
        status[key] = `ok (${series[key].at(-1).length} points @${tier.yahoo[1]})`;
      } catch (err) {
        series[key].push([]);
        status[key] = `skipped: ${err.message}`;
      }
    }
    logEvent(Object.values(status).some((v) => String(v).startsWith('skipped')) ? 'error' : 'info', 'backfill_tier', status);
    report.push(status);
  }

  // PNJ tiers cover disjoint day windows, so merging is a plain concatenation.
  const merged = {
    vn_sjc: series.vn_sjc.flat(),
    vn_pnj_ring: series.vn_pnj_ring.flat(),
    world_xau: mergeTiers(series.world_xau),
    fx_usdvnd: mergeTiers(series.fx_usdvnd),
  };

  const seed = { version: 1, generated_at: new Date(NOW).toISOString(), fx_ratio: null, series: {} };
  for (const key of ['vn_sjc', 'vn_pnj_ring']) {
    if (merged[key].length) seed.series[key] = { ...pnjHistory.META[key], rows: toChangeRows(merged[key]) };
  }
  if (merged.world_xau.length) {
    seed.series.world_xau = {
      source: 'Yahoo Finance (COMEX GC=F)', product: 'XAU/USD', unit: 'oz', currency: 'USD',
      rows: toChangeRows(closeToQuotes(merged.world_xau, { digits: 2 })),
    };
  }
  if (merged.fx_usdvnd.length) {
    try {
      const ratio = await fxRatio(merged.fx_usdvnd.at(-1).close);
      seed.fx_ratio = Math.round(ratio * 1e6) / 1e6;
      seed.series.fx_usdvnd = {
        source: 'Yahoo Finance (USDVND=X, scaled to Vietcombank)', product: 'USD/VND (bán ra)', unit: 'USD', currency: 'VND',
        rows: toChangeRows(closeToQuotes(merged.fx_usdvnd, { ratio: seed.fx_ratio, digits: 0 })),
      };
    } catch (err) {
      logEvent('error', 'backfill_series', { series: 'fx_usdvnd', state: 'skipped', error: err.message });
    }
  }
  if (Object.keys(seed.series).length === 0) throw new Error('nothing fetched; seed not written');

  mkdirSync(dirname(SEED_FILE), { recursive: true });
  const gz = gzipSync(JSON.stringify(seed), { level: 9 });
  writeFileSync(SEED_FILE, gz);
  const rows = Object.fromEntries(Object.entries(seed.series).map(([k, s]) => [k, s.rows.length]));
  logEvent('info', 'backfill_seed', { file: SEED_FILE, bytes: gz.length, fx_ratio: seed.fx_ratio, rows });

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
