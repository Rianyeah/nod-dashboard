# Site Map Sector Auto LOD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace unbounded Site Map sector loading with a default-off, viewport-bounded Auto LOD layer, independent selected-site full detail, and clustered site markers.

**Architecture:** Keep the existing full-detail `/map/sectors?site_id=...` path for Site Map selection and RF Tilt, while adding `/map/sectors/viewport` for zoom-derived lite, medium, and full viewport responses. Mapbox uses independent viewport and selected-sector GeoJSON sources; pure helpers own zoom thresholds, bounds serialization, and request identity so `MapboxMap.jsx` only orchestrates map events and state.

**Tech Stack:** FastAPI, SQLAlchemy async sessions, PostGIS/Neon Postgres, Python `unittest`/`pytest`, React 19, Mapbox GL JS 3, Axios, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-29-site-map-sector-auto-lod-design.md`

## Global Constraints

- `Sectoral — Auto Detail` is global and must never contain hard-coded city, Kabupaten, or NOP behavior.
- Sector layer defaults off; while off, pan/zoom/selection causes zero sector requests.
- Zoom `< 9` requests no viewport geometry; `9–<12` is lite, `12–<14` medium, and `>=14` full.
- Lite/medium grouping identity is normalized `site_id + azimuth rounded to one decimal place`.
- Viewport feature budgets are lite `2500`, medium `1500`, and full `750`; overflow returns no partial geometry.
- The dashboard full-detail endpoint requires `site_id`; the N8N integration retains its current optional-filter loader contract.
- RF Tilt selected-site responses retain the complete existing feature properties.
- MVT, global cache changes, Site Map page redesign, and shared `SiteDetailModal` changes are out of scope.
- Implementation is test-driven and ends with full tests, lint, build, audit policy, browser QA, performance measurement, and `graphify update .`.

---

### Task 1: Pure backend LOD and lite-geometry contract

**Files:**
- Modify: `backend/sector_geometry.py`
- Modify: `backend/tests/test_sector_geometry.py`

**Interfaces:**
- Produces: `sector_lod_for_zoom(zoom: float) -> Literal["none", "lite", "medium", "full"]`
- Produces: `feature_limit_for_lod(lod: str) -> int`
- Produces: `sector_row_to_viewport_feature(row, *, lod: str) -> dict | None`
- Preserves: `sector_row_to_feature(row, arc_steps=16) -> dict | None`

- [ ] **Step 1: Write failing LOD threshold and budget tests**

Add tests that assert `8.99 -> none`, `9 -> lite`, `11.99 -> lite`, `12 -> medium`, `13.99 -> medium`, `14 -> full`, and budgets `2500/1500/750`. Invalid, non-finite, or out-of-range zoom values must raise `ValueError`.

```python
def test_sector_lod_thresholds_and_limits(self):
    self.assertEqual(sector_lod_for_zoom(8.99), "none")
    self.assertEqual(sector_lod_for_zoom(9), "lite")
    self.assertEqual(sector_lod_for_zoom(12), "medium")
    self.assertEqual(sector_lod_for_zoom(14), "full")
    self.assertEqual(feature_limit_for_lod("lite"), 2500)
    self.assertEqual(feature_limit_for_lod("medium"), 1500)
    self.assertEqual(feature_limit_for_lod("full"), 750)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `python -m pytest backend/tests/test_sector_geometry.py -q`

Expected: import failure for the new functions.

- [ ] **Step 3: Write failing viewport feature-shape tests**

Use an aggregated row with `bands=["L2100", "L900", "L2100"]` and `sector_count=3`. Assert lite produces a five-coordinate closed ring, medium produces a nine-coordinate closed ring, bands are sorted and unique, full viewport retains the single `band`, and none of the heavy selected-detail fields appear in viewport properties.

```python
feature = sector_row_to_viewport_feature(row, lod="lite")
self.assertEqual(len(feature["geometry"]["coordinates"][0]), 5)
self.assertEqual(feature["properties"]["bands"], ["L900", "L2100"])
self.assertEqual(feature["properties"]["sector_count"], 3)
self.assertNotIn("antenna_type", feature["properties"])
```

- [ ] **Step 4: Implement minimal pure geometry behavior**

Add constants for thresholds, arc steps, and budgets. Reuse the existing coordinate/radius helpers. `sector_row_to_viewport_feature` uses arc steps 2/6/16, returns only display properties, normalizes aggregated bands, and marks `lod`. Preserve the existing selected-site function unchanged except for internal helper reuse.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `python -m pytest backend/tests/test_sector_geometry.py -q`

Expected: all sector geometry tests pass.

- [ ] **Step 6: Commit the pure contract**

```powershell
git add -- backend/sector_geometry.py backend/tests/test_sector_geometry.py
git commit -m "feat: add sector viewport LOD geometry"
```

---

### Task 2: Bounded backend viewport endpoint and full-detail guardrail

**Files:**
- Modify: `backend/queries/sql_queries.py`
- Modify: `backend/map_sectors.py`
- Modify: `backend/routers/map.py`
- Modify: `backend/tests/test_sector_query_contract.py`
- Modify: `backend/tests/test_n8n_map_integration.py`

**Interfaces:**
- Consumes: `sector_lod_for_zoom`, `feature_limit_for_lod`, and `sector_row_to_viewport_feature` from Task 1.
- Produces: `parse_viewport_bbox(value: str) -> tuple[float, float, float, float]`
- Produces: `load_sector_viewport_feature_collection(session, *, bbox, zoom, nop=None) -> dict`
- Produces: authenticated `GET /api/v1/map/sectors/viewport?bbox=...&zoom=...&nop=...`
- Preserves: N8N use of `load_sector_feature_collection` with optional `site_id` and `nop`.

- [ ] **Step 1: Write failing bbox and guardrail tests**

Add pure bbox tests for valid Jatim coordinates and rejection of malformed, non-finite, reversed, out-of-range, and dateline-crossing boxes. Add router tests asserting `/map/sectors` without `site_id` raises HTTP 422 while a selected-site request still runs the existing query.

```python
self.assertEqual(parse_viewport_bbox("112,-8,114,-6"), (112.0, -8.0, 114.0, -6.0))
with self.assertRaises(ValueError):
    parse_viewport_bbox("114,-8,112,-6")
with self.assertRaises(HTTPException) as raised:
    await self.get_map_sectors(site_id=None, nop=None, session=fake_session)
self.assertEqual(raised.exception.status_code, 422)
```

- [ ] **Step 2: Run focused backend tests and verify RED**

Run: `python -m pytest backend/tests/test_sector_query_contract.py backend/tests/test_n8n_map_integration.py -q`

Expected: missing parser/viewport route and missing guardrail failures.

- [ ] **Step 3: Write failing viewport SQL/loader tests**

Add tests that verify:

- SQL contains `geom && ST_MakeEnvelope(:west, :south, :east, :north, 4326)`.
- Values remain bound parameters.
- Lite/medium SQL groups by site and rounded azimuth and aggregates distinct bands.
- Full SQL returns source rows.
- Every query uses `LIMIT :row_limit` with `feature_limit + 1`.
- Overflow returns an empty FeatureCollection with `limit_exceeded=true` and `zoom_required=true`.
- Successful responses contain accurate LOD metadata.

Use a sequenced fake session or a fake result with `limit + 1` generated rows; do not require a live database for unit behavior.

- [ ] **Step 4: Implement viewport SQL and loader**

Add separate `MAP_SECTORS_VIEWPORT_GROUPED_QUERY` and `MAP_SECTORS_VIEWPORT_FULL_QUERY`. Apply the spatial envelope before aggregation. Implement `parse_viewport_bbox`, select the query from derived LOD, bind `west/south/east/north/nop/row_limit`, reject partial results, and return GeoJSON metadata.

For zoom below 9, return empty metadata without executing SQL.

- [ ] **Step 5: Implement router contracts**

Register `/sectors/viewport` before `/{...}` routes, parse validation failures into HTTP 422, and make `/sectors` require `site_id` at runtime with an actionable error. Keep `load_sector_feature_collection` unchanged for N8N.

- [ ] **Step 6: Prove N8N and selected-site compatibility**

Extend N8N regression assertions to require the existing heavy properties such as `cell_name` and confirm optional-filter SQL remains unchanged. Run:

`python -m pytest backend/tests/test_sector_query_contract.py backend/tests/test_sector_geometry.py backend/tests/test_n8n_map_integration.py -q`

Expected: all focused backend tests pass.

- [ ] **Step 7: Commit the bounded API**

```powershell
git add -- backend/queries/sql_queries.py backend/map_sectors.py backend/routers/map.py backend/tests/test_sector_query_contract.py backend/tests/test_n8n_map_integration.py
git commit -m "feat: add bounded sector viewport API"
```

---

### Task 3: Frontend LOD request helpers and API contract

**Files:**
- Create: `frontend/src/utils/sectorViewport.js`
- Create: `frontend/src/__tests__/sectorViewport.test.js`
- Modify: `frontend/src/services/api.js`
- Modify: `frontend/src/__tests__/dashboardOptimizationContracts.test.js`
- Modify: `frontend/src/__tests__/mapResilienceContracts.test.js`

**Interfaces:**
- Produces: `sectorLodForZoom(zoom) -> "none" | "lite" | "medium" | "full"`
- Produces: `buildSectorViewportDescriptor(map, nop) -> { bbox, zoom, lod, nop, key }`
- Produces: `fetchMapSectorViewport({ bbox, zoom, nop, signal }) -> FeatureCollection`
- Preserves: `fetchMapSectors({ siteId, nop, signal })` for selected-site/RF Tilt.

- [ ] **Step 1: Write failing pure helper tests**

Assert the same zoom boundaries as backend, stable six-decimal bbox serialization, stable request keys, and rejection of missing/non-finite bounds.

```javascript
assert.equal(sectorLodForZoom(8.99), 'none');
assert.equal(sectorLodForZoom(9), 'lite');
assert.deepEqual(
  buildSectorViewportDescriptor(fakeMap, 'SIDOARJO'),
  { bbox: '112.100000,-7.900000,112.900000,-7.100000', zoom: 10.25, lod: 'lite', nop: 'SIDOARJO', key: '...' },
);
```

- [ ] **Step 2: Run helper tests and verify RED**

Run: `node --test src/__tests__/sectorViewport.test.js`

Expected: module-not-found failure.

- [ ] **Step 3: Implement pure helper module**

Export constants `SECTOR_MIN_ZOOM=9`, `SECTOR_MEDIUM_ZOOM=12`, and `SECTOR_FULL_ZOOM=14`. Read Mapbox `getBounds()` and `getZoom()`, normalize bounds, and build a deterministic request key including NOP.

- [ ] **Step 4: Write failing API contract assertions**

Replace the old broad-sector regex assertions with checks that `fetchMapSectorViewport` calls `/map/sectors/viewport` using bbox, zoom, NOP, and signal, while selected-site `fetchMapSectors` still calls `/map/sectors` with `site_id`.

- [ ] **Step 5: Implement the API service split**

Add `fetchMapSectorViewport`; remove the 60-second sector-specific timeout because bounded requests and cancellation now own lifecycle control. Keep the selected-site signature stable for RF Tilt.

- [ ] **Step 6: Run focused frontend tests and verify GREEN**

Run: `node --test src/__tests__/sectorViewport.test.js src/__tests__/dashboardOptimizationContracts.test.js src/__tests__/mapResilienceContracts.test.js`

- [ ] **Step 7: Commit helpers and API contract**

```powershell
git add -- frontend/src/utils/sectorViewport.js frontend/src/__tests__/sectorViewport.test.js frontend/src/services/api.js frontend/src/__tests__/dashboardOptimizationContracts.test.js frontend/src/__tests__/mapResilienceContracts.test.js
git commit -m "feat: add sector viewport request contract"
```

---

### Task 4: Mapbox independent viewport and selected-sector lifecycle

**Files:**
- Modify: `frontend/src/components/MapboxMap.jsx`
- Modify: `frontend/src/__tests__/dashboardOptimizationContracts.test.js`
- Modify: `frontend/src/__tests__/mapResilienceContracts.test.js`

**Interfaces:**
- Consumes: `fetchMapSectorViewport`, `fetchMapSectors`, `sectorLodForZoom`, and `buildSectorViewportDescriptor` from Task 3.
- Produces: independent `sector-viewport-source` and `sector-selected-source` Mapbox sources.
- Produces: sector status values `off`, `zoom-required`, `loading`, `ready`, `limit`, and `error`.

- [ ] **Step 1: Rewrite contract tests to describe the new lifecycle**

Delete assertions for `allSectorLoadNop`, `allLoaded`, NOP-wide loading, and `SECTOR_MIN_ZOOM=10`. Add assertions for:

- `showSectors` defaults `false`.
- viewport and selected source IDs are distinct.
- viewport calls use descriptor bbox/zoom and AbortSignal.
- selected calls require both `showSectors` and `selectedSiteId`.
- turning off aborts requests and clears both GeoJSON states.
- stale request keys are checked before applying data.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test src/__tests__/dashboardOptimizationContracts.test.js src/__tests__/mapResilienceContracts.test.js`

- [ ] **Step 3: Replace old sector state and effects**

Remove `allSectorsLoadedRef`, `allSectorLoadNop`, and the NOP-wide fetch effects. Add:

```javascript
const [showSectors, setShowSectors] = useState(false);
const [sectorViewport, setSectorViewport] = useState(EMPTY_GEOJSON);
const [selectedSectors, setSelectedSectors] = useState(EMPTY_GEOJSON);
const [sectorStatus, setSectorStatus] = useState({ kind: 'off', count: 0, lod: 'none' });
const viewportAbortRef = useRef(null);
const selectedSectorAbortRef = useRef(null);
const viewportRequestKeyRef = useRef(null);
```

Register `moveend` and `zoomend`, debounce descriptor publication, skip below zoom 9, abort before every replacement request, and apply only the current request key.

- [ ] **Step 4: Split Mapbox sources and layers**

Replace `sector-source` with `sector-viewport-source` and `sector-selected-source`. Viewport geometry uses neutral aggregate styling for lite/medium and band-aware expressions for full. Selected geometry uses emphasized fill/outline and renders above viewport sectors. Ensure basemap style reload recreates both sources from refs.

- [ ] **Step 5: Keep selected detail conditional and independent**

Fetch selected sectors only when `showSectors && selectedSiteId`. Deselecting clears selected data; layer-off aborts and clears it. Do not filter all viewport layers down to the selected site.

- [ ] **Step 6: Run focused tests and lint the component**

Run:

```powershell
node --test src/__tests__/sectorViewport.test.js src/__tests__/dashboardOptimizationContracts.test.js src/__tests__/mapResilienceContracts.test.js
npx eslint src/components/MapboxMap.jsx src/utils/sectorViewport.js src/services/api.js
```

- [ ] **Step 7: Commit lifecycle refactor**

```powershell
git add -- frontend/src/components/MapboxMap.jsx frontend/src/__tests__/dashboardOptimizationContracts.test.js frontend/src/__tests__/mapResilienceContracts.test.js
git commit -m "feat: render sector polygons with auto LOD"
```

---

### Task 5: Marker clustering and sector layer status UI

**Files:**
- Modify: `frontend/src/components/MapboxMap.jsx`
- Modify: `frontend/src/__tests__/dashboardOptimizationContracts.test.js`
- Modify: `frontend/src/__tests__/mapDomSecurity.test.js` only if status rendering introduces new DOM helpers.

**Interfaces:**
- Consumes: `sectorStatus` from Task 4.
- Produces: clustered `sites-source`, cluster layers, expansion click handler, accessible sector status copy, and conditional legend.

- [ ] **Step 1: Write failing clustering and UI contract tests**

Assert:

- `sites-source` sets `cluster: true`, a reviewed cluster radius, and max zoom.
- cluster circle/count layers exist.
- existing site layers filter out features with `point_count`.
- cluster click calls `getClusterExpansionZoom` then `easeTo`.
- the toggle says `Sectors Off` initially.
- status copy covers zoom-required, loading, ready LOD/count, limit, and error.
- band legend requires active full/band-specific geometry.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test src/__tests__/dashboardOptimizationContracts.test.js src/__tests__/mapDomSecurity.test.js`

- [ ] **Step 3: Implement marker clustering**

Set `cluster: true`, `clusterRadius: 42`, and `clusterMaxZoom: 11`. Add restrained cluster halo, fill, and count layers. Add `['!', ['has', 'point_count']]` filters to ordinary site layers. Register and clean up cluster click and pointer-cursor handlers.

- [ ] **Step 4: Implement layer status UI and conditional legend**

Keep the dedicated toggle. Add a compact nearby status pill whose copy derives only from `sectorStatus`. Use existing DOM-safe React rendering. Show the band legend only when `showSectors`, status is ready, and the active viewport or selected detail contains band-specific full geometry.

- [ ] **Step 5: Run focused tests, full frontend tests, and lint**

Run:

```powershell
node --test src/__tests__/*.test.js
npm run lint
```

Expected: all frontend tests and lint pass.

- [ ] **Step 6: Commit the interaction surface**

```powershell
git add -- frontend/src/components/MapboxMap.jsx frontend/src/__tests__/dashboardOptimizationContracts.test.js frontend/src/__tests__/mapDomSecurity.test.js
git commit -m "feat: add map clustering and sector status"
```

---

### Task 6: Full verification, performance proof, and graph refresh

**Files:**
- Modify only if verification finds an in-scope defect.
- Generated untracked browser/performance artifacts stay outside commits.

**Interfaces:**
- Consumes: all implementation tasks.
- Produces: verified branch state and measurable acceptance evidence.

- [ ] **Step 1: Run complete automated verification**

Run:

```powershell
python -m pytest backend/tests -q
Set-Location frontend
node --test src/__tests__/*.test.js
npm run lint
npm run build
npm run audit:production
```

Expected: backend and frontend suites pass, lint/build pass, and the reviewed production-audit policy passes.

- [ ] **Step 2: Run authenticated local API and browser QA**

Start backend/frontend using exact local origin settings. In Playwright, verify desktop and narrow widths, layer default off, cluster expansion, sector activation, below-minimum zoom, lite/medium/full transitions, selected-site overlay, NOP changes, basemap switch, and no console errors.

- [ ] **Step 3: Measure bounded requests**

Capture request count, server duration, raw payload bytes, GeoJSON feature count, and metadata for representative city and dense urban viewports. Compare lite payload to an equivalent selected/full dataset and verify the 80% reduction target. Confirm no request lacks bbox/zoom and no response is silently truncated.

- [ ] **Step 4: Refresh Graphify after code changes**

Run: `graphify update .`

Verify `graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md` are current and report node/edge/community totals. Do not commit unrelated Graphify artifacts if the repository policy keeps them untracked.

- [ ] **Step 5: Review diff and commit any verification fixes**

Run:

```powershell
git status --short
git diff --check
git diff --stat origin/main...HEAD
```

If verification required fixes, stage only in-scope files and commit with a focused message. Otherwise leave the already-reviewed task commits unchanged.

- [ ] **Step 6: Prepare review handoff**

Report branch, commits, exact test counts, browser scenarios, payload/latency measurements, Graphify result, and any remaining measured follow-up such as MVT. Do not merge or push unless the user asks.
