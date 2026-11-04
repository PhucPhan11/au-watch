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
| `DATA_DIR` | `./data` | Where `cache.json`, `history.db` and `scheduler.lock` live |
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

### Health check
`GET /health` always returns HTTP 200 while the process is running, even when a price source is down.
- `status` is `ok` when the scheduler is running and every price row is fresh, otherwise `degraded`.
- `scheduler` is `running`, or `standby` if another process holds the lock.
- `sources` gives each source's `last_ok_at`, `last_error`, `last_error_at` and `last_duration_ms`. Fallback sources appear only after they have been called.
- `slots` gives the freshness of each price row.
- `history` gives `last_write_at` and the total `rows`.

### Logs
One JSON object per line, written to stdout. Errors go to stderr.
- `event: "fetch"`: one line per source request, with `source`, `ok`, `duration_ms` and, on failure, `error`.
- `slot`: whether each price row is fresh or stale.
- `history`: rows inserted and rows unchanged.
- Also `start`, `shutdown` and `scheduler`.

### One scheduler only
At startup the process takes an exclusive lock on `DATA_DIR/scheduler.lock`. The operating system releases the lock if the process dies.
- A second process using the same data directory serves pages but runs no scheduler and writes no history. It logs `scheduler: standby`.
- `history.db` itself isn't used for locking.

## GitHub Pages

A static version of the page is published to GitHub Pages at **https://phucphan11.github.io/au-watch/**.

- **How it works.** GitHub Pages can't run Node, the scheduler or SQLite. Instead, the visitor's browser fetches current prices straight from PNJ, gold-api.com, Vietcombank and ExchangeRate-API when the page opens, and again every 5 minutes. It reuses the app's own fetchers, conversion and page rendering ([pages/](pages/)).
- **No history.** The charts only exist in the local app (`npm start`).
- **No Swissquote backup.** Swissquote doesn't allow browser requests (no CORS header). If gold-api.com is down, the world row shows "Chưa có dữ liệu".
- **No stale values.** The browser doesn't remember anything between visits, so a failed source shows "Chưa có dữ liệu" rather than its last known value.
- **Load on the sources.** Every visitor's browser calls the sources directly. That's fine for personal or light use.

### Publishing
[.github/workflows/pages.yml](.github/workflows/pages.yml) builds and deploys the site on every push to `main` (and can be run by hand from the Actions tab). It copies `pages/` and the browser-safe modules from `src/` into `_site/`.

One-time setup: on GitHub, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.

### Preview locally
```bash
mkdir -p _site/src && cp pages/* _site/ && cp -r src/convert.js src/render.js src/scheduler.js src/fetchers _site/src/
python -m http.server 8080 --directory _site     # then open http://localhost:8080
```
`_site/` is git-ignored.

## Known limitations
- **DOJI is not included.** There is no public feed. giavang.doji.vn redirects to a login-gated internal app, and the old XML endpoint returns 404.
- **sjc.com.vn is not used.** The SJC bar price shown is PNJ's price for SJC bars, which can differ from SJC's own quote. sjc.com.vn's robots.txt blocks AI agents, so no SJC fetcher was built and verified in Phase 1.
- **PNJ is a single point of failure for both Vietnamese rows.** If PNJ is down, both rows show their last known values marked "Dữ liệu cũ".
- gold-api.com and Swissquote are free, unofficial feeds with no SLA and no published terms found. open.er-api.com updates once a day.
- PNJ prices are for the Hồ Chí Minh zone (`zone=00`). PNJ's API returns values in units of 10,000 đ, which the app multiplies to get đ/lượng.
- The gap ignores VAT, import costs, fabrication and transport. It is for reference only.
- History starts when the app first runs. There is no backfill, so the longer ranges stay empty until enough data has been recorded.
- Old history is never deleted. At one row per price change, it grows by a few MB per year.
- There are no alerts or user accounts, and no custom domain, CDN or analytics.
