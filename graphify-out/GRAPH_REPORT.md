# Graph Report - au-watch  (2026-11-04)

## Corpus Check
- Corpus is ~25,336 words - fits in a single context window. You may not need a graph.

## Summary
- 249 nodes · 453 edges · 14 communities (11 shown, 3 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.89)
- Token cost: 68,486 input · 0 output

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
2. `inRange()` - 12 edges
3. `num()` - 11 edges
4. `gap()` - 9 edges
5. `vndPerChiToLuong()` - 9 edges
6. `usdOzToVndLuong()` - 8 edges
7. `isPure()` - 8 edges
8. `parse()` - 7 edges
9. `renderStores()` - 7 edges
10. `steps` - 6 edges

## Surprising Connections (you probably didn't know these)
- `STORE_SLOTS (Can Tho stores, display-only)` --semantically_similar_to--> `Gia vang tai Can Tho (store price tables)`  [INFERRED] [semantically similar]
  CLAUDE.md → README.md
- `getHealth()` --calls--> `createHandler()`  [EXTRACTED]
  test/health.test.js → src/app.js
- `refreshWith()` --calls--> `refreshOnce()`  [EXTRACTED]
  test/health.test.js → src/scheduler.js
- `Minh Vu gold types (Trang suc 9999, 9999, Nhan tron 983, Trang suc 980, Trang suc 610)` --conceptually_related_to--> `util.js range guards (num, inRange, VND_LUONG_MIN/MAX)`  [INFERRED]
  test/fixtures/minhvu.html → CLAUDE.md
- `pages.js module script` --references--> `refreshOnce`  [INFERRED]
  pages/index.html → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Core price sources feeding CORE_SLOTS** — readme_pnj_source, readme_goldapi_source, readme_swissquote_source, readme_vietcombank_source, readme_erapi_source, claude_core_slots [INFERRED 0.85]
- **Can Tho store scraping and parser fixtures** — readme_can_tho_stores, readme_ngoctham_store, readme_minhvu_store, readme_huythanh_store, test_fixtures_minhvu, test_fixtures_huythanh, claude_store_slots [INFERRED 0.85]
- **Price history recording and charting flow** — claude_history_snapshots, claude_bucketize, claude_convert_gap_formula, readme_history_api, readme_charts [INFERRED 0.85]

## Communities (14 total, 3 thin omitted)

### Community 0 - "Core Price Fetchers"
Cohesion: 0.09
Nodes (33): fetch(), id, parse(), source, fetch(), id, parse(), source (+25 more)

### Community 1 - "Can Tho Store Fetchers"
Cohesion: 0.12
Nodes (25): fetch(), id, jsonAt(), LABELS, nextPayload(), parse(), source, fetch() (+17 more)

### Community 2 - "Architecture Concepts (Docs)"
Cohesion: 0.08
Nodes (24): au-watch (CLAUDE.md overview), bucketize, src/convert.js gap formula (single source), CORE_SLOTS (vn_sjc, vn_pnj_ring, world_xau, fx_usdvnd), History snapshots table (src/history.js, node:sqlite), logEvent (JSON-per-line logging), refreshOnce, renderPage (src/render.js) (+16 more)

### Community 3 - "Conversion, Cache & History"
Cohesion: 0.14
Nodes (15): gap(), GRAMS_PER_LUONG, GRAMS_PER_TROY_OZ, mid(), OZ_PER_LUONG, usdOzToVndLuong(), bucketize(), openHistory() (+7 more)

### Community 4 - "Pages Deploy Workflow"
Cohesion: 0.08
Nodes (25): concurrency, cancel-in-progress, group, environment, runs-on, steps, name, url (+17 more)

### Community 5 - "Server Bootstrap & Infra"
Cohesion: 0.14
Nodes (17): createStatus(), createCache(), makeHttp(), acquireSchedulerLock(), logEvent(), cache, DATA_DIR, history (+9 more)

### Community 6 - "Routes & Page Rendering"
Cohesion: 0.20
Nodes (16): ASSETS, createHandler(), healthReport(), esc(), gapHtml(), pct(), renderPage(), renderStores() (+8 more)

### Community 7 - "Fetcher Contract & Store Fixtures"
Cohesion: 0.18
Nodes (13): Normalized quote {source, code, product, buy, sell, unit, currency, fetched_at}, vndPerChiToLuong (chi x10 to luong), Gia vang tai Can Tho (store price tables), Huy Thanh store (embedded Next.js data), Minh Vu store (homepage HTML table), Ngoc Tham store (proxy_banggia.php JSON), Huy Thanh 'Gia vang hom nay' page fixture, Huy Thanh gold types (24K, 24KTT, 22K, 18K, 14K, 10K; Dong/chi) (+5 more)

### Community 8 - "Package Manifest"
Cohesion: 0.15
Nodes (13): dependencies, uplot@1.6.32, description, engines, node, name, private, scripts (+5 more)

### Community 9 - "Browser Charts"
Cohesion: 0.44
Nodes (7): baseOpts(), destroy(), draw(), gapChart(), load(), priceChart(), syncButtons()

### Community 10 - "GitHub Pages Entry"
Cohesion: 0.47
Nodes (3): http(), main(), memoryCache()

## Knowledge Gaps
- **11 isolated node(s):** `au-watch (CLAUDE.md overview)`, `Normalized quote {source, code, product, buy, sell, unit, currency, fetched_at}`, `logEvent (JSON-per-line logging)`, `Environment config (PORT, REFRESH_MINUTES, DATA_DIR, *_URL overrides)`, `PNJ gold price API (SJC bars + plain ring)` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 86 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `renderPage()` connect `Routes & Page Rendering` to `Core Price Fetchers`, `Conversion, Cache & History`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `au-watch (CLAUDE.md overview)`, `Normalized quote {source, code, product, buy, sell, unit, currency, fetched_at}`, `logEvent (JSON-per-line logging)` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Price Fetchers` be split into smaller, more focused modules?**
  _Cohesion score 0.08773784355179703 - nodes in this community are weakly interconnected._
- **Should `Can Tho Store Fetchers` be split into smaller, more focused modules?**
  _Cohesion score 0.11612903225806452 - nodes in this community are weakly interconnected._
- **Should `Architecture Concepts (Docs)` be split into smaller, more focused modules?**
  _Cohesion score 0.082010582010582 - nodes in this community are weakly interconnected._
- **Should `Conversion, Cache & History` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `Pages Deploy Workflow` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._