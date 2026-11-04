# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

au-watch shows Vietnamese gold buy/sell prices next to the world spot price converted to VND per lượng, plus the gap (chênh lệch). It runs as a local Node server (with SQLite price history and uPlot charts) and also as a static GitHub Pages build that fetches prices from the visitor's browser. User-facing text is Vietnamese. README.md is the detailed spec (sources, history API, health, logs, limitations) — keep it in sync when behavior changes.

## Commands

- `npm install` — only dependency is `uplot` (served to the browser from `node_modules`)
- `npm start` — `node --env-file-if-exists=.env src/server.js`, serves http://localhost:3000
- `npm test` — `node --test` (built-in runner, no framework). Tests never hit the network; parsers run against saved responses in `test/fixtures/`.
- Single test file: `node --test test/fetchers.test.js`; single test by name: `node --test --test-name-pattern="PNJ" test/fetchers.test.js`
- No build step, linter, or TypeScript. Plain ES modules (`"type": "module"`), Node ≥ 22.13 (needs built-in `fetch`, `node:sqlite`, `node:test`).
- Config via env (`.env.example`): `PORT`, `REFRESH_MINUTES` (floored at 5 — Vietcombank rate limit), `DATA_DIR` (default `./data`), and per-source URL overrides (`PNJ_URL`, `GOLDAPI_URL`, …) for simulating outages.

## Architecture

**Fetchers (`src/fetchers/*.js`)** share one contract: export `id`, `source`, a pure `parse(raw, fetchedAt)` that returns an array of normalized quotes `{ source, code?, product, buy, sell, unit, currency, fetched_at }`, and `fetch(http)` that calls `http(process.env.X_URL || DEFAULT_URL)` then `parse`. Parsers must throw on unexpected payloads and use `util.js` range guards (`num`, `inRange`, `VND_LUONG_MIN/MAX`) to catch silent unit changes. Vietnamese prices are normalized to đ/lượng (PNJ returns units of 10,000 đ; Cần Thơ stores quote per chỉ → ×10 via `vndPerChiToLuong`). HTML sources request `{ as: 'text' }` from `http`.

**Slots and the refresh cycle (`src/scheduler.js`)** — a *slot* is one displayed row/table with an ordered list of sources (primary → fallback) and a `pick` function selecting quotes from a fetcher's result. `refreshOnce` dedupes so each fetcher is called at most once per cycle (e.g. `vn_sjc` and `vn_pnj_ring` share one PNJ call). If all sources for a slot fail, the slot keeps its previous quotes and is marked `stale: true` (rendered as "Dữ liệu cũ"). `CORE_SLOTS` (`vn_sjc`, `vn_pnj_ring`, `world_xau`, `fx_usdvnd`) drive the gap, health status and history; `STORE_SLOTS` (Cần Thơ stores) are display-only and never written to history. Adding a source means: new fetcher module, register in `FETCHERS`, add/extend a slot, add a fixture + test.

**Server wiring (`src/server.js`)** — loads `cache` (`cache.json`, last known slot values, survives restarts), opens `history` (`history.db`), then takes an OS file lock on `DATA_DIR/scheduler.lock`. Only the lock holder runs the scheduler and writes history; other processes serve pages in `standby`. `src/app.js` holds routes (`/`, `/health`, `/api/history`, and a fixed whitelist of `/assets/*` — nothing else is served from disk) and the in-memory status for `/health`.

**History (`src/history.js`)** — `snapshots` table via `node:sqlite`. A row is inserted only when a series' buy/sell changes; otherwise the latest row's `seen_until` is extended. This lets charts distinguish "price unchanged" from "app not running". World VND/lượng and gap are *not* stored; `bucketize` computes them per time bucket using `src/convert.js` (the single source of the gap formula).

**Rendering** — `src/render.js` `renderPage(slots, { withHistory, withStores })` produces the full HTML server-side; `src/public/charts.js` is the browser-side chart code.

**GitHub Pages (`pages/`, `.github/workflows/pages.yml`)** — the workflow copies `pages/*` plus `src/convert.js`, `src/render.js`, `src/scheduler.js` and `src/fetchers/` into `_site/`. Those modules therefore must stay browser-safe: no `node:` imports, and `process.env` access only (pages.js shims `globalThis.process`). `pages/pages.js` runs `refreshOnce` with `CORE_SLOTS` only, an in-memory cache, and a header-less `fetch` (to avoid CORS preflight), then renders with history and stores disabled. Swissquote and the Cần Thơ stores have no CORS headers, so they only work in the local app.

## Logging

`logEvent(level, event, fields)` in `scheduler.js` writes one JSON object per line (stdout; errors to stderr). Use it rather than `console.log` for new events.
