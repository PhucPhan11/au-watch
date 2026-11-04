// Pure conversion and gap math.
export const GRAMS_PER_LUONG = 37.5;
export const GRAMS_PER_TROY_OZ = 31.1034768;
export const OZ_PER_LUONG = GRAMS_PER_LUONG / GRAMS_PER_TROY_OZ; // ≈ 1.205653

/** Midpoint of a quote's buy/sell (equal for single-price sources). */
export function mid(quote) {
  return (quote.buy + quote.sell) / 2;
}

/** World price in USD per troy ounce → VND per lượng. */
export function usdOzToVndLuong(usdPerOz, usdVnd) {
  if (!(usdPerOz > 0) || !(usdVnd > 0)) throw new RangeError('usdPerOz and usdVnd must be positive');
  return usdPerOz * OZ_PER_LUONG * usdVnd;
}

/** Gap of a Vietnamese sell price over the converted world price. */
export function gap(vnSellVndLuong, worldVndLuong) {
  if (!(worldVndLuong > 0)) throw new RangeError('worldVndLuong must be positive');
  const abs = vnSellVndLuong - worldVndLuong;
  return { abs, pct: (abs / worldVndLuong) * 100 };
}
