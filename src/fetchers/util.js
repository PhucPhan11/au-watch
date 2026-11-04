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
