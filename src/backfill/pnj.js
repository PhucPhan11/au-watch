// PNJ price-change log for one day (history backfill only; not a live fetcher).
// Response: { locations: [{ name, gold_type: [{ name, data: [{ gia_ban, gia_mua, updated_at }] }] }] }
// Prices are strings in thousand đ/lượng with '.' as thousands separator ("136.600" → 136,600,000).
import { inRange, VND_LUONG_MIN, VND_LUONG_MAX } from '../fetchers/util.js';

const DEFAULT_URL = 'https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price-history';
const LOCATION = 'TPHCM';
// gold_type name → history series (PNJ = "Nhẫn Trơn PNJ 999.9", checked against the live N24K quote).
const TYPES = { SJC: 'vn_sjc', PNJ: 'vn_pnj_ring' };

export const META = {
  vn_sjc: { source: 'PNJ', product: 'Vàng miếng SJC 999.9', unit: 'luong', currency: 'VND' },
  vn_pnj_ring: { source: 'PNJ', product: 'Nhẫn Trơn PNJ 999.9', unit: 'luong', currency: 'VND' },
};

function price(value, what) {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  if (!digits) throw new Error(`PNJ history: invalid ${what}: ${JSON.stringify(value)}`);
  return inRange(Number(digits) * 1000, VND_LUONG_MIN, VND_LUONG_MAX, `PNJ history ${what}`);
}

/** 'DD/MM/YYYY HH:MM:SS' (Vietnam time) → epoch ms. */
function vnTs(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(s ?? '').trim());
  if (!m) throw new Error(`PNJ history: bad updated_at ${JSON.stringify(s)}`);
  return Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? '00'}+07:00`);
}

/**
 * One day's response → { vn_sjc: [{ts,buy,sell}], vn_pnj_ring: [...] } sorted by ts. Empty day → empty lists.
 * A single implausible row (PNJ's log has occasional typos) is dropped and reported via onReject;
 * if every row of a product is bad the whole day throws (likely a unit/format change).
 */
export function parseDay(raw, { onReject = null } = {}) {
  if (!raw || !Array.isArray(raw.locations)) throw new Error('PNJ history: missing locations array');
  const out = { vn_sjc: [], vn_pnj_ring: [] };
  const loc = raw.locations.find((l) => l?.name === LOCATION);
  if (!loc) return out; // no price changes recorded that day
  if (!Array.isArray(loc.gold_type)) throw new Error('PNJ history: missing gold_type array');
  for (const type of loc.gold_type) {
    const series = TYPES[type?.name];
    if (!series) continue;
    const data = type.data ?? [];
    let rejected = null;
    for (const row of data) {
      try {
        out[series].push({
          ts: vnTs(row.updated_at),
          buy: price(row.gia_mua, `${type.name} buy`),
          sell: price(row.gia_ban, `${type.name} sell`),
        });
      } catch (err) {
        rejected = err;
        onReject?.(err, row);
      }
    }
    if (data.length && out[series].length === 0) throw rejected;
    out[series].sort((a, b) => a.ts - b.ts);
  }
  return out;
}

/** ymd: 'YYYYMMDD'. */
export async function fetchDay(http, ymd, opts) {
  return parseDay(await http(`${process.env.PNJ_HISTORY_URL || DEFAULT_URL}?zone=00&date=${ymd}`), opts);
}
