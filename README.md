# au-watch

au-watch is a small web page that shows Vietnamese gold buy/sell prices next to the world spot price converted to VND per lượng. Each Vietnamese row also shows the **gap** (chênh lệch) between the two.

Phase 1 contains a data layer and one server-rendered page. It has no runtime dependencies.

## Requirements
- Node.js **22.9 or newer** (tested on 26.5). It provides built-in `fetch`, `node:test` and `--env-file-if-exists`.

## Setup
```bash
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

## Known limitations
- **DOJI is not included.** There is no public feed. giavang.doji.vn redirects to a login-gated internal app, and the old XML endpoint returns 404.
- **sjc.com.vn is not used.** The SJC bar price shown is PNJ's price for SJC bars, which can differ from SJC's own quote. sjc.com.vn's robots.txt blocks AI agents, so no SJC fetcher was built and verified in Phase 1.
- **PNJ is a single point of failure for both Vietnamese rows.** If PNJ is down, both rows show their last known values marked "Dữ liệu cũ".
- gold-api.com and Swissquote are free, unofficial feeds with no SLA and no published terms found. open.er-api.com updates once a day.
- PNJ prices are for the Hồ Chí Minh zone (`zone=00`). PNJ's API returns values in units of 10,000 đ, which the app multiplies to get đ/lượng.
- The gap ignores VAT, import costs, fabrication and transport. It is for reference only.
- There is no history, charts, alerts or deployment config. These are out of scope for Phase 1.
