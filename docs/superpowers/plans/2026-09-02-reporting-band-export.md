# Network Reporting Revenue Band and XLSX Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend-owned U30/U60 analysis, reliable multi-period loading, and genuine XLSX exports to Network Reporting.

**Architecture:** PostgreSQL remains the source of truth for effective-month revenue-band classification. FastAPI owns aggregation, filtering, concurrency, and workbook generation; React only renders the returned contracts and initiates downloads. Area/site and pivot exports reuse the same service functions as the web views.

**Tech Stack:** FastAPI, SQLAlchemy async, PostgreSQL/Neon, Pydantic, openpyxl runtime export, pytest, React 19, Axios, Node test runner, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-09-02-reporting-band-export-design.md`

## Global Constraints

- Multi-period U30/U60/Achieved classification must use the conservative rule in the spec.
- Missing revenue or effective threshold data remains `unavailable`.
- Comparison windows must have the same number of months as the selected window.
- Backend owns all category calculations and XLSX creation.
- Existing Target Achieved semantics remain separate from revenue-band shortcuts.
- The area export must contain all matching sites, independent of UI pagination.
- No new frontend spreadsheet dependency.

---

### Task 1: Revenue-band area contract

**Files:**
- Modify: `backend/models/reporting.py`
- Modify: `backend/services/reporting_overview.py`
- Test: `backend/tests/test_reporting_overview.py`
- Test: `backend/tests/integration/test_reporting_numeric.py`

**Interfaces:**
- Produces: `ReportingAreaRow.u30_sites`, `previous_u30_sites`, `u30_mom_pct`, `u60_sites`, `previous_u60_sites`, `u60_mom_pct`.
- Consumes: effective threshold selection already used by Reporting drill-down.

- [ ] **Step 1: Write failing model and service tests**

```python
def test_area_row_exposes_revenue_band_counts_and_equal_window_deltas():
    row = ReportingAreaRow(
        area_key="SIDOARJO",
        kabupaten="SIDOARJO",
        sla_status="met",
        u30_sites=12,
        previous_u30_sites=10,
        u30_mom_pct=20.0,
        u60_sites=6,
        previous_u60_sites=8,
        u60_mom_pct=-25.0,
    )
    assert row.u30_mom_pct == 20.0
    assert row.u60_mom_pct == -25.0
```

Add a PostgreSQL fixture where one site is U30 in only one selected month and
assert it remains U30 for the whole selected range. Add a second site that is
never U30 but is U60 once, and a third that is Achieved in every month.

- [ ] **Step 2: Run tests and confirm the new contract fails**

Run: `py -3.14 -m pytest tests/test_reporting_overview.py tests/integration/test_reporting_numeric.py -q`

Expected: FAIL because the area-band fields and SQL aggregation do not exist.

- [ ] **Step 3: Implement effective-month area classification**

Extend `AREA_AGGREGATES_QUERY` with selected and comparison month calendars,
effective U30/U60 thresholds, site-month facts, and conservative site-range
classification. Aggregate current and previous U30/U60 counts per area.

Map integer fields directly and calculate percentages using the existing safe
delta helper:

```python
row["u30_mom_pct"] = percentage_delta(row["u30_sites"], row["previous_u30_sites"])
row["u60_mom_pct"] = percentage_delta(row["u60_sites"], row["previous_u60_sites"])
```

- [ ] **Step 4: Run focused tests**

Run: `py -3.14 -m pytest tests/test_reporting_overview.py tests/integration/test_reporting_numeric.py -q`

Expected: unit tests pass; integration tests pass when PostgreSQL is configured or skip only under their existing explicit guard.

- [ ] **Step 5: Commit the area contract**

```text
git add backend/models/reporting.py backend/services/reporting_overview.py backend/tests/test_reporting_overview.py backend/tests/integration/test_reporting_numeric.py
git commit -m "feat: add reporting area revenue bands"
```

### Task 2: Reliable multi-period overview loading

**Files:**
- Modify: `backend/services/reporting_overview.py`
- Modify: `backend/routers/reporting.py`
- Modify: `frontend/src/services/api.js`
- Test: `backend/tests/test_reporting_overview.py`
- Test: `backend/tests/test_reporting_routes.py`
- Test: `frontend/src/__tests__/dashboardReportingContracts.test.js`

**Interfaces:**
- Produces: `load_reporting_overview(..., session_factory=None)` compatibility and concurrent production path.
- Consumes: `database.async_session` as the production session factory.

- [ ] **Step 1: Write a failing concurrency behavior test**

Use delayed fake session contexts that record active executions. Assert that
the session-factory path reaches `max_active > 1` and returns the same
`ReportingOverview` values as the sequential compatibility path. Do not use a
brittle elapsed-time assertion.

- [ ] **Step 2: Run the focused backend tests and confirm failure**

Run: `py -3.14 -m pytest tests/test_reporting_overview.py tests/test_reporting_routes.py -q`

Expected: FAIL because the service has no session-factory concurrency path.

- [ ] **Step 3: Implement separate-session concurrency**

Create one coroutine per independent overview fact. Each coroutine opens its
own session from the supplied factory. Resolve them with `asyncio.gather`, then
pass the results to the unchanged `build_reporting_overview` logic. Keep the
current session-only path for unit-test doubles and non-production callers.

Pass `async_session` from the overview route and add a Reporting-specific Axios
timeout:

```javascript
api.get('/reporting/overview', {
  params: { ...monthPeriodParams(period), nop: nop || undefined },
  signal,
  timeout: 60_000,
});
```

- [ ] **Step 4: Run focused backend and frontend tests**

Run: `py -3.14 -m pytest tests/test_reporting_overview.py tests/test_reporting_routes.py -q`

Run: `node --test src/__tests__/dashboardReportingContracts.test.js`

- [ ] **Step 5: Commit the latency fix**

```text
git add backend/services/reporting_overview.py backend/routers/reporting.py backend/tests/test_reporting_overview.py backend/tests/test_reporting_routes.py frontend/src/services/api.js frontend/src/__tests__/dashboardReportingContracts.test.js
git commit -m "fix: parallelize reporting overview facts"
```

### Task 3: Site revenue-band filtering and status

**Files:**
- Modify: `backend/models/reporting.py`
- Modify: `backend/services/reporting_drilldown.py`
- Modify: `backend/routers/reporting.py`
- Modify: `frontend/src/features/reporting/ReportingSiteDrilldown.jsx`
- Test: `backend/tests/test_reporting_drilldown.py`
- Test: `backend/tests/test_reporting_routes.py`
- Test: `frontend/src/__tests__/reportingDrilldownContracts.test.js`

**Interfaces:**
- Produces: `ReportingSiteQuery.revenue_band` and the corresponding URL parameter.
- Consumes: existing `ReportingSiteRow.revenue_band` values.

- [ ] **Step 1: Write failing query/filter tests**

```python
def test_site_query_accepts_revenue_band_filter():
    assert ReportingSiteQuery(revenue_band="u30").revenue_band == "u30"

def test_site_query_rejects_unknown_revenue_band():
    with pytest.raises(ValidationError):
        ReportingSiteQuery(revenue_band="active")
```

Add a service test proving the filter is applied independently of
`target_status` and a UI contract test for U30/U60 shortcut buttons.

- [ ] **Step 2: Run tests and confirm failure**

Run: `py -3.14 -m pytest tests/test_reporting_drilldown.py tests/test_reporting_routes.py -q`

Run: `node --test src/__tests__/reportingDrilldownContracts.test.js`

- [ ] **Step 3: Implement backend filter and severity sorting**

Add `revenue_band` to the validated query and cache key. Filter the computed
band after monthly collapse. Map Status sorting to a CASE expression with
U30/U60/Achieved/Unavailable order while retaining `status_site` in the row.

- [ ] **Step 4: Implement drawer shortcuts and band status cells**

Add U30 and U60 buttons immediately after Bottom 10. A selected shortcut sends
`revenue_band`; selecting it again returns to `all`. Render the existing
`revenue_band` with restrained semantic colors and the labels U30, U60,
Achieved, and Unavailable.

- [ ] **Step 5: Run focused tests and commit**

Run: `py -3.14 -m pytest tests/test_reporting_drilldown.py tests/test_reporting_routes.py -q`

Run: `node --test src/__tests__/reportingDrilldownContracts.test.js`

```text
git add backend/models/reporting.py backend/services/reporting_drilldown.py backend/routers/reporting.py backend/tests/test_reporting_drilldown.py backend/tests/test_reporting_routes.py frontend/src/features/reporting/ReportingSiteDrilldown.jsx frontend/src/__tests__/reportingDrilldownContracts.test.js
git commit -m "feat: filter site drilldown by revenue band"
```

### Task 4: Backend-owned XLSX exports

**Files:**
- Create: `backend/services/reporting_export.py`
- Modify: `backend/services/reporting_drilldown.py`
- Modify: `backend/routers/reporting.py`
- Test: `backend/tests/test_reporting_export.py`
- Test: `backend/tests/test_reporting_routes.py`

**Interfaces:**
- Produces: `build_area_workbook(...) -> bytes`, `build_pivot_workbook(...) -> bytes`, and a set-based full-site export loader.
- Consumes: `load_reporting_areas`, the canonical site facts, and `execute_reporting_pivot`.

- [ ] **Step 1: Write failing workbook round-trip tests**

Create literal area/site/pivot fixtures, call the builders, and load the result
with `openpyxl.load_workbook(BytesIO(payload), data_only=False)`. Assert:

```python
assert workbook.sheetnames == ["Kabupaten", "Site"]
assert workbook["Kabupaten"].freeze_panes == "A6"
assert workbook["Kabupaten"].auto_filter.ref is not None
assert workbook["Kabupaten"]["C6"].value == 12
assert isinstance(workbook["Site"]["H6"].value, int)
```

Add a route test checking the XLSX media type, attachment filename, and magic
bytes `b"PK"`.

- [ ] **Step 2: Run export tests and confirm failure**

Run: `py -3.14 -m pytest tests/test_reporting_export.py tests/test_reporting_routes.py -q`

- [ ] **Step 3: Implement set-based site export loading**

Refactor the site-fact query so the public page path applies area, rank,
pagination, and filters, while the export path can return all sites for the
canonical period/NOP in one query. Do not loop through Kabupaten and do not
issue one query per area.

- [ ] **Step 4: Implement compact workbook builders**

Use typed values and these formats:

```python
COUNT_FORMAT = "#,##0"
PERCENT_FORMAT = "0.0%"
CURRENCY_FORMAT = '"Rp" #,##0'
AVAILABILITY_FORMAT = "0.00%"
```

Write metadata in rows 1-3, headers on row 5, freeze at A6, enable filters,
apply restrained dark headers, alternating rows, sensible width caps, and no
decorative chart. Convert API percentage-point values to Excel fractions before
applying percentage formats. Pivot values retain numeric types and
measure-appropriate formats.

- [ ] **Step 5: Add authenticated streaming routes**

Return `StreamingResponse(BytesIO(payload), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")`
with safe deterministic filenames. The pivot route validates and executes the
same `ReportingPivotRequest` as the web endpoint.

- [ ] **Step 6: Run tests and commit**

Run: `py -3.14 -m pytest tests/test_reporting_export.py tests/test_reporting_routes.py tests/test_reporting_pivot.py -q`

```text
git add backend/services/reporting_export.py backend/services/reporting_drilldown.py backend/routers/reporting.py backend/tests/test_reporting_export.py backend/tests/test_reporting_routes.py
git commit -m "feat: export reporting analysis to xlsx"
```

### Task 5: Area, trend, period, and download UI

**Files:**
- Modify: `frontend/src/components/DashboardSidebar.jsx`
- Modify: `frontend/src/components/dashboard-filters/periodRange.js`
- Modify: `frontend/src/features/reporting/ReportingPerformanceTrend.jsx`
- Modify: `frontend/src/features/reporting/ReportingAreaTable.jsx`
- Modify: `frontend/src/features/reporting/reportingTableState.js`
- Modify: `frontend/src/features/reporting/reportingPerformanceMetrics.js`
- Modify: `frontend/src/features/reporting/ReportingPivot.jsx`
- Modify: `frontend/src/pages/NetworkReportingPage.jsx`
- Modify: `frontend/src/services/api.js`
- Test: `frontend/src/__tests__/periodRange.test.js`
- Test: `frontend/src/__tests__/reportingPerformanceMetrics.test.js`
- Test: `frontend/src/__tests__/reportingTableState.test.js`
- Test: `frontend/src/__tests__/reportingTrendState.test.js`
- Test: `frontend/src/__tests__/dashboardReportingContracts.test.js`
- Test: `frontend/src/__tests__/reportingPivotContracts.test.js`

**Interfaces:**
- Produces: `formatReportingPeriodTitle`, XLSX blob API helpers, and UI actions.
- Consumes: backend area-band fields and export endpoints.

- [ ] **Step 1: Write failing pure-state tests**

```javascript
assert.equal(formatReportingPeriodTitle('2026-08', '2026-08'), 'Agustus 2026');
assert.equal(formatReportingPeriodTitle('2026-05', '2026-08'), 'Mei - Agustus 2026');
assert.equal(formatReportingPeriodTitle('2026-01', '2026-06'), 'Januari - Juni 2026');
```

Add literal tests proving U30/U60 sorting is deterministic and grand-total MoM
is recomputed from selected/previous counts. Update the trend test to expect
Achieved instead of the derived at-risk total.

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test src/__tests__/periodRange.test.js src/__tests__/reportingPerformanceMetrics.test.js src/__tests__/reportingTableState.test.js src/__tests__/reportingTrendState.test.js`

- [ ] **Step 3: Implement copy, columns, sorting, and tooltip**

Change the sidebar label to Network Reporting. Add the full Indonesian Reporting
period formatter without changing compact global filter labels. Add U30 and U60
after Site with signed inline MoM, sortable headers, and mobile-priority cells.
Replace the tooltip At risk row with Achieved and its month-to-month count delta.

- [ ] **Step 4: Implement XLSX download actions**

API helpers request blobs and return `{ blob, filename }` parsed from
`Content-Disposition`. A shared browser helper creates an object URL, clicks a
temporary anchor, removes it, and revokes the URL. Area export uses current
period/NOP; pivot export uses the last applied pivot specification.

- [ ] **Step 5: Run frontend tests, lint, and build**

Run: `node --test src/__tests__/periodRange.test.js src/__tests__/reportingPerformanceMetrics.test.js src/__tests__/reportingTableState.test.js src/__tests__/reportingTrendState.test.js src/__tests__/dashboardReportingContracts.test.js src/__tests__/reportingDrilldownContracts.test.js src/__tests__/reportingPivotContracts.test.js`

Run: `npm run lint`

Run: `npm run build`

- [ ] **Step 6: Commit the UI**

```text
git add frontend/src/components/DashboardSidebar.jsx frontend/src/components/dashboard-filters/periodRange.js frontend/src/features/reporting frontend/src/pages/NetworkReportingPage.jsx frontend/src/services/api.js frontend/src/__tests__
git commit -m "feat: add reporting band analysis controls"
```

### Task 6: Integrated verification and delivery

**Files:**
- Modify when graph changes: `graphify-out/graph.json`
- Verify: all files changed by Tasks 1-5

**Interfaces:**
- Consumes: the complete approved Reporting behavior.
- Produces: reproducible verification evidence and a reviewable pull request.

- [ ] **Step 1: Run all backend tests**

Run: `py -3.14 -m pytest tests -q`

Expected: all non-environment-gated tests pass.

- [ ] **Step 2: Run PostgreSQL Reporting integration tests**

Run with the repository's configured Reporting PostgreSQL test service:

```text
$env:RUN_REPORTING_DB_TESTS='1'
py -3.14 -m pytest tests/integration/test_reporting_numeric.py -q
```

Expected: numeric assertions pass; do not substitute SQLite for PostgreSQL SQL.

- [ ] **Step 3: Run the full frontend verification set**

Run: `node --test --test-reporter=dot src/__tests__/*.test.js`

Run: `npm run lint`

Run: `npm run audit:production`

Run: `npm run build`

- [ ] **Step 4: Perform browser QA**

Verify one single month and Semester 1 on desktop and mobile. Check area title,
U30/U60 sorting, drawer shortcuts/status, tooltip Achieved, and both XLSX
downloads. Open the downloaded files and visually inspect both sheets.

- [ ] **Step 5: Refresh the architecture graph**

Run: `graphify update .`

Confirm the update succeeds and never stage local `.graphify/` configuration.

- [ ] **Step 6: Final review, commit any verification fixes, and open a PR**

Stage only files named in this plan, confirm `git diff --check`, push
`codex/reporting-band-export`, and open a PR against `main` with test evidence.
