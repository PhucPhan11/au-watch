// Vietcombank daily exchange rates. buy = transfer rate, sell = sell rate (the rate we convert with).
import { num, inRange } from './util.js';

export const id = 'vcb';
export const source = 'Vietcombank';
const DEFAULT_URL = 'https://www.vietcombank.com.vn/api/exchangerates';

export function parse(raw, fetchedAt = new Date()) {
  const usd = raw?.Data?.find?.((r) => r.currencyCode === 'USD');
  if (!usd) throw new Error('Vietcombank: USD row not found');
  const buy = inRange(num(usd.transfer, 'VCB transfer'), 10_000, 100_000, 'VCB transfer');
  const sell = inRange(num(usd.sell, 'VCB sell'), 10_000, 100_000, 'VCB sell');
  return [{
    source, code: 'USDVND', product: 'USD/VND (bán ra)',
    buy, sell, unit: 'USD', currency: 'VND', fetched_at: fetchedAt.toISOString(),
  }];
}

/** Today's date in Vietnam as YYYY-MM-DD. */
export function vnDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
}

export async function fetch(http) {
  const base = process.env.VCB_URL || DEFAULT_URL;
  return parse(await http(`${base}?date=${vnDate()}`));
}
