export function num(value, what) {
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid ${what}: ${JSON.stringify(value)}`);
  return n;
}

/** Guard against silent unit changes: value must sit in [min, max]. */
export function inRange(n, min, max, what) {
  if (n < min || n > max) throw new Error(`${what} out of plausible range: ${n}`);
  return n;
}

// VND per lượng for 99.99 gold: plausible band 10M–1B.
export const VND_LUONG_MIN = 10_000_000;
export const VND_LUONG_MAX = 1_000_000_000;

// --- Store helpers (Cần Thơ stores quote VND per chỉ; 1 lượng = 10 chỉ) ---

/**
 * Store price per chỉ → VND per lượng. Hidden/empty/0 values become null
 * (the store shows no price for that side); present values must be plausible.
 */
export function vndPerChiToLuong(value, what) {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  const n = Number(digits);
  if (!digits || n === 0) return null;
  return inRange(n * 10, VND_LUONG_MIN, VND_LUONG_MAX, what);
}

/** Near-pure gold (24K / 999 / 9999 / SJC): the only rows compared with the world price. */
export function isPure(name) {
  return /24k|9999|(^|\D)999(\D|$)|sjc/i.test(String(name));
}

/** 'DD/MM/YYYY' + 'HH:MM' (Vietnam time) → ISO string, or null. */
export function vnDateTime(date, time = '00:00') {
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(date).trim());
  const t = /^(\d{1,2}):(\d{2})/.exec(String(time).trim());
  if (!d || !t) return null;
  const pad = (x) => String(x).padStart(2, '0');
  return new Date(`${d[3]}-${pad(d[2])}-${pad(d[1])}T${pad(t[1])}:${t[2]}:00+07:00`).toISOString();
}

/** Plain text of an HTML fragment (tags stripped, common entities decoded, spaces collapsed). */
export function htmlText(fragment) {
  return String(fragment)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(Number(c)))
    .replace(/\s+/g, ' ')
    .trim();
}
