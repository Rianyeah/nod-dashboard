# Site Detail Performance and Data Potensi Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair period-aware site-detail metrics, replace modal Daily Availability with Revenue and Payload MoM scorecards, expose the approved master-data fields, and add two filter-aware matrix charts to Data Potensi.

**Architecture:** Keep site master/availability detail and site commercial performance as separate backend contracts, then compose them through one frontend bundle loader shared by every modal caller. Extend the existing cached Data Potensi dashboard payload with two normalized matrix datasets and render both through a small accessible matrix-chart feature.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic, Neon PostgreSQL, React 19, Vite, Tailwind CSS, Recharts-compatible dashboard primitives, Node test runner, pytest/unittest, Playwright CLI, Graphify.

## Global Constraints

- Omitted availability periods resolve from the latest `site_month_metrics` period; explicit Site Map periods remain authoritative.
- Revenue and Payload use the latest `traktor_data.trx_month` for the selected site and compare only the immediately preceding calendar month.
- Daily Availability remains available to the Mapbox popup but is removed from the shared detail modal.
- Revenue/Payload failures and trend failures are optional failures; master detail remains visible.
- Technology contains Band NE, NR aliases, NE Type, and Software Version.
- Monitoring contains Dual EAS and BBLTI Software.
- The two new Data Potensi charts use the existing dashboard request and all current filters.
- Normalize blank, `#N/A...`, and `#REF!...` categories to `Tidak ada`.
- Do not modify Neon schema or source rows.
- Preserve all unrelated and untracked workspace files.

---

### Task 1: Resolve omitted site-detail periods from database data

**Files:**
- Create: `backend/tests/test_site_detail_period.py`
- Modify: `backend/routers/sites.py:17-167`

**Interfaces:**
- Consumes: `LATEST_PERIOD_QUERY` and an `AsyncSession`.
- Produces: `resolve_site_detail_period(bulan, tahun, session) -> tuple[int, int]`; `/sites/{site_id}/detail` always includes lowercase `bulan` and `tahun`.

- [ ] **Step 1: Write failing period-resolution tests**

```python
@pytest.mark.asyncio
async def test_resolver_keeps_explicit_period():
    session = FakeSession(latest={"bulan": 6, "tahun": 2026})
    assert await resolve_site_detail_period(5, 2026, session) == (5, 2026)
    assert session.execute_calls == 0


@pytest.mark.asyncio
async def test_resolver_uses_latest_complete_period_when_any_part_is_missing():
    session = FakeSession(latest={"bulan": 6, "tahun": 2026})
    assert await resolve_site_detail_period(None, None, session) == (6, 2026)
    assert await resolve_site_detail_period(5, None, session) == (6, 2026)
```

Add a response-shape contract assertion that the route assigns:

```python
data["bulan"] = bulan
data["tahun"] = tahun
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `python -m pytest backend/tests/test_site_detail_period.py -q`

Expected: FAIL because `resolve_site_detail_period` does not exist and the route still uses `datetime.now()`.

- [ ] **Step 3: Implement the minimal resolver and route integration**

```python
async def resolve_site_detail_period(bulan, tahun, session):
    if bulan is not None and tahun is not None:
        return bulan, tahun
    result = await session.execute(text(LATEST_PERIOD_QUERY))
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="No availability period found")
    return int(row["bulan"]), int(row["tahun"])
```

Replace the wall-clock fallback in `get_site_detail`, call the resolver, and add the resolved fields to the response.

- [ ] **Step 4: Run focused and existing map-query tests**

Run: `python -m pytest backend/tests/test_site_detail_period.py backend/tests/test_map_query_contract.py -q`

Expected: PASS.

- [ ] **Step 5: Commit the period fix**

```powershell
git add backend/tests/test_site_detail_period.py backend/routers/sites.py
git commit -m "fix: resolve site detail availability period"
```

---

### Task 2: Add site Revenue and Payload performance contract

**Files:**
- Create: `backend/tests/test_site_performance.py`
- Modify: `backend/models/reporting.py:71-77`
- Modify: `backend/routers/reporting.py:31-371,374-end`

**Interfaces:**
- Consumes: `traktor_data.site_id`, `trx_month`, `rev`, and `payload`.
- Produces: `SitePerformance` and `GET /reporting/site/{site_id}/performance`.

- [ ] **Step 1: Write failing model, MoM, SQL, and route tests**

```python
def test_relative_change_uses_absolute_previous_value():
    assert relative_change(120, 100) == 20.0
    assert relative_change(80, 100) == -20.0


def test_relative_change_returns_none_for_missing_or_zero_previous():
    assert relative_change(120, None) is None
    assert relative_change(120, 0) is None


def test_site_performance_model_accepts_missing_source_data():
    payload = SitePerformance(site_id="PSN999")
    assert payload.trx_month is None
    assert payload.revenue_mom_pct is None
```

Assert the SQL derives the exact preceding calendar month with date arithmetic and filters by `site_id`; assert the route path and response model exist.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `python -m pytest backend/tests/test_site_performance.py -q`

Expected: FAIL because the model, helper, query, and endpoint are missing.

- [ ] **Step 3: Implement the model and query**

```python
class SitePerformance(BaseModel):
    site_id: str
    trx_month: str | None = None
    previous_trx_month: str | None = None
    total_revenue: int | None = None
    previous_revenue: int | None = None
    revenue_mom_pct: float | None = None
    total_payload: int | None = None
    previous_payload: int | None = None
    payload_mom_pct: float | None = None
```

The query must select the latest site row and left-join the month produced by:

```sql
TO_CHAR(TO_DATE(current.trx_month || '-01', 'YYYY-MM-DD') - INTERVAL '1 month', 'YYYY-MM')
```

Implement `relative_change(current, previous)` with null/zero guards and return a null-valued payload when no current row exists.

- [ ] **Step 4: Run focused reporting tests**

Run: `python -m pytest backend/tests/test_site_performance.py backend/tests/test_reporting_performance_metrics.py backend/tests/test_reporting_nop_contract.py -q`

Expected: PASS.

- [ ] **Step 5: Commit the performance endpoint**

```powershell
git add backend/tests/test_site_performance.py backend/models/reporting.py backend/routers/reporting.py
git commit -m "feat: expose site revenue and payload performance"
```

---

### Task 3: Extend Data Potensi dashboard matrices

**Files:**
- Modify: `backend/tests/test_data_potensi_contract.py`
- Modify: `backend/models/data_potensi.py:23-91`
- Modify: `backend/routers/data_potensi.py:32-541`

**Interfaces:**
- Consumes: the existing Data Potensi query context and filter parameters.
- Produces: `readiness_by_kabupaten` and `transport_configuration_matrix` arrays in `DataPotensiResponse`.

- [ ] **Step 1: Write failing behavior and contract tests**

Add real helper tests using mapping dictionaries:

```python
def test_readiness_rows_calculate_percentages():
    rows = [{
        "kabupaten": "SIDOARJO", "total_sites": 10,
        "enva_ready": 9, "dual_eas_ready": 2, "bblti_software_ready": 3,
    }]
    item = rows_to_readiness(rows)[0]
    assert item.enva_ready_pct == 90.0
    assert item.dual_eas_ready_pct == 20.0


def test_transport_rows_preserve_normalized_dimensions_and_share():
    rows = [{
        "transport_type": "FO_TELKOM", "modem_transport": "ONT",
        "jumper_modem": "UTP", "site_count": 8, "filtered_total": 10,
    }]
    item = rows_to_transport_matrix(rows)[0]
    assert item.percentage == 80.0
```

Extend source contracts to require both SQL queries to include
`{nop_filter}`, `{status_filter}`, and `{advanced_filter}`, the response fields,
readiness rules, `#REF!` normalization, and cache resource `dashboard-v2`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `python -m pytest backend/tests/test_data_potensi_contract.py -q`

Expected: FAIL on missing models, helpers, queries, response arrays, and cache version.

- [ ] **Step 3: Implement models, SQL, helpers, and payload assembly**

Add `ReadinessByKabupatenItem` and `TransportConfigurationItem`. Build readiness SQL with exact trimmed status predicates and transport SQL with normalized expressions. Include a filtered-total CTE for percentages. Add:

```python
readiness_by_kabupaten=rows_to_readiness(readiness_rows),
transport_configuration_matrix=rows_to_transport_matrix(transport_rows),
```

Change only the dashboard cache resource segment to `dashboard-v2`.

- [ ] **Step 4: Run Data Potensi backend tests**

Run: `python -m pytest backend/tests/test_data_potensi_contract.py -q`

Expected: PASS.

- [ ] **Step 5: Commit the dashboard payload extension**

```powershell
git add backend/tests/test_data_potensi_contract.py backend/models/data_potensi.py backend/routers/data_potensi.py
git commit -m "feat: add data potensi matrix datasets"
```

---

### Task 4: Compose one resilient site-detail bundle and update modal consumers

**Files:**
- Create: `frontend/src/services/siteDetailBundle.js`
- Create: `frontend/src/__tests__/siteDetailBundle.test.js`
- Modify: `frontend/src/services/api.js:128-143,178-225`
- Modify: `frontend/src/pages/DataPotensiPage.jsx:47-55,381-519,828-837`
- Modify: `frontend/src/pages/SiteMapPage.jsx:1-181,350-363`
- Modify: `frontend/src/pages/DashboardPage.jsx:1-180,337-350`

**Interfaces:**
- Consumes: `fetchSiteDetail`, `fetchTrend`, and new `fetchSitePerformance`.
- Produces: `fetchSiteDetailBundle(siteId, { bulan, tahun, signal }) -> { detail, trendData, performanceData, trendError, performanceError }`.

- [ ] **Step 1: Write failing bundle behavior tests**

Use injected request functions so tests exercise orchestration without network access:

```javascript
const result = await fetchSiteDetailBundle('PSN003', {}, {
  fetchDetail: async () => ({ site_id: 'PSN003', bulan: 6, tahun: 2026 }),
  fetchTrendData: async (_id, tahun, bulan) => [{ tahun, bulan }],
  fetchPerformance: async () => ({ total_revenue: 10 }),
});
assert.deepEqual(result.trendData, [{ tahun: 2026, bulan: 6 }]);
assert.equal(result.performanceData.total_revenue, 10);
```

Add a test where trend and performance reject and assert detail is retained with empty optional data and error flags.

- [ ] **Step 2: Run the focused frontend test and verify RED**

Run from `frontend/`: `node --test src/__tests__/siteDetailBundle.test.js`

Expected: FAIL because the bundle module and API function do not exist.

- [ ] **Step 3: Implement API and bundle orchestration**

Add:

```javascript
export async function fetchSitePerformance(siteId, signal) {
  const { data } = await api.get(`/reporting/site/${siteId}/performance`, { signal });
  return data;
}
```

Fetch detail first, resolve `bulan/tahun` from its response, then use
`Promise.allSettled` for trend and performance. Re-throw detail failure and
abort errors; convert only optional non-abort failures into error flags.

- [ ] **Step 4: Replace per-page modal state and requests**

Each caller stores `siteDetail`, `siteDetailTrend`, and
`siteDetailPerformance`. Data Potensi passes no period; Site Map and Dashboard
pass their explicit period. Remove modal-only `siteDetailDaily` state and
`fetchSiteAvailability` calls. Do not alter `MapboxMap.jsx`.

- [ ] **Step 5: Run bundle and resilience tests**

Run from `frontend/`:

```powershell
node --test src/__tests__/siteDetailBundle.test.js src/__tests__/mapResilienceContracts.test.js src/__tests__/dashboardOptimizationContracts.test.js
```

Expected: PASS after updating contracts from direct detail calls to the bundle while retaining Mapbox popup daily-fetch assertions.

- [ ] **Step 6: Commit the shared bundle**

```powershell
git add frontend/src/services/siteDetailBundle.js frontend/src/__tests__/siteDetailBundle.test.js frontend/src/services/api.js frontend/src/pages/DataPotensiPage.jsx frontend/src/pages/SiteMapPage.jsx frontend/src/pages/DashboardPage.jsx frontend/src/__tests__/mapResilienceContracts.test.js
git commit -m "fix: unify site detail data loading"
```

---

### Task 5: Replace modal Daily Availability and group new master fields

**Files:**
- Create: `frontend/src/__tests__/siteDetailModalContracts.test.js`
- Modify: `frontend/src/components/SiteDetailModal.jsx:1-574`
- Modify: `frontend/src/__tests__/dashboardOptimizationContracts.test.js`

**Interfaces:**
- Consumes: `data`, `trendData`, and `performanceData` from the bundle.
- Produces: one availability trend, Revenue/Payload scorecards with MoM/period labels, and approved master-data sections.

- [ ] **Step 1: Write failing modal contract tests**

Require:

```javascript
assert.doesNotMatch(modal, /Daily Availability/);
assert.match(modal, /Revenue/);
assert.match(modal, /Payload/);
assert.match(modal, /revenue_mom_pct/);
assert.match(modal, /payload_mom_pct/);
assert.match(modal, /formatRevenue/);
assert.match(modal, /formatPayload/);
```

Assert `Band NE`, `NR2100`, `NR2300`, `NE Type`, and `Software Version` occur in
Teknologi; `Dual EAS` and `BBLTI Software` occur in Monitoring; Power and
Transport contain the approved additions; and `isEmptyValue` rejects prefixed
spreadsheet errors.

- [ ] **Step 2: Run the modal tests and verify RED**

Run from `frontend/`:

```powershell
node --test src/__tests__/siteDetailModalContracts.test.js src/__tests__/dashboardOptimizationContracts.test.js
```

Expected: FAIL because Daily Availability and old grouping remain.

- [ ] **Step 3: Implement performance scorecards and MoM formatting**

Import existing formatters. Add a focused `PerformanceMetricCard` with:

```text
formatted primary value
signed one-decimal MoM or en dash
MoM · Mon YYYY
```

Remove daily chart derivation and the `dailyData` prop. Keep trend empty/error
handling independent from performance empty/error handling.

- [ ] **Step 4: Implement approved field aliases and sections**

Move Band NE into Teknologi, add actual `NR2100`/`NR2300` aliases, add NE Type
and Software Version, add Power/Transport/Monitoring fields, and suppress
prefix spreadsheet errors. Confirm grouped keys are excluded from Data
Lainnya.

- [ ] **Step 5: Run modal and dashboard contract tests**

Run from `frontend/`:

```powershell
node --test src/__tests__/siteDetailModalContracts.test.js src/__tests__/dashboardOptimizationContracts.test.js src/__tests__/mapResilienceContracts.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the modal update**

```powershell
git add frontend/src/components/SiteDetailModal.jsx frontend/src/__tests__/siteDetailModalContracts.test.js frontend/src/__tests__/dashboardOptimizationContracts.test.js
git commit -m "feat: show site revenue and payload in detail modal"
```

---

### Task 6: Render accessible Data Potensi matrix charts

**Files:**
- Create: `frontend/src/features/data-potensi/DataPotensiMatrixCharts.jsx`
- Create: `frontend/src/features/data-potensi/dataPotensiMatrixUtils.js`
- Create: `frontend/src/__tests__/dataPotensiMatrixUtils.test.js`
- Modify: `frontend/src/pages/DataPotensiPage.jsx:9-58,730-826`
- Modify: `frontend/src/__tests__/dataPotensiContracts.test.js`

**Interfaces:**
- Consumes: `dashboardData.readiness_by_kabupaten` and `dashboardData.transport_configuration_matrix`.
- Produces: `OperationalReadinessHeatmap` and `TransportConfigurationMatrix`.

- [ ] **Step 1: Write failing pure data-shaping tests**

```javascript
assert.deepEqual(buildReadinessColumns()[0], { key: 'enva_ready_pct', label: 'ENVA' });
assert.equal(buildTransportMatrix(rows).columns.includes('UTP'), true);
assert.equal(buildTransportMatrix(rows).cells['FO_TELKOM|ONT']['UTP'].site_count, 8);
```

Also extend page contracts to require both titles, payload keys, placement
before `Breakdown by Kabupaten`, accessible labels, and the existing empty
state.

- [ ] **Step 2: Run focused matrix tests and verify RED**

Run from `frontend/`:

```powershell
node --test src/__tests__/dataPotensiMatrixUtils.test.js src/__tests__/dataPotensiContracts.test.js
```

Expected: FAIL because the utility and chart components do not exist.

- [ ] **Step 3: Implement the shared accessible heatmap grid**

Use semantic row/column labels, visible numeric cell text, title/`aria-label`
text containing ready/count totals, a low-to-high legend, and horizontal
overflow for wide matrices. Keep styling within graphite dashboard tokens and
`DashboardChartPanel`; do not introduce global CSS.

- [ ] **Step 4: Insert both panels into Data Potensi**

Render them after the three distribution charts and before the existing
Breakdown by Kabupaten section. Use a two-column wide-screen grid and a single
column on smaller viewports. Pass the arrays from `dashboardData` directly.

- [ ] **Step 5: Run matrix and Data Potensi tests**

Run from `frontend/`:

```powershell
node --test src/__tests__/dataPotensiMatrixUtils.test.js src/__tests__/dataPotensiContracts.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the new charts**

```powershell
git add frontend/src/features/data-potensi/DataPotensiMatrixCharts.jsx frontend/src/features/data-potensi/dataPotensiMatrixUtils.js frontend/src/__tests__/dataPotensiMatrixUtils.test.js frontend/src/pages/DataPotensiPage.jsx frontend/src/__tests__/dataPotensiContracts.test.js
git commit -m "feat: add data potensi readiness matrices"
```

---

### Task 7: Full verification, live browser proof, and Graphify refresh

**Files:**
- Modify if failures require scoped fixes: only files already listed in Tasks 1-6.
- Refresh generated artifacts: `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`.

**Interfaces:**
- Consumes: the completed implementation and local Neon-backed development environment.
- Produces: fresh test/build/browser evidence and current Graphify artifacts.

- [ ] **Step 1: Run full backend tests**

Run: `python -m pytest backend/tests -q`

Expected: zero failures.

- [ ] **Step 2: Run all frontend contract/unit tests**

Run from `frontend/`: `node --test src/__tests__/*.test.js`

Expected: zero failures.

- [ ] **Step 3: Run lint, production audit, and build**

Run from `frontend/`:

```powershell
npm run lint
npm run audit:production
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 4: Start the authenticated local app with process-only security settings**

Use `PUBLIC_APP_ORIGIN` matching the exact frontend origin. Start Uvicorn on
`127.0.0.1:8000` and Vite with `npm run dev -- --host 127.0.0.1 --port 5174 --strictPort`.
Do not write credentials or runtime secrets to repository files.

- [ ] **Step 5: Verify Data Potensi and Site Map with Playwright CLI**

Open Data Potensi, search/open `PSN003`, and verify:

```text
Availability 99.94% for Jun 2026
Revenue and Payload numeric values
signed MoM and Jul 2026 labels (subject to current live data)
approved master-data sections
no Daily Availability modal heading
```

Verify both new matrix titles and numeric cells, change NOP plus one advanced
filter, and confirm the matrices update. Repeat site-detail opening from Site
Map. Capture screenshots under `output/playwright/` and check browser console
and failed network requests.

- [ ] **Step 6: Refresh and verify Graphify**

Run: `graphify update .`

Then verify non-empty, fresh `graphify-out/graph.json` and
`graphify-out/GRAPH_REPORT.md`. Report any Graphify failure rather than claiming
the graph is current.

- [ ] **Step 7: Review diff and commit verification-driven fixes/artifacts**

Run:

```powershell
git status --short
git diff --check
git diff --stat origin/main...HEAD
```

Stage only in-scope tracked files. Do not add pre-existing untracked scripts,
`.playwright-cli/`, `.superpowers/`, `output/`, or unrelated Graphify scratch
files.
