# Graph Report - au-watch  (2026-11-17)

## Corpus Check
- 50 files · ~35,540 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: .xml 2, .example 1, (none) 1)

## Summary
- 328 nodes · 653 edges · 16 communities (11 shown, 5 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `72dd51db`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Core Price Fetchers
- Can Tho Store Fetchers
- Architecture Concepts (Docs)
- { id, source, parse, fetch }
- Pages Deploy Workflow
- Server Bootstrap & Infra
- Routes & Page Rendering
- render.js
- Package Manifest
- Browser Charts
- GitHub Pages Entry
- MCP Config
- PNJ Source & Limitations
- Environment Config
- Gia vang tai Can Tho (store price tables)
- { id, source, parse, fetch }

## God Nodes (most connected - your core abstractions)
1. `inRange()` - 18 edges
2. `renderPage()` - 18 edges
3. `num()` - 15 edges
4. `renderSilver()` - 12 edges
5. `main()` - 10 edges
6. `usdOzToVndLuong()` - 9 edges
7. `gap()` - 9 edges
8. `vndPerChiToLuong()` - 9 edges
9. `isPure()` - 8 edges
10. `logEvent()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `openHistory()`  [EXTRACTED]
  scripts/backfill.js → src/history.js
- `getHealth()` --calls--> `createHandler()`  [EXTRACTED]
  test/health.test.js → src/app.js
- `STORE_SLOTS (Can Tho stores, display-only)` --semantically_similar_to--> `Gia vang tai Can Tho (store price tables)`  [INFERRED] [semantically similar]
  CLAUDE.md → README.md
- `Huy Thanh store (embedded Next.js data)` --shares_data_with--> `Next.js self.__next_f prices payload (giamua, giaban, loaivang, tuoi, ngaythaydoigia)`  [INFERRED]
  README.md → test/fixtures/huythanh.html
- `Huy Thanh 'Gia vang hom nay' page fixture` --references--> `Huy Thanh store (embedded Next.js data)`  [INFERRED]
  test/fixtures/huythanh.html → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Can Tho store scraping and parser fixtures** — readme_can_tho_stores, readme_ngoctham_store, readme_minhvu_store, readme_huythanh_store, test_fixtures_minhvu, test_fixtures_huythanh, claude_store_slots [INFERRED 0.85]
- **Core price sources feeding CORE_SLOTS** — readme_pnj_source, readme_goldapi_source, readme_swissquote_source, readme_vietcombank_source, readme_erapi_source, claude_core_slots [INFERRED 0.85]
- **Price history recording and charting flow** — claude_history_snapshots, claude_bucketize, claude_convert_gap_formula, readme_history_api, readme_charts [INFERRED 0.85]

## Communities (16 total, 5 thin omitted)

### Community 0 - "Core Price Fetchers"
Cohesion: 0.07
Nodes (39): fetchDay(), META, parseDay(), price(), TYPES, vnTs(), fetch(), id (+31 more)

### Community 1 - "Can Tho Store Fetchers"
Cohesion: 0.10
Nodes (35): fetch(), id, jsonAt(), LABELS, nextPayload(), parse(), source, fetch() (+27 more)

### Community 2 - "Architecture Concepts (Docs)"
Cohesion: 0.13
Nodes (15): au-watch (CLAUDE.md overview), bucketize, src/convert.js gap formula (single source), History snapshots table (src/history.js, node:sqlite), Server wiring (src/server.js, src/app.js routes), au-watch README, Price chart and Gap chart, open.er-api.com (USD/VND fallback) (+7 more)

### Community 4 - "Pages Deploy Workflow"
Cohesion: 0.08
Nodes (25): concurrency, cancel-in-progress, group, environment, runs-on, steps, name, url (+17 more)

### Community 5 - "Server Bootstrap & Infra"
Cohesion: 0.08
Nodes (31): ASSETS, createHandler(), createStatus(), healthReport(), createCache(), clip(), openHistory(), importRows() (+23 more)

### Community 6 - "Routes & Page Rendering"
Cohesion: 0.12
Nodes (26): DATA_DIR, FX, fxTier(), http, main(), METALS, NOW, pnjTier() (+18 more)

### Community 7 - "render.js"
Cohesion: 0.17
Nodes (26): gap(), GRAMS_PER_LUONG, GRAMS_PER_TROY_OZ, mid(), OZ_PER_LUONG, usdOzToVndLuong(), bucketize(), esc() (+18 more)

### Community 8 - "Package Manifest"
Cohesion: 0.14
Nodes (14): dependencies, uplot@1.6.32, description, engines, node, name, private, scripts (+6 more)

### Community 9 - "Browser Charts"
Cohesion: 0.22
Nodes (20): agGapChart(), agMessage(), agPriceChart(), baseOpts(), destroy(), destroyAg(), destroyFx(), draw() (+12 more)

### Community 10 - "GitHub Pages Entry"
Cohesion: 0.47
Nodes (3): http(), main(), memoryCache()

### Community 14 - "Gia vang tai Can Tho (store price tables)"
Cohesion: 0.10
Nodes (22): CORE_SLOTS (vn_sjc, vn_pnj_ring, world_xau, fx_usdvnd), logEvent (JSON-per-line logging), Normalized quote {source, code, product, buy, sell, unit, currency, fetched_at}, refreshOnce, renderPage (src/render.js), STORE_SLOTS (Can Tho stores, display-only), vndPerChiToLuong (chi x10 to luong), pages/index.html (GitHub Pages shell) (+14 more)

## Knowledge Gaps
- **13 isolated node(s):** `{ id, source, parse, fetch }`, `{ id, source, parse, fetch }`, `PNJ gold price API (SJC bars + plain ring)`, `Environment config (PORT, REFRESH_MINUTES, DATA_DIR, *_URL overrides)`, `Normalized quote {source, code, product, buy, sell, unit, currency, fetched_at}` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 113 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `inRange()` connect `Core Price Fetchers` to `Can Tho Store Fetchers`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `{ id, source, parse, fetch }`, `{ id, source, parse, fetch }`, `PNJ gold price API (SJC bars + plain ring)` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Price Fetchers` be split into smaller, more focused modules?**
  _Cohesion score 0.06775510204081632 - nodes in this community are weakly interconnected._
- **Why does `renderPage()` connect `render.js` to `Server Bootstrap & Infra`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Should `Can Tho Store Fetchers` be split into smaller, more focused modules?**
  _Cohesion score 0.09634551495016612 - nodes in this community are weakly interconnected._
- **Why does `History snapshots table (src/history.js, node:sqlite)` connect `Architecture Concepts (Docs)` to `Gia vang tai Can Tho (store price tables)`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Should `Architecture Concepts (Docs)` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._