// Pure helpers turning fetched history points into snapshot rows.

/**
 * Merge resolution tiers for one series. `tiers` is ordered finest → coarsest; each is a list of
 * points sorted by ts. A coarser tier only contributes points older than everything already kept.
 */
export function mergeTiers(tiers) {
  let kept = [];
  for (const points of tiers) {
    if (!points?.length) continue;
    const cutoff = kept.length ? kept[0].ts : Infinity;
    kept = [...points.filter((p) => p.ts < cutoff), ...kept];
  }
  return kept;
}

/**
 * Points [{ts, buy, sell}] → change rows [ts, seen_until, buy, sell] (same policy as history.record:
 * a new row only when buy or sell changes). seen_until is the next change's ts, so the line is
 * continuous; the last row ends at its last observation.
 */
export function toChangeRows(points) {
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  const rows = [];
  for (const p of sorted) {
    const last = rows.at(-1);
    if (last && last[2] === p.buy && last[3] === p.sell) {
      last[1] = p.ts;
      continue;
    }
    if (last) last[1] = p.ts;
    rows.push([p.ts, p.ts, p.buy, p.sell]);
  }
  return rows;
}

/** Yahoo close points → {ts, buy, sell} with buy = sell = close × ratio, rounded to `digits`. */
export function closeToQuotes(points, { ratio = 1, digits = 2 } = {}) {
  const f = 10 ** digits;
  return points.map((p) => {
    const v = Math.round(p.close * ratio * f) / f;
    return { ts: p.ts, buy: v, sell: v };
  });
}

/** 'YYYYMMDD' for each Vietnam calendar day in [fromMs, toMs], newest first. */
export function vnDays(fromMs, toMs) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const days = new Set();
  for (let t = toMs; t >= fromMs; t -= 86_400_000) days.add(fmt.format(t).replaceAll('-', ''));
  days.add(fmt.format(fromMs).replaceAll('-', ''));
  return [...days].sort().reverse();
}
