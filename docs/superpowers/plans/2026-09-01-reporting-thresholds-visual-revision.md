# Network Reporting Threshold and Visual Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the approved Network Reporting scorecard, insight, and chart presentation while adding effective-dated site thresholds, Target Achieved analysis, complete table/pivot sorting, and Management Data configuration.

**Architecture:** Extend the existing Reporting foundation with one allowlisted effective-dated threshold table and a focused resolver service. Keep monthly aggregate NOP revenue targets separate, evaluate site targets in backend SQL before pagination, return explicit target metadata to React, and keep UI-only sorting local where the complete result is already present.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy async, PostgreSQL/Neon, React 19, Vite, Recharts, shadcn/Radix primitives, Node test runner, pytest.

**Spec:** `docs/superpowers/specs/2026-09-01-reporting-thresholds-visual-revision-design.md`

## Global Constraints

- Availability targets are Diamond 99.87%, Platinum 99.73%, Gold 99.68%, Silver 99.67%, and Bronze 99.73%.
- Revenue is U30 below Rp30,000,000, U60 from Rp30,000,000 to below Rp60,000,000, and Achieved at Rp60,000,000 or more.
- Payload is Achieved at 15 TB/month using `1 TB = 1,024 * 1,024 MB`.
- Threshold changes are effective-dated by month and never rewrite later or earlier versions implicitly.
- Overall site status is unavailable when any required value/config is missing, otherwise achieved only when all three metrics achieve target.
- Regional contribution wording stays numerically honest; availability uses percentage-point difference and outage share, never availability division.
- Existing monthly NOP revenue targets remain separate from site revenue bands.
- Keep the established Matte Graphite tokens, Lucide icon family, responsive mobile cards, print behavior, pivot limits, and source coverage.
- Do not mutate production data from the development worktree.

## File Structure

- `backend/sql/reporting_foundation.sql`: idempotent threshold table, constraints, refresh trigger registration, and baseline seed.
- `backend/models/reporting_thresholds.py`: management request/response and resolved threshold models.
- `backend/services/reporting_thresholds.py`: normalization, validation, effective-month resolution, version identity, atomic writes, and NOP revenue-target management.
- `backend/models/reporting.py`: overview/site response additions and `target_status` query contract.
- `backend/services/reporting_overview.py`: restored scorecard facts, YTD, contribution context, coverage, and threshold snapshot.
- `backend/services/reporting_drilldown.py`: monthly site target evaluation, filtering, ranking, and sortable server result.
- `backend/queries/reporting_foundation.py`: keep aggregate NOP target loading and expose shared target version primitives.
- `backend/routers/management_data.py`: permission-protected configuration endpoints.
- `backend/routers/reporting.py`: parse the new site target filter while preserving endpoint shapes.
- `frontend/src/features/management-data/ReportingThresholdConfiguration.jsx`: threshold and monthly NOP revenue-target editor.
- `frontend/src/features/reporting/ReportingScorecards.jsx`: restored scorecard hierarchy and contribution copy.
- `frontend/src/features/reporting/ReportingExecutiveInsights.jsx`: approved outer panel and semantic insight cards.
- `frontend/src/features/reporting/reportingInsights.js`: concise target-aware content shaping.
- `frontend/src/features/reporting/ReportingPerformanceTrend.jsx`: smooth monotone multi-axis chart.
- `frontend/src/features/reporting/ReportingAreaTable.jsx`: all-header client sorting and active-header ranking.
- `frontend/src/features/reporting/ReportingSiteDrilldown.jsx`: server sorting headers and Target Achieved filter.
- `frontend/src/features/reporting/reportingTableState.js`: deterministic derived-column sorting.
- `frontend/src/features/reporting/ReportingPivot.jsx`: interactive sort headers.
- `frontend/src/features/reporting/reportingPivotState.js`: stable pivot row sorting.
- `frontend/src/pages/ManagementDataPage.jsx`: add the Threshold Configuration tab.
- `frontend/src/pages/NetworkReportingPage.jsx`: compose restored scorecards and revised surfaces.
- `frontend/src/services/api.js`: typed request-boundary functions for configuration and reporting queries.

---

### Task 1: Effective-Dated Threshold Foundation

**Files:**
- Modify: `backend/sql/reporting_foundation.sql`
- Create: `backend/models/reporting_thresholds.py`
- Create: `backend/services/reporting_thresholds.py`
- Modify: `backend/tests/test_reporting_foundation.py`
- Create: `backend/tests/test_reporting_thresholds.py`

**Interfaces:**
- Produces: `resolve_threshold_snapshot(session, active_months) -> ReportingThresholdSnapshot`
- Produces: `save_threshold_version(session, effective_month, payload, actor) -> ReportingThresholdSnapshot`
- Produces: `threshold_version(snapshot) -> str`
- Consumes: canonical `YYYY-MM` validation from `periods.resolve_month_period`.

- [ ] **Step 1: Add failing schema and threshold resolver tests**

```python
def test_threshold_schema_has_effective_month_identity_and_seed_values():
    sql = (BACKEND / "sql" / "reporting_foundation.sql").read_text(encoding="utf-8")
    assert "CREATE TABLE IF NOT EXISTS public.reporting_metric_thresholds" in sql
    assert "PRIMARY KEY (metric, threshold_key, site_class, effective_month)" in sql
    for value in ("99.87", "99.73", "99.68", "99.67", "30000000", "60000000", "15"):
        assert value in sql


def test_classify_revenue_boundaries():
    assert classify_revenue(29_999_999, 30_000_000, 60_000_000) == "u30"
    assert classify_revenue(30_000_000, 30_000_000, 60_000_000) == "u60"
    assert classify_revenue(60_000_000, 30_000_000, 60_000_000) == "achieved"
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run from `backend`:

```powershell
python -m pytest -q tests/test_reporting_foundation.py tests/test_reporting_thresholds.py
```

Expected: failures for the missing table, module, and classifier.

- [ ] **Step 3: Add the idempotent schema and baseline seed**

Implement the allowlisted table checks, index by effective month, refresh trigger registration, and one seed statement using the earliest valid `traktor_data.trx_month`. Store payload as `15` with unit `tb`, revenue boundaries in `idr`, and availability values in `percent`.

```sql
CREATE TABLE IF NOT EXISTS public.reporting_metric_thresholds (
    metric text NOT NULL CHECK (metric IN ('availability', 'revenue', 'payload')),
    threshold_key text NOT NULL,
    site_class text NOT NULL,
    effective_month text NOT NULL CHECK (effective_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    threshold_value numeric(20, 4) NOT NULL CHECK (threshold_value >= 0),
    unit text NOT NULL CHECK (unit IN ('percent', 'idr', 'tb')),
    updated_by text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (metric, threshold_key, site_class, effective_month)
);
```

- [ ] **Step 4: Implement strict models and pure classification helpers**

Define `ThresholdVersionInput`, `ReportingThresholdSnapshot`, and resolved monthly threshold types. Implement:

```python
PAYLOAD_MB_PER_TB = 1024 * 1024


def classify_revenue(value: int | None, u30_upper: int, u60_upper: int) -> str:
    if value is None:
        return "unavailable"
    if value < u30_upper:
        return "u30"
    if value < u60_upper:
        return "u60"
    return "achieved"


def achieved_payload(value_mb: int | None, target_tb: float) -> str:
    if value_mb is None:
        return "unavailable"
    return "achieved" if value_mb >= target_tb * PAYLOAD_MB_PER_TB else "not_achieved"
```

Pydantic validation must reject missing Site Classes, availability outside 0–100, U30 greater than or equal to U60, and non-positive payload targets.

- [ ] **Step 5: Implement effective-month resolution and atomic save**

Use a window function per `(metric, threshold_key, site_class, active_month)` to select the newest configuration at or before each active month. `save_threshold_version` writes the complete eight-row version inside the caller's transaction and commits once.

- [ ] **Step 6: Run focused backend tests and confirm GREEN**

```powershell
python -m pytest -q tests/test_reporting_foundation.py tests/test_reporting_thresholds.py
```

Expected: all focused tests pass.

- [ ] **Step 7: Commit the threshold foundation**

```powershell
git add backend/sql/reporting_foundation.sql backend/models/reporting_thresholds.py backend/services/reporting_thresholds.py backend/tests/test_reporting_foundation.py backend/tests/test_reporting_thresholds.py
git commit -m "feat(reporting): add effective dated thresholds"
```

### Task 2: Management Data Threshold APIs

**Files:**
- Modify: `backend/routers/management_data.py`
- Modify: `backend/tests/test_management_contract.py`
- Modify: `backend/tests/test_management_rbac.py`
- Create: `backend/tests/test_management_reporting_thresholds.py`

**Interfaces:**
- Consumes: `ThresholdVersionInput`, `resolve_threshold_snapshot`, and `save_threshold_version` from Task 1.
- Produces: `GET /management-data/reporting-thresholds`
- Produces: `PUT /management-data/reporting-thresholds/{effective_month}`
- Produces: `GET /management-data/reporting-revenue-targets`
- Produces: `PUT /management-data/reporting-revenue-targets/{nop}/{trx_month}`

- [ ] **Step 1: Write failing route, permission, and validation tests**

```python
def test_threshold_routes_require_management_write(authenticated_client):
    response = authenticated_client.get(
        "/api/v1/management-data/reporting-thresholds",
        params={"effective_month": "2026-08"},
    )
    assert response.status_code == 403


def test_threshold_update_rejects_inverted_revenue_bands(data_admin_client):
    payload = valid_threshold_payload()
    payload["revenue_u30_upper"] = 70_000_000
    response = data_admin_client.put(
        "/api/v1/management-data/reporting-thresholds/2026-09",
        json=payload,
    )
    assert response.status_code == 422
```

- [ ] **Step 2: Run the management tests and confirm RED**

```powershell
python -m pytest -q tests/test_management_contract.py tests/test_management_rbac.py tests/test_management_reporting_thresholds.py
```

Expected: missing routes and response contracts fail.

- [ ] **Step 3: Add allowlisted threshold read/write routes**

Use `Depends(require_permission("management_data:write"))` on every endpoint. Canonicalize NOP with `canonical_nop`, reject Regional as a monthly NOP target key, constrain list filters and result count, and never accept arbitrary metric/table identifiers.

```python
@router.put("/reporting-thresholds/{effective_month}")
async def put_reporting_thresholds(
    effective_month: str,
    payload: ThresholdVersionInput,
    actor: AppUser = Depends(require_permission("management_data:write")),
):
    async with async_session() as session:
        return await save_threshold_version(session, effective_month, payload, actor.username)
```

- [ ] **Step 4: Add NOP revenue-target list and upsert routes**

Return canonical NOP, month, integer target, note, updater, and timestamp. Upsert exactly one `(nop_key, trx_month)` row and update `reporting_source_refresh` through the existing statement trigger.

- [ ] **Step 5: Run management tests and confirm GREEN**

```powershell
python -m pytest -q tests/test_management_contract.py tests/test_management_rbac.py tests/test_management_reporting_thresholds.py
```

Expected: endpoint, permission, invalid boundary, and atomic save tests pass.

- [ ] **Step 6: Commit the Management Data API**

```powershell
git add backend/routers/management_data.py backend/tests/test_management_contract.py backend/tests/test_management_rbac.py backend/tests/test_management_reporting_thresholds.py
git commit -m "feat(management): expose reporting threshold configuration"
```

### Task 3: Restore Overview Scorecard Facts and Threshold Context

**Files:**
- Modify: `backend/models/reporting.py`
- Modify: `backend/services/reporting_overview.py`
- Modify: `backend/routers/reporting.py`
- Modify: `backend/tests/test_reporting_overview.py`
- Modify: `backend/tests/test_reporting_routes.py`
- Modify: `backend/tests/integration/test_reporting_numeric.py`

**Interfaces:**
- Consumes: `resolve_threshold_snapshot(session, period.active_months)`.
- Produces: `ReportingOverviewScorecards.epm_sites`, `non_epm_sites`, `revenue_ytd`, and `payload_ytd`.
- Produces: `ReportingOverview.thresholds` and threshold source coverage.

- [ ] **Step 1: Add failing overview contract and numeric invariant tests**

```python
assert overview.scorecards.total_sites == (
    overview.scorecards.epm_sites + overview.scorecards.non_epm_sites
)
assert overview.scorecards.revenue_ytd == 420_000_000
assert overview.scorecards.payload_ytd == 31_457_280
assert overview.thresholds.payload_target_tb == 15
```

Add an integration fixture containing an EPM-prefixed site, a non-EPM site, January-to-selected-month facts, and a threshold change in the middle of history.

- [ ] **Step 2: Run the focused overview tests and confirm RED**

```powershell
python -m pytest -q tests/test_reporting_overview.py tests/test_reporting_routes.py tests/integration/test_reporting_numeric.py
```

Expected: missing scorecard fields and threshold snapshot assertions fail; database integration may skip when its opt-in URL is absent.

- [ ] **Step 3: Extend overview SQL using the existing reporting-site universe**

Classify each distinct normalized selected site by `site_key LIKE 'EPM%'`, calculate YTD from January through `period_end`, preserve NOP/Regional filters, and avoid a separate master-only site count that would violate reconciliation.

- [ ] **Step 4: Attach resolved thresholds, coverage, and cache version**

Add `reporting_metric_thresholds` to `SOURCE_LABELS` and coverage SQL. Include both metric threshold version and aggregate NOP revenue target version in the existing Reporting cache identity.

- [ ] **Step 5: Run overview and numeric tests and confirm GREEN**

```powershell
python -m pytest -q tests/test_reporting_overview.py tests/test_reporting_routes.py tests/test_reporting_foundation.py
```

With the disposable PostgreSQL fixture enabled:

```powershell
$env:REPORTING_TEST_DATABASE_URL = $reportingDisposableDatabaseUrl
python -m pytest -q tests/integration/test_reporting_numeric.py
Remove-Item Env:REPORTING_TEST_DATABASE_URL
```

`$reportingDisposableDatabaseUrl` is the connection URL returned by the
verified local disposable PostgreSQL instance created for this test run; it is
never written to a tracked file.

Expected: unit/contract tests pass and all numeric integration cases reconcile.

- [ ] **Step 6: Commit overview facts and target context**

```powershell
git add backend/models/reporting.py backend/services/reporting_overview.py backend/routers/reporting.py backend/tests/test_reporting_overview.py backend/tests/test_reporting_routes.py backend/tests/integration/test_reporting_numeric.py
git commit -m "feat(reporting): restore scorecard context"
```

### Task 4: Site Target Evaluation, Filtering, and Server Sorting

**Files:**
- Modify: `backend/models/reporting.py`
- Modify: `backend/services/reporting_drilldown.py`
- Modify: `backend/routers/reporting.py`
- Modify: `backend/tests/test_reporting_drilldown.py`
- Modify: `backend/tests/integration/test_reporting_numeric.py`

**Interfaces:**
- Consumes: monthly threshold CTE/data from `reporting_thresholds.py`.
- Produces: site metric target fields and `overall_target_status`.
- Replaces: query parameter `sla` with `target_status`.
- Preserves: `sort_by`, `sort_dir`, `rank`, `rank_limit`, and `rank_metric`.

- [ ] **Step 1: Write failing boundary and query-order tests**

```python
def test_overall_target_requires_all_metrics():
    assert overall_target_status("achieved", "achieved", "achieved") == "achieved"
    assert overall_target_status("achieved", "u60", "achieved") == "not_achieved"
    assert overall_target_status("unavailable", "achieved", "achieved") == "unavailable"


def test_target_filter_runs_before_pagination():
    assert "target_status" in SITE_FACTS_CTE
    assert SITE_FACTS_CTE.index("target_status") < ROWS_QUERY.index("LIMIT :limit")
```

Cover exact availability targets for all five classes, exact 15 TB, revenue boundaries, multi-month worst band, and null precedence.

- [ ] **Step 2: Run drill-down tests and confirm RED**

```powershell
python -m pytest -q tests/test_reporting_drilldown.py
```

Expected: missing target status model, SQL, and helper assertions fail.

- [ ] **Step 3: Build monthly target facts before period aggregation**

Join normalized site/month performance to the effective threshold rows. Compute per-month metric statuses, aggregate Revenue/Payload/Availability values as before, and aggregate status conservatively across all active months.

```sql
CASE
  WHEN BOOL_OR(month_status = 'unavailable') THEN 'unavailable'
  WHEN BOOL_AND(month_status = 'achieved') THEN 'achieved'
  ELSE 'not_achieved'
END AS overall_target_status
```

- [ ] **Step 4: Replace SLA filtering and preserve sortable allowlists**

Map `target_status` only to parameterized fixed SQL clauses. Keep every visible site column in `SITE_SORT_FIELDS`; use normalized Site ID as the final tie breaker.

- [ ] **Step 5: Run drill-down and numeric integration tests and confirm GREEN**

```powershell
python -m pytest -q tests/test_reporting_drilldown.py tests/test_reporting_routes.py
```

Expected: target boundaries, target filtering, ranking, pagination, and sorting pass.

- [ ] **Step 6: Commit target-aware drill-down**

```powershell
git add backend/models/reporting.py backend/services/reporting_drilldown.py backend/routers/reporting.py backend/tests/test_reporting_drilldown.py backend/tests/integration/test_reporting_numeric.py
git commit -m "feat(reporting): evaluate site targets"
```

### Task 5: Management Data Threshold Configuration UI

**Files:**
- Create: `frontend/src/features/management-data/ReportingThresholdConfiguration.jsx`
- Create: `frontend/src/features/management-data/reportingThresholdState.js`
- Create: `frontend/src/__tests__/reportingThresholdState.test.js`
- Modify: `frontend/src/pages/ManagementDataPage.jsx`
- Modify: `frontend/src/services/api.js`
- Modify: `frontend/src/__tests__/managementDataContracts.test.js`

**Interfaces:**
- Produces: `fetchReportingThresholds`, `saveReportingThresholds`, `fetchReportingRevenueTargets`, and `saveReportingRevenueTarget` API functions.
- Produces: `validateThresholdDraft(draft) -> { valid, errors }`.
- Consumes: Management Data permission already enforced by route and backend.

- [ ] **Step 1: Write failing validation and component contract tests**

```javascript
it('rejects inverted revenue bands and invalid availability', () => {
  const result = validateThresholdDraft({
    availability: { diamond: 100.1, platinum: 99.73, gold: 99.68, silver: 99.67, bronze: 99.73 },
    revenue_u30_upper: 70_000_000,
    revenue_u60_upper: 60_000_000,
    payload_target_tb: 15,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.diamond);
  assert.ok(result.errors.revenue_u30_upper);
});
```

The page contract must require `Threshold Configuration`, `Bulan efektif`, every Site Class label, U30, U60, Payload, NOP, and target revenue.

- [ ] **Step 2: Run frontend focused tests and confirm RED**

Run from `frontend`:

```powershell
node --test src/__tests__/reportingThresholdState.test.js src/__tests__/managementDataContracts.test.js
```

Expected: missing helper, component, tab, and API functions fail.

- [ ] **Step 3: Implement pure draft parsing and validation**

Keep display values as user-friendly decimal strings and convert to numeric API values only at the request boundary. Treat comma and dot as decimal separators for availability and payload; keep rupiah inputs integer-only.

- [ ] **Step 4: Implement focused threshold and NOP target editors**

Use existing `Input`, `Select`, `Button`, `Alert`, and page tokens. Show one effective-month control, grouped availability inputs, two revenue boundary inputs, one payload input, update metadata, and one save action. Add a compact monthly NOP revenue-target editor below it without inventing decorative cards or AI copy.

- [ ] **Step 5: Add API functions and integrate the new tab**

```javascript
export async function saveReportingThresholds(effectiveMonth, payload) {
  const { data } = await api.put(
    `/management-data/reporting-thresholds/${encodeURIComponent(effectiveMonth)}`,
    payload,
  );
  return data;
}
```

Load data only while the tab is active, preserve the last successful snapshot on refresh errors, and surface backend validation detail safely.

- [ ] **Step 6: Run focused frontend tests and lint**

```powershell
node --test src/__tests__/reportingThresholdState.test.js src/__tests__/managementDataContracts.test.js
npm run lint
```

Expected: focused tests and ESLint pass.

- [ ] **Step 7: Commit Management Data UI**

```powershell
git add frontend/src/features/management-data frontend/src/pages/ManagementDataPage.jsx frontend/src/services/api.js frontend/src/__tests__/reportingThresholdState.test.js frontend/src/__tests__/managementDataContracts.test.js
git commit -m "feat(management): add threshold editor"
```

### Task 6: Restore Scorecards, Executive Insight, and Smooth Trend

**Files:**
- Create: `frontend/src/features/reporting/ReportingScorecards.jsx`
- Modify: `frontend/src/features/reporting/ReportingExecutiveInsights.jsx`
- Modify: `frontend/src/features/reporting/reportingInsights.js`
- Modify: `frontend/src/features/reporting/ReportingPerformanceTrend.jsx`
- Modify: `frontend/src/pages/NetworkReportingPage.jsx`
- Modify: `frontend/src/__tests__/dashboardReportingContracts.test.js`
- Modify: `frontend/src/__tests__/reportingInsights.test.js`

**Interfaces:**
- Consumes: overview scorecard, contribution, aggregate target, and threshold fields from Tasks 3–4.
- Produces: restored visual hierarchy without frontend threshold constants.

- [ ] **Step 1: Write failing visual/content contract tests**

```javascript
assert.match(scorecards, /EPM/);
assert.match(scorecards, /Site \(non EPM\)/);
assert.match(scorecards, /YTD/);
assert.match(insights, /Executive Insight/);
assert.doesNotMatch(insights, /Auto-generated/);
assert.match(trend, /type="monotone"/);
assert.match(trend, /linearGradient/);
```

Add behavior assertions for the exact contribution prefix `Kontribusi NOP SIDOARJO`, Regional selection suppression, and availability percentage-point/outage wording.

- [ ] **Step 2: Run focused Reporting frontend tests and confirm RED**

```powershell
node --test src/__tests__/dashboardReportingContracts.test.js src/__tests__/reportingInsights.test.js
```

Expected: missing scorecard component and restored panel/chart contracts fail.

- [ ] **Step 3: Implement `ReportingScorecards` with restored metadata**

Use the former content hierarchy: semantic icon/value color, 27–28px monospaced main value, compact comparison line, YTD/site composition, and Regional contribution. Omit contribution when scope is Regional Jatim.

- [ ] **Step 4: Restore Executive Insight panel structure and copy**

Build one outer graphite panel containing three semantic cards. Use short status chips only when they encode actual target state. Revenue uses aggregate NOP target; Payload uses configured 15 TB/month context; Availability reports configured Site Class target achievement and Regional comparison without division.

- [ ] **Step 5: Restore the smooth trend chart**

Set Revenue and Payload areas and Availability line to `type="monotone"`, use low-opacity gradients, two-pixel commercial strokes, three-pixel availability stroke, small observed-point dots, and current dashboard axes/tooltips.

- [ ] **Step 6: Compose the restored components and run tests**

```powershell
node --test src/__tests__/dashboardReportingContracts.test.js src/__tests__/reportingInsights.test.js
npm run lint
```

Expected: content, wording, anti-slop, chart, and lint checks pass.

- [ ] **Step 7: Commit visual restoration**

```powershell
git add frontend/src/features/reporting/ReportingScorecards.jsx frontend/src/features/reporting/ReportingExecutiveInsights.jsx frontend/src/features/reporting/reportingInsights.js frontend/src/features/reporting/ReportingPerformanceTrend.jsx frontend/src/pages/NetworkReportingPage.jsx frontend/src/__tests__/dashboardReportingContracts.test.js frontend/src/__tests__/reportingInsights.test.js
git commit -m "feat(reporting): restore executive presentation"
```

### Task 7: Complete Kabupaten, Site, and Pivot Sorting

**Files:**
- Modify: `frontend/src/features/reporting/reportingTableState.js`
- Modify: `frontend/src/features/reporting/ReportingAreaTable.jsx`
- Modify: `frontend/src/features/reporting/ReportingSiteDrilldown.jsx`
- Modify: `frontend/src/features/reporting/reportingPivotState.js`
- Modify: `frontend/src/features/reporting/ReportingPivot.jsx`
- Modify: `frontend/src/__tests__/reportingTableState.test.js`
- Modify: `frontend/src/__tests__/reportingPivotState.test.js`
- Modify: `frontend/src/__tests__/dashboardReportingContracts.test.js`
- Modify: `frontend/src/services/api.js`

**Interfaces:**
- Produces: `sortPivotRows(grid, sort) -> grid` without mutating the source grid.
- Produces: derived area sort fields `ticket_backup_total` and `proker_total`.
- Consumes: backend `target_status`, site target fields, and existing server sort parameters.

- [ ] **Step 1: Add failing stable-sort and interaction tests**

```javascript
it('sorts pivot numeric cells null-last without mutating rows', () => {
  const grid = { rows: [
    { label: 'B', cells: [null], total: null },
    { label: 'A', cells: [20], total: 20 },
    { label: 'C', cells: [10], total: 10 },
  ] };
  const sorted = sortPivotRows(grid, { key: 'column:0', direction: 'desc' });
  assert.deepEqual(sorted.rows.map((row) => row.label), ['A', 'C', 'B']);
  assert.deepEqual(grid.rows.map((row) => row.label), ['B', 'A', 'C']);
});
```

Contract tests must reject `SlaBadge`, `reporting-rank-metric`, and `reporting-site-sort`; require sortable buttons for every visible header; and require `Target Achieved` plus all four filter options.

- [ ] **Step 2: Run focused table/pivot tests and confirm RED**

```powershell
node --test src/__tests__/reportingTableState.test.js src/__tests__/reportingPivotState.test.js src/__tests__/dashboardReportingContracts.test.js
```

Expected: missing pivot sorter, remaining dropdowns/badges, and incomplete header sorts fail.

- [ ] **Step 3: Make every Kabupaten header sortable**

Remove the metric dropdown. Add Traffic, Ticket/Backup, and Proker `SortHeader` use. Top/Bottom must use the active header field; derived columns compare total tickets and total activities with Kabupaten as tie breaker.

- [ ] **Step 4: Replace site controls and wire server sort headers**

Remove the site sort dropdown and SLA badges. Add `Target Achieved` options mapped to `target_status`. Each header calls one `handleSort(field)` that toggles direction, updates `rank_metric`, and resets page to one. Top/Bottom follows the active field.

- [ ] **Step 5: Add pivot header sorting**

Keep source numeric cell values in `buildPivotGrid`. Add sort state to `ReportingPivot`, render accessible header buttons with direction icons, and sort only body rows; totals remain aggregate rows at the bottom.

- [ ] **Step 6: Run focused tests and lint**

```powershell
node --test src/__tests__/reportingTableState.test.js src/__tests__/reportingPivotState.test.js src/__tests__/dashboardReportingContracts.test.js
npm run lint
```

Expected: every requested sort path, filter mapping, stable null-last behavior, and lint pass.

- [ ] **Step 7: Commit analysis interactions**

```powershell
git add frontend/src/features/reporting frontend/src/services/api.js frontend/src/__tests__/reportingTableState.test.js frontend/src/__tests__/reportingPivotState.test.js frontend/src/__tests__/dashboardReportingContracts.test.js
git commit -m "feat(reporting): complete target filtering and sorting"
```

### Task 8: Full Verification, Browser QA, Graphify, and PR Update

**Files:**
- Modify if required by verification: only files already listed in Tasks 1–7.
- Generate locally then keep out of Git: `output/playwright/reporting-thresholds-*.png`.

**Interfaces:**
- Consumes: complete implementation from Tasks 1–7.
- Produces: verified branch updates for PR #40.

- [ ] **Step 1: Run the complete backend suite**

```powershell
Set-Location backend
python -m pytest -q
```

Expected: zero failures; database integration skips are reported explicitly when the opt-in database URL is absent.

- [ ] **Step 2: Run numeric integration against disposable PostgreSQL**

Start a disposable local PostgreSQL instance, set `REPORTING_TEST_DATABASE_URL` only for that process, run:

```powershell
python -m pytest -q tests/integration/test_reporting_numeric.py
```

Expected: every numeric threshold, target, contribution, and reconciliation test passes. Stop and remove only the verified disposable instance afterward.

- [ ] **Step 3: Run complete frontend verification**

```powershell
Set-Location ..\frontend
node --test src/__tests__/*.test.js
npm run lint
npm run build
```

Expected: zero test/lint/build failures. Existing Vite chunk-size warnings may be reported but are not test failures.

- [ ] **Step 4: Run real browser QA**

Use the Playwright CLI skill against local Vite/API fixtures. Verify:

- desktop scorecards match the approved richer hierarchy;
- contribution sentences show for SIDOARJO and hide for Regional Jatim;
- Executive Insight and smooth chart remain readable in dark and light theme;
- every Kabupaten, site, and pivot header changes sort direction;
- Target Achieved filter returns the expected boundary fixtures;
- mobile site cards and full-width sidebar do not clip;
- Management Data loads, validates, and saves a disposable threshold fixture;
- console has zero errors and failed requests.

- [ ] **Step 5: Refresh Graphify and inspect the final diff**

```powershell
Set-Location ..
graphify update .
git diff --check
git status --short --branch
```

Expected: Graphify rebuild succeeds, diff check is clean, and only scoped files/artifacts are present.

- [ ] **Step 6: Commit any verification fixes**

If verification required scoped corrections, rerun the affected test first, then:

```powershell
git add -- backend frontend .github/workflows/deploy.yml
git commit -m "fix(reporting): address threshold verification"
```

If no correction was needed, do not create an empty commit.

- [ ] **Step 7: Push and report PR checks**

```powershell
git push
gh pr checks 40
```

Expected: branch updates are visible on PR #40. Report passed and pending checks separately without claiming pending work is green.
