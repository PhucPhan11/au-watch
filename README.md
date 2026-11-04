# au-watch

au-watch is a small web page that shows Vietnamese gold buy/sell prices next to the world spot price converted to VND per lượng. Each Vietnamese row also shows the **gap** (chênh lệch) between the two.

It is a data layer and one server-rendered page. Phase 2 added price history (SQLite) and charts. The only npm dependency is the chart library [uPlot](https://github.com/leeoniya/uPlot) (1.6.32).

## Requirements
- Node.js **22.13 or newer** (tested on 26.5). It provides built-in `fetch`, `node:sqlite`, `node:test` and `--env-file-if-exists`.

## Setup
```bash
npm install            # installs uPlot (served to the browser by the app)
cp .env.example .env   # optional; every setting has a default
```
No API keys are needed. If keys are ever added, they belong in `.env`, which git ignores, and never in code.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `REFRESH_MINUTES` | `10` | Minutes between refreshes. Values below 5 are raised to 5. |
| `USER_AGENT` | `au-watch/0.1` | User-Agent sent to sources |
| `PNJ_URL`, `GOLDAPI_URL`, `SWISSQUOTE_URL`, `VCB_URL`, `ERAPI_URL` | real endpoints | Override a source URL, for example to simulate an outage |

## Run
```bash
npm start
```
Then open http://localhost:3000. The first refresh runs at startup and then repeats on the schedule. The page reloads itself every 5 minutes.

## Test
```bash
npm test
```
Tests use responses saved in `test/fixtures/` and never touch the network.

## Sources

| Data | Primary | Fallback |
|---|---|---|
| SJC bars (Vàng miếng SJC 999.9, PNJ's selling price) | `edge-api.pnj.io/ecom-frontend/v1/get-gold-price?zone=00` | — |
| PNJ plain ring 999.9 | same PNJ request | — |
| World XAU/USD | `api.gold-api.com/price/XAU` | Swissquote public bid/ask feed (mid price) |
| USD/VND | Vietcombank `api/exchangerates`, **sell** rate | open.er-api.com daily mid rate, shown as "tham khảo" |

Each source is requested at most once per refresh (both Vietnamese rows share one PNJ request), with a 10 s timeout and no retry loop. The page shows "(dự phòng)" whenever a fallback source supplied a value.

## How the gap is calculated
```
world_vnd_luong = XAU_USD_per_oz × (37.5 / 31.1034768) × USD_VND
gap             = VN_sell − world_vnd_luong
gap_%           = gap / world_vnd_luong × 100
```
1 lượng = 37.5 g ≈ 1.205653 troy oz.

## When a source fails
If a source and its fallback both fail, that row keeps its last known value. It gets a **"Dữ liệu cũ"** badge, a highlighted background, and the time of the last successful update. The other rows are not affected. Last values are saved to `data/cache.json`, which git ignores, so they also survive a restart.

## Price history
Every scheduled refresh records into `data/history.db`, a SQLite database through Node's built-in `node:sqlite`. History survives restarts.

```sql
snapshots(id, series, source, product, ts, seen_until, buy, sell, unit, currency)
-- series: vn_sjc | vn_pnj_ring | world_xau | fx_usdvnd; ts/seen_until in epoch ms
```

- **Write policy.** A new row is written only when a series' buy or sell price changes. If the values are unchanged, the latest row's `seen_until` moves forward instead. Stale or failed fetches are never written.
- **Gaps in the chart.** Because of `seen_until`, the charts can tell "price unchanged" (the line continues) apart from "app wasn't running" (the line breaks).
- **Derived values.** The world price in VND/lượng and the gap are not stored. The history API computes them for each time bucket with the same formula as the current-price table.

### History API
`GET /api/history?range=24h|7d|30d|1y` (default `24h`; any other value returns HTTP 400)

| Range | Bucket | Points |
|---|---|---|
| 24h | 10 min | 144 |
| 7d | 1 hour | 168 |
| 30d | 1 day | 30 |
| 1y | 1 day | 365 |

Each bucket holds the latest value seen in it. A bucket with no data is `null`. The response uses column arrays:
`t` (bucket end, epoch ms), `sjc_buy`, `sjc_sell`, `ring_sell`, `world_vnd_luong`, `gap_sjc_abs`, `gap_sjc_pct`, `gap_ring_abs`, `gap_ring_pct`.
It also includes `range`, `bucket_ms`, `from`, `to`, `first_recorded` and `enough`, which is `true` when at least 2 buckets have a gap value.

### Charts
Below the price table are two charts, each with a range selector (24 giờ / 7 ngày / 30 ngày / 1 năm):
- **Price chart:** sell prices, with a band showing the SJC buy/sell spread, plus the converted world price.
- **Gap chart:** the gap over time, with a toggle between đồng and %.

If there isn't enough history for the selected range, the page says so instead of drawing a chart.

### Reset the history
Stop the app, then delete the database files:
```bash
rm data/history.db data/history.db-wal data/history.db-shm
```
The app creates an empty database on the next start. `data/cache.json`, which holds the latest values for the price table, is a separate file.

## Known limitations
- **DOJI is not included.** There is no public feed. giavang.doji.vn redirects to a login-gated internal app, and the old XML endpoint returns 404.
- **sjc.com.vn is not used.** The SJC bar price shown is PNJ's price for SJC bars, which can differ from SJC's own quote. sjc.com.vn's robots.txt blocks AI agents, so no SJC fetcher was built and verified in Phase 1.
- **PNJ is a single point of failure for both Vietnamese rows.** If PNJ is down, both rows show their last known values marked "Dữ liệu cũ".
- gold-api.com and Swissquote are free, unofficial feeds with no SLA and no published terms found. open.er-api.com updates once a day.
- PNJ prices are for the Hồ Chí Minh zone (`zone=00`). PNJ's API returns values in units of 10,000 đ, which the app multiplies to get đ/lượng.
- The gap ignores VAT, import costs, fabrication and transport. It is for reference only.
- History starts when the app first runs. There is no backfill, so the longer ranges stay empty until enough data has been recorded.
- Old history is never deleted. At one row per price change, it grows by a few MB per year.
- There are no alerts, user accounts or deployment config.
