// Price history in SQLite (built-in node:sqlite).
// One row per (series, value change). Unchanged values only advance `seen_until`, so
// "price unchanged" (line continues) stays distinct from "app not running" (chart gap).
// World price and gap are derived per bucket at query time from convert.js.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { mid, usdOzToVndLuong, gap } from './convert.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const RANGES = {
  '24h': { span: DAY, bucket: 10 * MIN },
  '7d': { span: 7 * DAY, bucket: HOUR },
  '30d': { span: 30 * DAY, bucket: DAY },
  '1y': { span: 365 * DAY, bucket: DAY },
};

const SERIES = ['vn_sjc', 'vn_pnj_ring', 'world_xau', 'fx_usdvnd'];

export function openHistory(file, { graceMs = 10 * MIN } = {}) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY,
      series TEXT NOT NULL,
      source TEXT NOT NULL,
      product TEXT NOT NULL,
      ts INTEGER NOT NULL,
      seen_until INTEGER NOT NULL,
      buy REAL NOT NULL,
      sell REAL NOT NULL,
      unit TEXT NOT NULL,
      currency TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS snapshots_series_ts ON snapshots(series, ts);
  `);

  const latest = db.prepare('SELECT id, buy, sell FROM snapshots WHERE series = ? ORDER BY ts DESC, id DESC LIMIT 1');
  const insert = db.prepare(`INSERT INTO snapshots (series, source, product, ts, seen_until, buy, sell, unit, currency)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const touch = db.prepare('UPDATE snapshots SET seen_until = ? WHERE id = ? AND seen_until < ?');
  const inRange = db.prepare(`SELECT series, ts, seen_until, buy, sell FROM snapshots
                              WHERE ts <= ? AND seen_until + ? >= ? ORDER BY series, ts, id`);
  const firstTs = db.prepare('SELECT MIN(ts) AS t FROM snapshots');
  const countRows = db.prepare('SELECT COUNT(*) AS n FROM snapshots');

  return {
    /** Total stored rows (for /health). */
    count() { return countRows.get().n; },

    /** Save fresh slots. Stale/failed slots are skipped. Returns counts. */
    record(slots) {
      let inserted = 0;
      let touched = 0;
      db.exec('BEGIN');
      try {
        for (const slot of Object.values(slots)) {
          const q = slot?.quotes?.[0];
          if (!slot || slot.stale || !q || !slot.ok_at) continue;
          const ts = Date.parse(slot.ok_at);
          const last = latest.get(slot.key);
          if (last && last.buy === q.buy && last.sell === q.sell) {
            touch.run(ts, last.id, ts);
            touched++;
          } else {
            insert.run(slot.key, q.source, q.product, ts, ts, q.buy, q.sell, q.unit, q.currency);
            inserted++;
          }
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return { inserted, touched };
    },

    /** Downsampled history for a named range ending at `now` (ms). */
    query(range, now = Date.now()) {
      const r = RANGES[range];
      if (!r) throw new RangeError(`Unknown range: ${range}`);
      const to = now;
      const from = to - r.span;
      const rows = inRange.all(to, graceMs, from);
      const first = firstTs.get().t;
      return { range, ...bucketize(rows, { from, to, bucketMs: r.bucket, graceMs }), first_recorded: first ?? null };
    },

    close() { db.close(); },
  };
}

/**
 * Pure downsampling. For each bucket, each series takes its latest row that started before the
 * bucket end and was still valid (seen_until + grace) at the bucket start; otherwise null.
 */
export function bucketize(rows, { from, to, bucketMs, graceMs }) {
  const n = Math.ceil((to - from) / bucketMs);
  const bySeries = Object.fromEntries(SERIES.map((s) => [s, []]));
  for (const row of rows) bySeries[row.series]?.push(row);

  const t = [];
  const pick = Object.fromEntries(SERIES.map((s) => [s, []]));
  const ptr = Object.fromEntries(SERIES.map((s) => [s, -1]));
  for (let i = 0; i < n; i++) {
    const end = to - (n - 1 - i) * bucketMs;
    const start = end - bucketMs;
    t.push(end);
    for (const s of SERIES) {
      const list = bySeries[s];
      while (ptr[s] + 1 < list.length && list[ptr[s] + 1].ts <= end) ptr[s]++;
      const row = list[ptr[s]];
      pick[s].push(row && row.seen_until + graceMs >= start ? row : null);
    }
  }

  const out = {
    bucket_ms: bucketMs, from, to, t,
    sjc_buy: [], sjc_sell: [], ring_sell: [], world_vnd_luong: [],
    gap_sjc_abs: [], gap_sjc_pct: [], gap_ring_abs: [], gap_ring_pct: [],
  };
  let complete = 0;
  for (let i = 0; i < n; i++) {
    const sjc = pick.vn_sjc[i];
    const ring = pick.vn_pnj_ring[i];
    const xau = pick.world_xau[i];
    const fx = pick.fx_usdvnd[i];
    const world = xau && fx ? usdOzToVndLuong(mid(xau), fx.sell) : null;
    const gs = sjc && world ? gap(sjc.sell, world) : null;
    const gr = ring && world ? gap(ring.sell, world) : null;
    out.sjc_buy.push(sjc ? sjc.buy : null);
    out.sjc_sell.push(sjc ? sjc.sell : null);
    out.ring_sell.push(ring ? ring.sell : null);
    out.world_vnd_luong.push(world);
    out.gap_sjc_abs.push(gs ? gs.abs : null);
    out.gap_sjc_pct.push(gs ? gs.pct : null);
    out.gap_ring_abs.push(gr ? gr.abs : null);
    out.gap_ring_pct.push(gr ? gr.pct : null);
    if (gs || gr) complete++;
  }
  out.enough = complete >= 2;
  return out;
}
