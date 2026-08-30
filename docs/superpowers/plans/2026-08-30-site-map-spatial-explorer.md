# Site Map Spatial Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Site Map into a map-first Spatial Explorer whose markers, counts, sector polygons, results, inspector, and shareable URL use one canonical filter state.

**Architecture:** Shared backend query helpers generate safe master-site filters, search predicates, and whitelisted sorting for both marker and result endpoints. The frontend page owns canonical URL-backed explorer state, while focused feature components render the toolbar, context strip, inspector, and results drawer; `MapboxMap` becomes a selection/camera/layer surface without an HTML popup.

**Tech Stack:** FastAPI, SQLAlchemy text queries, Pydantic, PostgreSQL/PostGIS, React 19, React Router 7, Mapbox GL JS, Tailwind CSS, existing Radix/shadcn primitives, Node test runner, pytest.

**Spec:** `docs/superpowers/specs/2026-08-30-site-map-spatial-explorer-design.md`

## Global Constraints

- Preserve PR #38 Auto LOD thresholds, bounded spatial predicate, abort behavior, and feature limits.
- Do not introduce MVT unless the completed GeoJSON path fails the measured `1 MB`, `1 second`, or interaction guardrails.
- Keep `SiteDetailModal` and `frontend/src/services/siteDetailBundle.js` as the shared full-detail contract.
- Use existing NOD design tokens, Lucide icons, and dashboard/shadcn primitives; add no dependency.
- Search debounce is exactly 300 ms.
- Supported URL keys are `bulan`, `tahun`, `nop`, `kabupaten`, `cluster`, `kelas`, `q`, and `site`; unknown keys are preserved.
- Server sorting is whitelisted and uses `site_id asc` as the deterministic tie-breaker with nulls last.
- Run `graphify update .` after material code changes.

---

### Task 1: Shared backend site filtering, counts, and server sorting

**Files:**
- Create: `backend/site_query.py`
- Create: `backend/tests/test_site_explorer_query.py`
- Modify: `backend/queries/sql_queries.py`
- Modify: `backend/models/site.py`
- Modify: `backend/routers/sites.py`
- Modify: `backend/routers/map.py`
- Modify: `backend/routers/availability.py`

**Interfaces:**
- Produces: `build_site_filters(*, kabupaten=None, cluster=None, status=None, kelas=None, nop=None, alias="m") -> tuple[str, dict]`.
- Produces: `build_site_search_filter(q=None, *, alias="m") -> tuple[str, dict]`.
- Produces: `build_site_order(sort_by="site_id", sort_dir="asc", *, alias="m", metrics_alias="agg") -> str`.
- Produces: `SiteMapResponse(data, total, with_coordinates)`.
- Changes `GET /map/sites` from a bare array to `SiteMapResponse` and accepts all explorer filters.
- Changes `GET /sites` to accept `sort_by` and `sort_dir`.

- [ ] **Step 1: Write failing pure query-helper and response tests**

```python
def test_site_filters_and_search_use_requested_alias_and_bound_params():
    filters, params = build_site_filters(
        kabupaten="KOTA PASURUAN", cluster="PASURUAN", kelas="PLATINUM", nop="PASURUAN", alias="master"
    )
    search, search_params = build_site_search_filter("PSR", alias="master")
    assert 'master."Kabupaten/KOTA" = :kabupaten' in filters
    assert 'master."New Cluster" = :cluster' in filters
    assert params == {
        "kabupaten": "KOTA PASURUAN", "cluster": "PASURUAN", "kelas": "PLATINUM", "nop": "PASURUAN"
    }
    assert 'master."Siteid" ILIKE :q' in search
    assert search_params == {"q": "%PSR%"}


def test_site_order_is_whitelisted_and_deterministic():
    assert build_site_order("avg_availability", "desc") == (
        'agg.avg_availability DESC NULLS LAST, m."Siteid" ASC'
    )
    assert build_site_order("not-a-column", "sideways") == 'm."Siteid" ASC NULLS LAST'
```

- [ ] **Step 2: Run tests and confirm RED because `backend/site_query.py` and `SiteMapResponse` do not exist**

Run: `py -3.14 -m pytest backend/tests/test_site_explorer_query.py -q`

Expected: collection/import failure naming `site_query` or missing model fields.

- [ ] **Step 3: Implement shared helpers and safe sort expressions**

```python
SITE_SORT_EXPRESSIONS = {
    "site_id": 'm."Siteid"',
    "site_name": 'm."Site Name"',
    "kabupaten": 'm."Kabupaten/KOTA"',
    "site_class": 'm."Site Class"',
    "jumlah_cell": "agg.jumlah_cell",
    "avg_availability": "agg.avg_availability",
    "total_outage_menit": "agg.total_outage_menit",
    "rca_dominan": "agg.rca_dominan",
    "status_site": 'm."Status Site"',
}


def build_site_order(sort_by="site_id", sort_dir="asc", *, alias="m", metrics_alias="agg"):
    expression = SITE_SORT_EXPRESSIONS.get(sort_by, SITE_SORT_EXPRESSIONS["site_id"])
    expression = expression.replace("m.", f"{alias}.").replace("agg.", f"{metrics_alias}.")
    direction = "DESC" if str(sort_dir).lower() == "desc" else "ASC"
    if sort_by not in SITE_SORT_EXPRESSIONS:
        direction = "ASC"
    return f'{expression} {direction} NULLS LAST, {alias}."Siteid" ASC'
```

- [ ] **Step 4: Add `MAP_SITES_COUNT_QUERY`, parameterized `{search_filter}`, and `{order_by}`**

```sql
SELECT
    COUNT(DISTINCT m."Siteid")::integer AS total,
    COUNT(DISTINCT m."Siteid") FILTER (
      WHERE NULLIF(NULLIF(m."Latitude", '#N/A'), '') IS NOT NULL
        AND NULLIF(NULLIF(m."Longitude", '#N/A'), '') IS NOT NULL
    )::integer AS with_coordinates
FROM data_site_master m
JOIN site_month_metrics agg
  ON agg.site_id = m."Siteid" AND agg.tahun = :tahun AND agg.bulan = :bulan
WHERE 1=1
{filters}
{search_filter}
```

- [ ] **Step 5: Wire `/map/sites`, `/sites`, and availability to shared helpers**

`/map/sites` must execute the marker and count queries with identical parameters and return:

```python
return SiteMapResponse(
    data=sites,
    total=int(count_row["total"] or 0),
    with_coordinates=int(count_row["with_coordinates"] or 0),
)
```

`/sites` must inject only the string returned by `build_site_order` into `{order_by}`.

- [ ] **Step 6: Run focused backend tests GREEN, then full backend suite**

Run: `py -3.14 -m pytest backend/tests/test_site_explorer_query.py backend/tests/test_map_query_contract.py backend/tests/test_site_performance.py -q`

Run: `py -3.14 -m pytest backend/tests -q`

Expected: all pass; existing availability imports no longer depend on private router helpers.

- [ ] **Step 7: Commit**

```powershell
git add backend/site_query.py backend/tests/test_site_explorer_query.py backend/queries/sql_queries.py backend/models/site.py backend/routers/sites.py backend/routers/map.py backend/routers/availability.py
git commit -m "feat: unify site explorer query contracts"
```

---

### Task 2: Apply canonical explorer filters to sector viewport GeoJSON

**Files:**
- Modify: `backend/queries/sql_queries.py`
- Modify: `backend/map_sectors.py`
- Modify: `backend/routers/map.py`
- Modify: `backend/tests/test_sector_viewport.py`

**Interfaces:**
- Extends `load_sector_viewport_feature_collection(..., nop=None, kabupaten=None, cluster=None, kelas=None, q=None)`.
- Extends `/map/sectors/viewport` with the same optional explorer filters.
- Does not change `load_sector_feature_collection(site_id=...)` or `/map/sectors` exact-site behavior.

- [ ] **Step 1: Write failing sector filter tests**

```python
async def test_viewport_filters_bind_master_dimensions_and_search(self):
    session = RecordingSession(rows=[])
    await load_sector_viewport_feature_collection(
        session,
        bbox=(112.8, -7.8, 113.1, -7.5),
        zoom=12,
        nop="PASURUAN",
        kabupaten="KOTA PASURUAN",
        cluster="PASURUAN",
        kelas="GOLD",
        q="PSR",
    )
    sql, params = session.calls[0]
    assert 'JOIN data_site_master m ON m."Siteid" = r.site_id' in sql
    assert params["kabupaten"] == "KOTA PASURUAN"
    assert params["q"] == "%PSR%"
```

- [ ] **Step 2: Run RED**

Run: `py -3.14 -m pytest backend/tests/test_sector_viewport.py -q`

Expected: unexpected keyword argument or missing joined filter predicate.

- [ ] **Step 3: Alias sector queries and join master data**

Both viewport queries use `ransys_gabungan r`, qualify spatial columns as `r.*`, and join `data_site_master m` only for filters. Preserve:

```sql
r.geom && ST_MakeEnvelope(:west, :south, :east, :north, 4326)
```

- [ ] **Step 4: Reuse shared site filter/search helpers in the loader and router**

Combine the returned SQL fragments and parameter dictionaries; never build string predicates from user values.

- [ ] **Step 5: Run focused and full backend tests GREEN**

Run: `py -3.14 -m pytest backend/tests/test_sector_viewport.py backend/tests/test_map_query_contract.py backend/tests/test_n8n_map_integration.py -q`

Run: `py -3.14 -m pytest backend/tests -q`

- [ ] **Step 6: Commit**

```powershell
git add backend/queries/sql_queries.py backend/map_sectors.py backend/routers/map.py backend/tests/test_sector_viewport.py
git commit -m "feat: filter sector viewport with explorer state"
```

---

### Task 3: URL-backed explorer state and frontend request contracts

**Files:**
- Create: `frontend/src/features/site-map/siteMapState.js`
- Create: `frontend/src/__tests__/siteMapState.test.js`
- Modify: `frontend/src/services/api.js`
- Modify: `frontend/src/hooks/useMapData.js`
- Modify: `frontend/src/utils/sectorViewport.js`
- Modify: `frontend/src/__tests__/sectorViewport.test.js`

**Interfaces:**
- Produces: `parseSiteMapSearchParams(params) -> canonical partial state`.
- Produces: `writeSiteMapSearchParams(params, state) -> URLSearchParams`.
- Produces: `normalizeSiteMapFilters(state) -> API filter object`.
- Changes `useMapData(bulan, tahun, filters)` to return marker metadata.
- Changes `buildSectorViewportDescriptor(map, filters)` so every active filter participates in params and request identity.

- [ ] **Step 1: Write failing state tests with hand-derived URLs**

```js
it('normalizes supported URL state while preserving unknown keys on write', () => {
  const parsed = parseSiteMapSearchParams(new URLSearchParams(
    'bulan=8&tahun=2026&nop=PASURUAN&q=%20PSR%20&site=psr001&tab=ops'
  ));
  assert.deepEqual(parsed, {
    bulan: 8, tahun: 2026, nop: 'PASURUAN', q: 'PSR', site: 'PSR001',
  });
  const written = writeSiteMapSearchParams(new URLSearchParams('tab=ops'), parsed);
  assert.equal(written.toString(), 'tab=ops&bulan=8&tahun=2026&nop=PASURUAN&q=PSR&site=PSR001');
});

it('ignores invalid periods and removes empty explorer values', () => {
  const parsed = parseSiteMapSearchParams(new URLSearchParams('bulan=18&tahun=2019&q=%20'));
  assert.deepEqual(parsed, {});
});
```

- [ ] **Step 2: Run RED**

Run: `node --test src/__tests__/siteMapState.test.js`

Expected: module-not-found for `siteMapState.js`.

- [ ] **Step 3: Implement pure normalization and URL serialization**

Use a fixed supported-key list; normalize month to `1..12`, year to `>=2020`, trim strings, uppercase only `site`, and preserve keys not owned by Site Map.

- [ ] **Step 4: Write failing request/descriptor tests**

Extend `sectorViewport.test.js` with a descriptor whose literal params include `nop`, `kabupaten`, `cluster`, `kelas`, and `q`, and whose key changes when any one value changes.

- [ ] **Step 5: Implement API and hook signatures**

```js
export async function fetchMapSites({ bulan, tahun, filters = {}, signal } = {})
export async function fetchMapSectorViewport({ bbox, zoom, filters = {}, signal })
export async function fetchSites({ bulan, tahun, q, sortBy, sortDir, ...filters } = {})
```

Map snake-case query params explicitly: `sort_by: sortBy`, `sort_dir: sortDir`.

- [ ] **Step 6: Run focused tests GREEN and frontend suite**

Run: `node --test src/__tests__/siteMapState.test.js src/__tests__/sectorViewport.test.js src/__tests__/dashboardOptimizationContracts.test.js`

Run: `node --test src/__tests__/*.test.js`

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/features/site-map/siteMapState.js frontend/src/__tests__/siteMapState.test.js frontend/src/services/api.js frontend/src/hooks/useMapData.js frontend/src/utils/sectorViewport.js frontend/src/__tests__/sectorViewport.test.js frontend/src/__tests__/dashboardOptimizationContracts.test.js
git commit -m "feat: add canonical site map explorer state"
```

---

### Task 4: Spatial helpers, inspector, toolbar, context strip, and results drawer

**Files:**
- Create: `frontend/src/features/site-map/siteMapSpatial.js`
- Create: `frontend/src/features/site-map/SiteMapToolbar.jsx`
- Create: `frontend/src/features/site-map/SiteMapContextStrip.jsx`
- Create: `frontend/src/features/site-map/SiteMapInspector.jsx`
- Create: `frontend/src/features/site-map/SiteMapResultsDrawer.jsx`
- Create: `frontend/src/__tests__/siteMapSpatial.test.js`
- Create: `frontend/src/__tests__/siteMapExplorerContracts.test.js`
- Modify: `frontend/src/components/SiteTable.jsx`
- Modify: `frontend/src/components/FilterPanel.jsx`

**Interfaces:**
- Produces: `nearbySites(selected, sites, radiusKm=1, limit=8)` with deterministic distance ordering.
- Toolbar controls page-owned `search` and filter values.
- Inspector receives `site`, `nearby`, `outsideFilters`, and action callbacks/links.
- Results drawer owns page/sort state, sends controlled filters/search to `SiteTable`, and reports selected rows.

- [ ] **Step 1: Write failing nearby-site behavior tests**

```js
it('returns only valid neighbors within one kilometre ordered by distance then Site ID', () => {
  const selected = { site_id: 'A', latitude: -7.65, longitude: 112.90 };
  const sites = [
    selected,
    { site_id: 'C', latitude: -7.651, longitude: 112.901 },
    { site_id: 'B', latitude: -7.6505, longitude: 112.9005 },
    { site_id: 'FAR', latitude: -7.70, longitude: 113.00 },
  ];
  assert.deepEqual(nearbySites(selected, sites).map((item) => item.site_id), ['B', 'C']);
});
```

- [ ] **Step 2: Run RED, implement haversine helper, run GREEN**

Run: `node --test src/__tests__/siteMapSpatial.test.js`

- [ ] **Step 3: Add a failing explorer wiring contract**

The test must catch these user-visible breaks: `SummaryCards` returning, toolbar search becoming table-only, results sorting staying client-side, inspector actions disappearing, or mobile sheet semantics being removed.

- [ ] **Step 4: Implement focused feature components with existing primitives**

Desktop inspector is an `aside`; mobile inspector uses `Sheet` with `side="bottom"`. Context metrics are plain grouped text, not KPI cards. Results drawer has a 42 px collapsed handle and a bounded open height.

- [ ] **Step 5: Convert `SiteTable` to controlled query plus server sorting**

`SiteTable` receives `q`, removes its local search and `sorted` copy, passes `sortBy`/`sortDir` to `fetchSites`, exposes inline request error/retry, and sets `aria-sort` on headers.

- [ ] **Step 6: Run focused tests and full frontend suite**

Run: `node --test src/__tests__/siteMapSpatial.test.js src/__tests__/siteMapExplorerContracts.test.js src/__tests__/dashboardOptimizationContracts.test.js`

Run: `node --test src/__tests__/*.test.js`

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/features/site-map frontend/src/__tests__/siteMapSpatial.test.js frontend/src/__tests__/siteMapExplorerContracts.test.js frontend/src/components/SiteTable.jsx frontend/src/components/FilterPanel.jsx
git commit -m "feat: build site map explorer surfaces"
```

---

### Task 5: Compose the page and replace Mapbox popup behavior

**Files:**
- Modify: `frontend/src/pages/SiteMapPage.jsx`
- Modify: `frontend/src/components/MapboxMap.jsx`
- Modify: `frontend/src/__tests__/dashboardOptimizationContracts.test.js`
- Modify: `frontend/src/__tests__/mapDomSecurity.test.js`
- Modify: `frontend/src/__tests__/mapResilienceContracts.test.js`
- Modify: `frontend/src/__tests__/siteMapExplorerContracts.test.js`

**Interfaces:**
- `MapboxMap` receives `filters`, `onSiteSelect(site)`, and `onSectorStatusChange(status)`.
- `MapboxMap` retains selected focus/radius/sector behavior but owns no popup DOM.
- `SiteMapPage` owns URL sync, selected fallback, drawer/sheet coordination, and modal loading.

- [ ] **Step 1: Update tests first to require map-first composition and no popup path**

The RED assertions must require: `useSearchParams`, the four new explorer surfaces, one canonical `mapFilters` object passed to both map and results, and absence of `createSitePopupContent`, `mapboxgl.Popup`, popup dragging, and neighbor marker cards.

- [ ] **Step 2: Run RED**

Run: `node --test src/__tests__/siteMapExplorerContracts.test.js src/__tests__/dashboardOptimizationContracts.test.js src/__tests__/mapDomSecurity.test.js src/__tests__/mapResilienceContracts.test.js`

- [ ] **Step 3: Refactor `MapboxMap` to pure selection/camera/layers**

Add all inspector fields to marker GeoJSON properties. Marker click passes the normalized property object to `onSiteSelect`; programmatic focus calls `flyTo` and updates the radius without creating HTML. Remove popup-specific refs, constants, helpers, daily availability calls, and `safeMapDom` imports.

- [ ] **Step 4: Compose canonical page state and URL lifecycle**

Initialize from `parseSiteMapSearchParams`, resolve latest period only for absent period fields, debounce search 300 ms, and update URL with `replace: true`. Load exact fallback detail for unresolved `site` IDs with abort ownership.

- [ ] **Step 5: Compose responsive layout and selection flow**

Use a desktop grid with `minmax(0,1fr) minmax(300px,340px)`, render the context strip above it, and place the results drawer below. Close mobile results before opening the inspector. Keep `SiteDetailModal` unchanged.

- [ ] **Step 6: Run focused and full frontend tests GREEN**

Run: `node --test src/__tests__/siteMapExplorerContracts.test.js src/__tests__/dashboardOptimizationContracts.test.js src/__tests__/mapDomSecurity.test.js src/__tests__/mapResilienceContracts.test.js`

Run: `node --test src/__tests__/*.test.js`

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/pages/SiteMapPage.jsx frontend/src/components/MapboxMap.jsx frontend/src/__tests__/dashboardOptimizationContracts.test.js frontend/src/__tests__/mapDomSecurity.test.js frontend/src/__tests__/mapResilienceContracts.test.js frontend/src/__tests__/siteMapExplorerContracts.test.js
git commit -m "feat: compose map-first spatial explorer"
```

---

### Task 6: Complete Data Potensi and RF Tilt deep-link handoff

**Files:**
- Create: `frontend/src/features/site-map/siteDeepLinks.js`
- Create: `frontend/src/__tests__/siteDeepLinks.test.js`
- Modify: `frontend/src/pages/DataPotensiPage.jsx`
- Modify: `frontend/src/pages/RfTiltAnalysisPage.jsx`
- Modify: `frontend/src/features/rf-tilt/RfTiltParamForm.jsx`
- Modify: `frontend/src/__tests__/dataPotensiContracts.test.js`
- Modify: `frontend/src/__tests__/rfTiltContracts.test.js`

**Interfaces:**
- Produces: `normalizedDeepLinkSite(value) -> uppercase Site ID or null`.
- Data Potensi consumes `?site=` once per distinct valid value and calls its existing exact-site detail handler.
- RF Tilt passes `initialSiteQuery` to the parameter form, opens search, and requires explicit cell selection.

- [ ] **Step 1: Write failing normalization and route behavior tests**

```js
it('normalizes a safe exact Site ID and rejects path-like values', () => {
  assert.equal(normalizedDeepLinkSite(' psr001 '), 'PSR001');
  assert.equal(normalizedDeepLinkSite('../PSR001'), null);
  assert.equal(normalizedDeepLinkSite('PSR 001'), null);
});
```

Route contracts must fail until Data Potensi consumes `site` and RF Tilt primes without invoking `selectSite` automatically.

- [ ] **Step 2: Run RED**

Run: `node --test src/__tests__/siteDeepLinks.test.js src/__tests__/dataPotensiContracts.test.js src/__tests__/rfTiltContracts.test.js`

- [ ] **Step 3: Implement safe handoff behavior**

Accept only `/^[A-Z0-9_-]{2,32}$/`. Data Potensi protects against duplicate effect execution with a last-opened ref. RF Tilt sets the initial form query and opens its popover, but user selection remains the only call to `selectSite`.

- [ ] **Step 4: Run focused and full frontend tests GREEN**

Run: `node --test src/__tests__/siteDeepLinks.test.js src/__tests__/dataPotensiContracts.test.js src/__tests__/rfTiltContracts.test.js`

Run: `node --test src/__tests__/*.test.js`

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/features/site-map/siteDeepLinks.js frontend/src/__tests__/siteDeepLinks.test.js frontend/src/pages/DataPotensiPage.jsx frontend/src/pages/RfTiltAnalysisPage.jsx frontend/src/features/rf-tilt/RfTiltParamForm.jsx frontend/src/__tests__/dataPotensiContracts.test.js frontend/src/__tests__/rfTiltContracts.test.js
git commit -m "feat: hand off selected sites to detail tools"
```

---

### Task 7: Verification, runtime proof, and Graphify refresh

**Files:**
- Modify if needed: tests or implementation files that expose verified regressions.
- Do not commit browser screenshots, Playwright profiles, test results, or Graphify temporary files unless already tracked.

**Interfaces:**
- Produces final evidence for correctness, responsive behavior, and the MVT decision guardrails.

- [ ] **Step 1: Run static and complete automated verification**

Run:

```powershell
py -3.14 -m pytest backend/tests -q
Set-Location frontend
node --test src/__tests__/*.test.js
npm run lint
npm run build
npm run audit:production
```

- [ ] **Step 2: Start local backend/frontend with process-only development configuration**

Use the established exact `PUBLIC_APP_ORIGIN`, synthetic local session, and existing environment-provided database/Mapbox configuration. Do not write credentials or tokens to the worktree.

- [ ] **Step 3: Browser QA desktop and mobile**

Verify direct and interactive flows:

- `/site-map?site=BGL001`;
- combined NOP/Kabupaten/Cluster/Kelas/search filters;
- marker clustering and expansion;
- selected inspector and nearby selection;
- collapsed/open results, server sorting, pagination;
- sector off/lite/medium/full transitions;
- Data Potensi exact-site opening;
- RF Tilt primed search without arbitrary cell selection;
- browser back/forward and direct reload;
- no horizontal overflow and zero console errors.

- [ ] **Step 4: Measure GeoJSON guardrails**

For a normal filtered viewport record response status, duration, transfer/payload size, LOD, and feature count. MVT remains deferred only if payload `<1 MB`, response `<1 second`, and browser pan/zoom shows no sector-related stall.

- [ ] **Step 5: Refresh Graphify and inspect the final diff**

Run: `graphify update .`

Run: `git diff --check`

Run: `git status --short`

Run: `git diff --stat origin/main...HEAD`

- [ ] **Step 6: Apply verification-driven fixes with new RED tests, then rerun affected and complete suites**

Do not patch a discovered regression without first reproducing it in the narrowest automated test available.

- [ ] **Step 7: Final scoped commit if verification required changes**

```powershell
git add backend/site_query.py backend/map_sectors.py backend/models/site.py backend/queries/sql_queries.py backend/routers/availability.py backend/routers/map.py backend/routers/sites.py backend/tests/test_site_explorer_query.py backend/tests/test_sector_viewport.py frontend/src/features/site-map frontend/src/components/FilterPanel.jsx frontend/src/components/MapboxMap.jsx frontend/src/components/SiteTable.jsx frontend/src/hooks/useMapData.js frontend/src/pages/DataPotensiPage.jsx frontend/src/pages/RfTiltAnalysisPage.jsx frontend/src/pages/SiteMapPage.jsx frontend/src/features/rf-tilt/RfTiltParamForm.jsx frontend/src/services/api.js frontend/src/utils/sectorViewport.js frontend/src/__tests__
git commit -m "fix: harden site map explorer interactions"
```

Do not create this commit when verification required no changes.
