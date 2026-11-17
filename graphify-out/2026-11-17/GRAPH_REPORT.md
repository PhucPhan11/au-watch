# Graph Report - au-watch  (2026-11-17)

## Corpus Check
- 46 files · ~29,481 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .xml 2, .example 1, (none) 1)

## Summary
- 285 nodes · 540 edges · 14 communities (11 shown, 3 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b98159a7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Core Price Fetchers
- Can Tho Store Fetchers
- Architecture Concepts (Docs)
- Conversion, Cache & History
- Pages Deploy Workflow
- Server Bootstrap & Infra
- Routes & Page Rendering
- Fetcher Contract & Store Fixtures
- Package Manifest
- Browser Charts
- GitHub Pages Entry
- MCP Config
- PNJ Source & Limitations
- Environment Config

## God Nodes (most connected - your core abstractions)
1. `renderPage()` - 16 edges
2. `inRange()` - 14 edges
3. `num()` - 11 edges
4. `main()` - 9 edges
5. `gap()` - 9 edges
6. `vndPerChiToLuong()` - 9 edges
7. `usdOzToVndLuong()` - 8 edges
8. `isPure()` - 8 edges
9. `logEvent()` - 8 edges
10. `parse()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `openHistory()`  [EXTRACTED]
  scripts/backfill.js → src/history.js
- `getHealth()` --calls--> `createHandler()`  [EXTRACTED]
  test/health.test.js → src/app.js
- `refreshWith()` --calls--> `refreshOnce()`  [EXTRACTED]
  test/health.test.js → src/scheduler.js
- `pages.js module script` --references--> `refreshOnce`  [INFERRED]
  pages/index.html → CLAUDE.md
- `pages.js module script` --references--> `renderPage (src/render.js)`  [INFERRED]
  pages/index.html → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Can Tho store scraping and parser fixtures** — readme_can_tho_stores, readme_ngoctham_store, readme_minhvu_store, readme_huythanh_store, test_fixtures_minhvu, test_fixtures_huythanh, claude_store_slots [INFERRED 0.85]
- **Core price sources feeding CORE_SLOTS** — readme_pnj_source, readme_goldapi_source, readme_swissquote_source, readme_vietcombank_source, readme_erapi_source, claude_core_slots [INFERRED 0.85]
- **Price history recording and charting flow** — claude_history_snapshots, claude_bucketize, claude_convert_gap_formula, readme_history_api, readme_charts [INFERRED 0.85]

## Communities (14 total, 3 thin omitted)

### Community 0 - "Core Price Fetchers"
Cohesion: 0.08
Nodes (33): fetch(), id, parse(), source, fetch(), id, parse(), source (+25 more)

### Community 1 - "Can Tho Store Fetchers"
Cohesion: 0.12
Nodes (25): fetch(), id, jsonAt(), LABELS, nextPayload(), parse(), source, fetch() (+17 more)

### Community 2 - "Architecture Concepts (Docs)"
Cohesion: 0.08
Nodes (25): CORE_SLOTS (vn_sjc, vn_pnj_ring, world_xau, fx_usdvnd), History snapshots table (src/history.js, node:sqlite), logEvent (JSON-per-line logging), Normalized quote {source, code, product, buy, sell, unit, currency, fetched_at}, refreshOnce, renderPage (src/render.js), Server wiring (src/server.js, src/app.js routes), STORE_SLOTS (Can Tho stores, display-only) (+17 more)

### Community 3 - "Conversion, Cache & History"
Cohesion: 0.10
Nodes (30): gap(), GRAMS_PER_LUONG, GRAMS_PER_TROY_OZ, mid(), OZ_PER_LUONG, usdOzToVndLuong(), bucketize(), clip() (+22 more)

### Community 4 - "Pages Deploy Workflow"
Cohesion: 0.08
Nodes (25): concurrency, cancel-in-progress, group, environment, runs-on, steps, name, url (+17 more)

### Community 5 - "Server Bootstrap & Infra"
Cohesion: 0.12
Nodes (18): ASSETS, createHandler(), createStatus(), healthReport(), createCache(), makeHttp(), acquireSchedulerLock(), cache (+10 more)

### Community 6 - "Routes & Page Rendering"
Cohesion: 0.12
Nodes (27): DATA_DIR, fxRatio(), http, main(), NOW, pnjTier(), pool(), ROOT (+19 more)

### Community 7 - "Fetcher Contract & Store Fixtures"
Cohesion: 0.18
Nodes (12): au-watch (CLAUDE.md overview), bucketize, src/convert.js gap formula (single source), au-watch README, Price chart and Gap chart, open.er-api.com (USD/VND fallback), Gap calculation (world_vnd_luong, gap, gap_%), gold-api.com XAU/USD (primary world price) (+4 more)

### Community 8 - "Package Manifest"
Cohesion: 0.14
Nodes (14): dependencies, uplot@1.6.32, description, engines, node, name, private, scripts (+6 more)

### Community 9 - "Browser Charts"
Cohesion: 0.44
Nodes (7): baseOpts(), destroy(), draw(), gapChart(), load(), priceChart(), syncButtons()

### Community 10 - "GitHub Pages Entry"
Cohesion: 0.47
Nodes (3): http(), main(), memoryCache()

## Knowledge Gaps
- **11 isolated node(s):** `PNJ gold price API (SJC bars + plain ring)`, `Environment config (PORT, REFRESH_MINUTES, DATA_DIR, *_URL overrides)`, `logEvent (JSON-per-line logging)`, `data/cache.json (last known values)`, `open.er-api.com (USD/VND fallback)` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 99 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `renderPage()` connect `Conversion, Cache & History` to `Core Price Fetchers`, `Server Bootstrap & Infra`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `PNJ gold price API (SJC bars + plain ring)`, `Environment config (PORT, REFRESH_MINUTES, DATA_DIR, *_URL overrides)`, `logEvent (JSON-per-line logging)` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Price Fetchers` be split into smaller, more focused modules?**
  _Cohesion score 0.08194905869324474 - nodes in this community are weakly interconnected._
- **Why does `History snapshots table (src/history.js, node:sqlite)` connect `Architecture Concepts (Docs)` to `Fetcher Contract & Store Fixtures`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Should `Can Tho Store Fetchers` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Why does `inRange()` connect `Core Price Fetchers` to `Can Tho Store Fetchers`, `Routes & Page Rendering`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Should `Architecture Concepts (Docs)` be split into smaller, more focused modules?**
  _Cohesion score 0.08387096774193549 - nodes in this community are weakly interconnected._