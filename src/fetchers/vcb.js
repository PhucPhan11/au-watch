// Vietcombank daily exchange rates for USD, CHF, JPY (VND per 1 unit).
// buy = transfer rate, buy_cash = cash buy (null if not offered), sell = sell rate (USD sell is the rate we convert with).
import { num, inRange } from './util.js';

export const id = 'vcb';
export const source = 'Vietcombank';
const DEFAULT_URL = 'https://www.vietcombank.com.vn/api/exchangerates';

// Plausible VND per 1 unit (guards against silent unit changes, e.g. JPY quoted per 100).
export const FX = [
  { ccy: 'USD', min: 10_000, max: 100_000 },
  { ccy: 'CHF', min: 10_000, max: 100_000 },
  { ccy: 'JPY', min: 50, max: 500 },
];

export function parse(raw, fetchedAt = new Date()) {
  if (!Array.isArray(raw?.Data)) throw new Error('Vietcombank: missing Data array');
  const quotes = [];
  for (const { ccy, min, max } of FX) {
    const row = raw.Data.find((r) => r.currencyCode === ccy);
    if (!row) {
      if (ccy === 'USD') throw new Error('Vietcombank: USD row not found'); // the gap needs it
      continue;
    }
    const cash = Number(String(row.cash).replace(/,/g, ''));
    quotes.push({
      source, code: `${ccy}VND`, product: `${ccy}/VND (bán ra)`,
      buy: inRange(num(row.transfer, `VCB ${ccy} transfer`), min, max, `VCB ${ccy} transfer`),
      buy_cash: cash > 0 ? inRange(cash, min, max, `VCB ${ccy} cash`) : null,
      sell: inRange(num(row.sell, `VCB ${ccy} sell`), min, max, `VCB ${ccy} sell`),
      unit: ccy, currency: 'VND', fetched_at: fetchedAt.toISOString(),
    });
  }
  return quotes;
}

/** Today's date in Vietnam as YYYY-MM-DD. */
export function vnDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
}

export async function fetch(http) {
  const base = process.env.VCB_URL || DEFAULT_URL;
  return parse(await http(`${base}?date=${vnDate()}`));
}
