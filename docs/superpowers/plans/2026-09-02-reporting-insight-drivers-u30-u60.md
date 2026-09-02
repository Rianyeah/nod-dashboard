# Reporting Insight Drivers and U30/U60 Trend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Network Reporting more actionable by adding evidence-backed site drivers, deterministic telecom recommendations, monthly U30/U60 risk trends, inline MoM values, and filter-aware grand totals while preserving the approved compact visual hierarchy.

**Architecture:** Extend the existing typed `/reporting/overview`, `/reporting/areas`, and `/reporting/areas/{area_key}/sites` contracts rather than adding new endpoints. PostgreSQL remains responsible for complete filtered universes, effective-month threshold classification, and raw comparison inputs; small pure Python/JavaScript helpers handle deterministic driver selection, recommendation rules, totals, and presentation. The existing page remains one compact Reporting surface, with the U30/U60 chart sharing the current trend panel.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy async, PostgreSQL, React 19, Vite 8, Recharts 3, Tailwind CSS, Node test runner, pytest, Playwright/browser QA.

**Spec:** `docs/superpowers/specs/2026-09-02-reporting-insight-drivers-u30-u60-design.md`

## Global Constraints

- Keep Reporting focused on availability, payload, and revenue.
- Do not call an LLM or an external AI service at runtime.
- Recommendations must be deterministic, auditable, evidence-bound checks or actions; never present correlation as a proven root cause.
- Display availability changes with `%`, for example `+0,03%`; never render `pp` on the Reporting page.
- Color Executive Insight surfaces by MoM direction: desaturated emerald for positive, desaturated red/rose for negative, and neutral slate for stable or unavailable.
- Do not use neon fills, outer glow, animated pulse, or decorative gradients on insight status surfaces.
- Preserve effective-month thresholds and classify missing required data or threshold configuration as `unavailable`, never zero or stable.
- U30 is revenue below the effective U30 upper bound; U60 is revenue at or above U30 and below U60; revenue at or above U60 is achieved.
- Kabupaten totals cover the complete active area filter before sorting or Top/Bottom ranking.
- Site totals cover the complete semantic site filter before sorting, Top/Bottom ranking, or pagination.
- Recompute availability from summed service duration and outage duration; never average displayed availability percentages.
- Keep `.graphify/` and Graphify-generated local output uncommitted.
- Work only on `codex/reporting-insight-drivers`; do not write directly to `main`.
- Design read: preserve the existing operational telecom dashboard for regional network operators, with a compact, trust-first, data-dense language using the current Tailwind/shadcn token system.
- Frontend dials for this targeted evolution are `DESIGN_VARIANCE: 3`, `MOTION_INTENSITY: 1`, and `VISUAL_DENSITY: 8`; no new animation or design-system dependency is authorized.
- `design-taste-frontend` explicitly excludes dashboards and data tables, so do not apply its landing-page block patterns; retain only its redesign-preservation, restrained-color, copy-audit, responsive-state, and accessibility checks.

## File Structure

### New files

- `backend/services/reporting_insights.py` — pure direction, driver-selection, contribution, and deterministic recommendation rules.
- `backend/tests/test_reporting_insights.py` — focused unit tests for the pure insight rule engine.
- `frontend/src/features/reporting/ReportingMetricValue.jsx` — shared main-value plus inline-MoM rendering for desktop rows, mobile cards, and total rows.
- `frontend/src/features/reporting/reportingTrendState.js` — pure enrichment for U30/U60 at-risk totals and previous-month deltas.
- `frontend/src/__tests__/reportingTrendState.test.js` — exact tests for trend enrichment and unavailable months.

### Existing files to modify

- `backend/models/reporting.py` — extend overview trend/driver contracts, comparison inputs, and site grand-total response.
- `backend/services/reporting_overview.py` — load driver candidates, historical threshold bands, area comparison availability, and deterministic recommendations.
- `backend/services/reporting_drilldown.py` — retain previous availability and aggregate the full filtered site total before pagination/ranking.
- `backend/routers/reporting.py` — bump schema cache resources for changed payloads.
- `backend/tests/test_reporting_overview.py` — overview query/builder contract and area comparison tests.
- `backend/tests/test_reporting_drilldown.py` — previous availability and unpaged total tests.
- `backend/tests/test_reporting_redis_cache.py` — schema-version assertions.
- `backend/tests/integration/test_reporting_numeric.py` — numeric boundary, historical-threshold, driver, weighting, and pagination reconciliation tests.
- `frontend/src/features/reporting/ReportingScorecards.jsx` — remove Regional contribution sub-labels and render availability MoM with `%`.
- `frontend/src/features/reporting/reportingInsights.js` — convert API evidence into compact direction-aware card copy.
- `frontend/src/features/reporting/ReportingExecutiveInsights.jsx` — restrained positive/negative/neutral surfaces plus driver and recommendation rows.
- `frontend/src/features/reporting/ReportingPerformanceTrend.jsx` — approved desktop 70/30 chart composition, compact mobile toggle, and print rendering.
- `frontend/src/features/reporting/reportingPerformanceMetrics.js` — compute Kabupaten grand totals from additive/raw fields.
- `frontend/src/features/reporting/reportingTableState.js` — carry inline MoM fields into prioritized mobile metrics.
- `frontend/src/features/reporting/ReportingAreaTable.jsx` — inline MoM and a full-universe Kabupaten footer/card.
- `frontend/src/features/reporting/ReportingSiteDrilldown.jsx` — remove separate MoM columns and render API-provided site grand total.
- `frontend/src/index.css` — force both trend charts into print output without duplicating interactive controls.
- `frontend/src/__tests__/reportingInsights.test.js` — direction tone, driver, recommendation, contribution, and `%` copy.
- `frontend/src/__tests__/reportingPerformanceMetrics.test.js` — duration-weighted total and aggregate-MoM tests.
- `frontend/src/__tests__/reportingTableState.test.js` — mobile MoM propagation tests.
- `frontend/src/__tests__/dashboardReportingContracts.test.js` — compact layout, removed scorecard contribution, table columns, and print contracts.

---

### Task 1: Typed Insight Contracts and Pure Rule Engine

**Files:**

- Create: `backend/services/reporting_insights.py`
- Create: `backend/tests/test_reporting_insights.py`
- Modify: `backend/models/reporting.py:74-264`

**Interfaces:**

- Consumes: raw per-site current/previous revenue, payload, availability, and outage inputs from Task 2.
- Produces: `ReportingMetricDriver`, `metric_direction`, `select_additive_driver`, `select_availability_driver`, and `build_metric_recommendation` for the overview builder and frontend response.

- [ ] **Step 1: Write failing model and rule-engine tests**

Create `backend/tests/test_reporting_insights.py` with exact positive, negative, unavailable, nominal-ranking, and outage-ranking cases:

```python
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_additive_driver_uses_nominal_delta_not_extreme_percentage():
    from services.reporting_insights import select_additive_driver

    driver = select_additive_driver(
        [
            {"site_id": "BIG001", "site_name": "Big", "revenue": 150, "previous_revenue": 100},
            {"site_id": "TINY01", "site_name": "Tiny", "revenue": 2, "previous_revenue": 1},
        ],
        metric="revenue",
        aggregate_delta=51,
    )

    assert driver.site_id == "BIG001"
    assert driver.delta_value == 50
    assert driver.delta_pct == pytest.approx(50)
    assert driver.contribution_pct == pytest.approx(50 / 51 * 100)


def test_additive_driver_follows_negative_scope_direction():
    from services.reporting_insights import select_additive_driver

    driver = select_additive_driver(
        [
            {"site_id": "DOWN01", "payload": 60, "previous_payload": 100},
            {"site_id": "UP0001", "payload": 120, "previous_payload": 100},
        ],
        metric="payload",
        aggregate_delta=-20,
    )

    assert driver.site_id == "DOWN01"
    assert driver.delta_value == -40
    assert driver.contribution_pct == pytest.approx(200)


def test_availability_driver_ranks_same_direction_outage_impact():
    from services.reporting_insights import select_availability_driver

    driver = select_availability_driver(
        [
            {"site_id": "AAA001", "availability": 99.8, "previous_availability": 99.6, "outage_minutes": 2, "previous_outage_minutes": 4},
            {"site_id": "BBB001", "availability": 99.7, "previous_availability": 99.0, "outage_minutes": 1, "previous_outage_minutes": 10},
        ],
        aggregate_availability_delta=0.25,
        aggregate_outage_delta=-11,
    )

    assert driver.site_id == "BBB001"
    assert driver.delta_pct == pytest.approx(0.7)
    assert driver.outage_delta_minutes == pytest.approx(-9)
    assert driver.contribution_pct == pytest.approx(9 / 11 * 100)


def test_missing_comparison_has_no_direction_driver_or_false_recommendation():
    from services.reporting_insights import (
        build_metric_recommendation,
        metric_direction,
        select_additive_driver,
    )

    direction = metric_direction(None)
    assert direction == "unavailable"
    assert select_additive_driver([], metric="revenue", aggregate_delta=None) is None
    assert build_metric_recommendation(
        "revenue",
        direction=direction,
        driver=None,
        comparison_available=False,
    ) == "Lengkapi data periode pembanding sebelum menentukan prioritas site."
```

- [ ] **Step 2: Run the new unit tests and verify the missing module/fields fail**

Run:

```powershell
Set-Location backend
python -m pytest tests/test_reporting_insights.py -q
```

Expected: FAIL because `services.reporting_insights` and `ReportingMetricDriver` do not exist.

- [ ] **Step 3: Add backwards-compatible Pydantic response fields**

In `backend/models/reporting.py`, add the driver and total types, then extend existing models with nullable/defaulted fields so old cached/unit-test fixtures can still deserialize while cache versions are being changed:

```python
class ReportingMetricDriver(BaseModel):
    site_id: str
    site_name: str | None = None
    current_value: int | float | None = None
    previous_value: int | float | None = None
    delta_value: int | float | None = None
    delta_pct: float | None = None
    contribution_pct: float | None = None
    outage_delta_minutes: float | None = None


class ReportingMetricFact(BaseModel):
    value: int | float | None = None
    previous_value: int | float | None = None
    delta_pct: float | None = None
    contribution: ReportingContribution = Field(default_factory=ReportingContribution)
    severity: Literal["success", "warning", "info", "unavailable"] = "unavailable"
    driver: ReportingMetricDriver | None = None
    recommendation: str | None = None
```

Extend `RevenueTrendItem` with nullable `u30_sites`, `u60_sites`, and `achieved_sites`, plus integer `unavailable_sites`. Extend `ReportingAreaRow` and `ReportingSiteRow` with previous duration/outage inputs and `availability_delta_pct`. Add `ReportingSiteGrandTotal` with current/previous revenue, payload, duration/outage, derived availability, and all three MoM fields, then add `grand_total: ReportingSiteGrandTotal | None = None` to `ReportingSitePage`.

- [ ] **Step 4: Implement the pure driver and recommendation functions**

Create `backend/services/reporting_insights.py` with these public signatures:

```python
from collections.abc import Mapping
from typing import Literal

from models.reporting import ReportingMetricDriver

MetricDirection = Literal["positive", "negative", "stable", "unavailable"]


def metric_direction(delta: int | float | None) -> MetricDirection:
    if delta is None:
        return "unavailable"
    if float(delta) > 0:
        return "positive"
    if float(delta) < 0:
        return "negative"
    return "stable"


def select_additive_driver(
    rows: list[dict],
    *,
    metric: Literal["revenue", "payload"],
    aggregate_delta: int | float | None,
) -> ReportingMetricDriver | None:
    direction = metric_direction(aggregate_delta)
    if direction not in {"positive", "negative"}:
        return None
    previous_key = f"previous_{metric}"
    candidates = []
    for row in rows:
        if row.get(metric) is None and row.get(previous_key) is None:
            continue
        current = float(row.get(metric) or 0)
        previous = float(row.get(previous_key) or 0)
        delta = current - previous
        if (direction == "positive" and delta <= 0) or (direction == "negative" and delta >= 0):
            continue
        candidates.append((delta, row, current, previous))
    if not candidates:
        return None
    delta, row, current, previous = (
        max(candidates, key=lambda item: item[0])
        if direction == "positive"
        else min(candidates, key=lambda item: item[0])
    )
    return ReportingMetricDriver(
        site_id=str(row["site_id"]),
        site_name=row.get("site_name"),
        current_value=current,
        previous_value=previous,
        delta_value=delta,
        delta_pct=(delta / previous * 100.0) if previous else None,
        contribution_pct=abs(delta) / abs(float(aggregate_delta)) * 100.0,
    )


def select_availability_driver(
    rows: list[dict],
    *,
    aggregate_availability_delta: int | float | None,
    aggregate_outage_delta: int | float | None,
) -> ReportingMetricDriver | None:
    direction = metric_direction(aggregate_availability_delta)
    if direction not in {"positive", "negative"}:
        return None
    candidates = []
    for row in rows:
        current = row.get("availability")
        previous = row.get("previous_availability")
        current_outage = row.get("outage_minutes")
        previous_outage = row.get("previous_outage_minutes")
        if None in {current, previous, current_outage, previous_outage}:
            continue
        availability_delta = float(current) - float(previous)
        outage_delta = float(current_outage) - float(previous_outage)
        same_direction = outage_delta < 0 if direction == "positive" else outage_delta > 0
        if same_direction:
            candidates.append((outage_delta, availability_delta, row))
    if not candidates:
        return None
    outage_delta, availability_delta, row = (
        min(candidates, key=lambda item: item[0])
        if direction == "positive"
        else max(candidates, key=lambda item: item[0])
    )
    contribution = None
    aggregate_outage = float(aggregate_outage_delta) if aggregate_outage_delta is not None else 0.0
    aggregate_outage_matches = aggregate_outage < 0 if direction == "positive" else aggregate_outage > 0
    if aggregate_outage_matches:
        contribution = abs(outage_delta) / abs(aggregate_outage) * 100.0
    return ReportingMetricDriver(
        site_id=str(row["site_id"]),
        site_name=row.get("site_name"),
        current_value=float(row["availability"]),
        previous_value=float(row["previous_availability"]),
        delta_value=availability_delta,
        delta_pct=availability_delta,
        contribution_pct=contribution,
        outage_delta_minutes=outage_delta,
    )


def build_metric_recommendation(
    metric: Literal["revenue", "payload", "availability"],
    *,
    direction: MetricDirection,
    driver: ReportingMetricDriver | None,
    comparison_available: bool,
    evidence_complete: bool = True,
    target_status: str | None = None,
    related_directions: Mapping[str, MetricDirection] | None = None,
    risk_site_delta: int | None = None,
) -> str | None:
    related = related_directions or {}
    site_id = driver.site_id if driver else None
    if not evidence_complete:
        return "Lengkapi sumber data atau konfigurasi yang belum tersedia sebelum menentukan prioritas site."
    if not comparison_available:
        return "Lengkapi data periode pembanding sebelum menentukan prioritas site."
    if metric == "availability" and direction == "negative" and site_id:
        return f"Prioritaskan {site_id}; periksa histori outage, tiket aktif, backup power, dan kondisi transport."
    if metric == "availability" and direction == "positive" and target_status == "not_achieved":
        return "Pertahankan perbaikan dan lanjutkan remediasi pada site yang masih di bawah target Site Class."
    if metric == "revenue" and risk_site_delta is not None and risk_site_delta > 0:
        return "Prioritaskan site yang baru masuk U30/U60 dan driver penurunan revenue terbesar."
    if metric == "revenue" and direction == "negative" and related.get("availability") == "negative" and site_id:
        return f"Korelasikan {site_id} dengan histori outage dan tiket sebelum menentukan tindakan korektif."
    if metric == "revenue" and direction == "negative" and related.get("payload") in {"positive", "stable"} and site_id:
        return f"Tinjau revenue per traffic dan service mix di {site_id}; jangan simpulkan gangguan jaringan tanpa bukti pendukung."
    if metric == "payload" and direction == "positive" and related.get("revenue") == "negative" and site_id:
        return f"Tinjau revenue per traffic dan service mix di {site_id}."
    if direction == "negative" and site_id:
        return f"Validasi perubahan di {site_id} dan korelasikan dengan histori performa serta tiket."
    if direction in {"positive", "stable"} and target_status == "achieved" and site_id:
        return f"Pertahankan pola operasi dan monitor {site_id} untuk mencegah regresi."
    return None
```

Keep the implementation aligned with these approved rules:

- additive drivers filter to the aggregate sign and rank by signed nominal delta;
- a zero previous denominator leaves `delta_pct=None` without excluding a valid nominal driver;
- availability drivers require both availability values and rank outage reduction for improvement or outage increase for decline;
- contribution uses absolute same-direction site change divided by absolute aggregate change;
- recommendations follow the priority order in the spec and include the driver site ID only when a driver exists;
- stable conditions return a sustain/monitor message only when target evidence exists; otherwise return `None`.

- [ ] **Step 5: Run the focused tests and all existing overview model tests**

Run:

```powershell
Set-Location backend
python -m pytest tests/test_reporting_insights.py tests/test_reporting_overview.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit the typed rule engine**

```powershell
git add backend/models/reporting.py backend/services/reporting_insights.py backend/tests/test_reporting_insights.py
git commit -m "feat(reporting): add deterministic insight driver rules"
```

---

### Task 2: Overview Drivers and Effective-Month U30/U60 Facts

**Files:**

- Modify: `backend/services/reporting_overview.py:28-219,494-787`
- Modify: `backend/routers/reporting.py:492-529`
- Modify: `backend/tests/test_reporting_overview.py`
- Modify: `backend/tests/test_reporting_redis_cache.py:111-116`

**Interfaces:**

- Consumes: Task 1 driver/recommendation helpers and existing `MonthPeriod` ranges.
- Produces: populated `overview.{revenue,payload,availability}.driver`, `.recommendation`, and trend `u30_sites/u60_sites/achieved_sites/unavailable_sites` fields for Tasks 5 and 6.

- [ ] **Step 1: Extend overview tests with driver and band-count expectations**

Update `FakeOverviewSession` to recognize `reporting_site_driver_candidates` and return two current/previous site rows. Extend the trend fixture with exact counts:

```python
{"trx_month": "2026-07", "total_revenue": 300, "total_payload": 30,
 "total_traffic": 12, "avg_availability": 98.5,
 "u30_sites": 1, "u60_sites": 1, "achieved_sites": 0, "unavailable_sites": 0}
```

Add assertions:

```python
assert overview.revenue.driver.site_id == "AAA001"
assert overview.revenue.driver.delta_value == 40
assert overview.payload.driver.site_id == "AAA001"
assert overview.availability.driver.site_id == "BBB001"
assert overview.revenue.recommendation
assert overview.trend[0].u30_sites == 1
assert overview.trend[0].u60_sites == 1
```

Add SQL-shape assertions proving `TREND_QUERY` resolves `u30_upper` and `u60_upper` with `effective_month <= trx_month`, retains `unavailable_sites`, and never uses a single snapshot threshold for all history.

- [ ] **Step 2: Run the overview tests and verify the new response fields fail**

Run:

```powershell
Set-Location backend
python -m pytest tests/test_reporting_overview.py tests/test_reporting_redis_cache.py -q
```

Expected: FAIL because overview does not execute the driver query, trend counts are absent, and the cache assertion still expects `overview-v4`.

- [ ] **Step 3: Add one scoped site-driver query**

Add `SITE_DRIVER_CANDIDATES_QUERY` to `backend/services/reporting_overview.py`. Use `FULL OUTER JOIN` across active and comparison performance/availability per site, join latest master identity, and return these aliases exactly:

```sql
/* reporting_site_driver_candidates */
SELECT
    COALESCE(active.site_key, previous.site_key) AS site_key,
    COALESCE(master.site_id, active.site_key, previous.site_key) AS site_id,
    master.site_name,
    active.revenue,
    previous.previous_revenue,
    active.payload,
    previous.previous_payload,
    active.total_time_minutes,
    active.outage_minutes,
    previous.previous_total_time_minutes,
    previous.previous_outage_minutes,
    CASE WHEN active.total_time_minutes > 0 THEN
        100.0 * (active.total_time_minutes - active.outage_minutes) / active.total_time_minutes
    END::double precision AS availability,
    CASE WHEN previous.previous_total_time_minutes > 0 THEN
        100.0 * (previous.previous_total_time_minutes - previous.previous_outage_minutes)
        / previous.previous_total_time_minutes
    END::double precision AS previous_availability
FROM active
FULL OUTER JOIN previous ON previous.site_key = active.site_key
LEFT JOIN master ON master.site_key = COALESCE(active.site_key, previous.site_key)
WHERE CAST(:nop_key AS text) IS NULL OR master.nop_key = :nop_key
```

Set `availability_start=period.comparison_start` and `availability_end=period.period_end` for this query so both periods are in `AVAILABILITY_FACTS_CTES`.

- [ ] **Step 4: Extend the monthly trend query with historical threshold classification**

Build a `context_months` calendar with `GENERATE_SERIES(:context_start, :period_end)` and a selected-scope `context_sites` universe from sites observed anywhere in that range. Cross join them into `site_months`, left join monthly performance, and use `SUM(t.rev)` without `COALESCE` at site-month level so an absent/null revenue remains unavailable instead of becoming U30. Keep final chart totals backwards-compatible with `COALESCE(SUM(revenue), 0)`. Add monthly lateral threshold resolution and a `classified` CTE. The final aliases must behave as follows:

```sql
CASE WHEN MAX(revenue_u30_upper) IS NULL OR MAX(revenue_u60_upper) IS NULL
     THEN NULL
     ELSE COUNT(*) FILTER (WHERE revenue IS NOT NULL AND revenue < revenue_u30_upper)
END::bigint AS u30_sites,
CASE WHEN MAX(revenue_u30_upper) IS NULL OR MAX(revenue_u60_upper) IS NULL
     THEN NULL
     ELSE COUNT(*) FILTER (
         WHERE revenue IS NOT NULL
           AND revenue >= revenue_u30_upper
           AND revenue < revenue_u60_upper
     )
END::bigint AS u60_sites,
CASE WHEN MAX(revenue_u60_upper) IS NULL
     THEN NULL
     ELSE COUNT(*) FILTER (WHERE revenue IS NOT NULL AND revenue >= revenue_u60_upper)
END::bigint AS achieved_sites,
COUNT(*) FILTER (
    WHERE revenue IS NULL OR revenue_u30_upper IS NULL OR revenue_u60_upper IS NULL
)::bigint AS unavailable_sites
```

Resolve each threshold with `effective_month <= site_month.trx_month ORDER BY effective_month DESC, updated_at DESC LIMIT 1`. Do not reuse the current-period `ReportingThresholdSnapshot` for historical months.

- [ ] **Step 5: Wire drivers and recommendations into `build_reporting_overview`**

Add `driver_rows: list[dict] | None = None` to the builder. Derive aggregate nominal changes, select all three drivers, derive `MetricDirection` values, and populate each fact:

```python
revenue_delta = selected_revenue - previous_revenue
payload_delta = selected_payload - previous_payload
availability_delta = (
    selected_availability - previous_availability
    if selected_availability is not None and previous_availability is not None
    else None
)
aggregate_outage_delta = (
    _number(selected, "outage_minutes") - _number(previous, "outage_minutes")
)
```

Pass `comparison_available=False` when the percentage denominator is zero/missing for revenue/payload or either availability value is missing. Derive `evidence_complete` per metric from the relevant coverage rows: Performance plus Revenue Target/Performance Threshold for revenue, Performance plus Performance Threshold for payload, and Availability plus Site Master/Performance Threshold for availability. Use the latest two classifiable trend months to calculate `risk_site_delta` from `u30_sites + u60_sites`; leave it `None` if either month is unavailable.

- [ ] **Step 6: Load the candidates once and bump the overview cache schema**

In `load_reporting_overview`, execute `SITE_DRIVER_CANDIDATES_QUERY` once with the selected scope, pass the rows into the builder, and keep the existing threshold-version cache dependency. Change the route cache resource from `overview-v4` to `overview-v5` and update its cache unit assertion.

- [ ] **Step 7: Run focused backend tests**

Run:

```powershell
Set-Location backend
python -m pytest tests/test_reporting_insights.py tests/test_reporting_overview.py tests/test_reporting_routes.py tests/test_reporting_redis_cache.py -q
```

Expected: PASS.

- [ ] **Step 8: Commit overview evidence and trend facts**

```powershell
git add backend/services/reporting_overview.py backend/routers/reporting.py backend/tests/test_reporting_overview.py backend/tests/test_reporting_redis_cache.py
git commit -m "feat(reporting): expose insight drivers and revenue bands"
```

---

### Task 3: Kabupaten Comparison Inputs and Trustworthy Grand Total

**Files:**

- Modify: `backend/services/reporting_overview.py:350-491,788-850`
- Modify: `backend/routers/reporting.py:532-562`
- Modify: `backend/tests/test_reporting_overview.py`
- Modify: `backend/tests/test_reporting_redis_cache.py`
- Modify: `frontend/src/features/reporting/reportingPerformanceMetrics.js`
- Modify: `frontend/src/__tests__/reportingPerformanceMetrics.test.js`

**Interfaces:**

- Consumes: complete, non-paginated area rows from `/reporting/areas`.
- Produces: per-area availability MoM inputs and `buildAreaGrandTotal(rows)` for Task 7.

- [ ] **Step 1: Write failing area comparison and total tests**

Extend the `FakeAreaSession` rows with current and previous duration/outage and previous revenue/payload. Assert the loader returns exact area `availability_delta_pct` values.

Replace the old site-count-weighted frontend availability test with a duration-weighted test:

```javascript
import { buildAreaGrandTotal } from '../features/reporting/reportingPerformanceMetrics.js';

const total = buildAreaGrandTotal([
  {
    total_sites: 2,
    revenue: 300,
    previous_revenue: 250,
    payload: 30,
    previous_payload: 25,
    total_time_minutes: 2_000,
    outage_minutes: 30,
    previous_total_time_minutes: 2_000,
    previous_outage_minutes: 20,
    ticket_swfm_bps: 10,
    backup_sukses_bps: 5,
  },
  {
    total_sites: 1,
    revenue: 100,
    previous_revenue: 80,
    payload: 10,
    previous_payload: 8,
    total_time_minutes: 1_000,
    outage_minutes: 30,
    previous_total_time_minutes: 1_000,
    previous_outage_minutes: 20,
    ticket_swfm_bps: 30,
    backup_sukses_bps: 3,
  },
]);

assert.equal(total.revenue, 400);
assert.equal(total.revenue_delta_pct, (400 - 330) / 330 * 100);
assert.equal(total.avg_availability, 98);
assert.equal(total.previous_avg_availability, 98.66666666666667);
assert.equal(total.availability_delta_pct, 98 - 98.66666666666667);
assert.equal(total.backup_sukses_rate, 20);
```

- [ ] **Step 2: Run the focused backend/frontend tests and verify failure**

Run:

```powershell
Set-Location backend
python -m pytest tests/test_reporting_overview.py -q
Set-Location ..\frontend
node --test src/__tests__/reportingPerformanceMetrics.test.js
```

Expected: FAIL because previous availability inputs and `buildAreaGrandTotal` are absent.

- [ ] **Step 3: Extend the area SQL without averaging percentages**

Set the area query availability window to `comparison_start..period_end`. Split it into active and previous availability aggregates and include these aliases in the final row:

```sql
previous.revenue AS previous_revenue,
previous.payload AS previous_payload,
COALESCE(previous.previous_total_time_minutes, 0)::double precision AS previous_total_time_minutes,
COALESCE(previous.previous_outage_minutes, 0)::double precision AS previous_outage_minutes
```

Update `load_reporting_areas` to populate all raw inputs and calculate `availability_delta_pct` only when both weighted values exist. Keep a zero comparison revenue/payload denominator as `None` through `_delta_pct`.

- [ ] **Step 4: Implement the pure Kabupaten total helper**

Replace `buildRevenueTotals` with `buildAreaGrandTotal`. Sum current/previous additive fields, recompute backup rate from summed counts, and use this helper for weighted availability:

```javascript
function weightedAvailability(totalMinutes, outageMinutes) {
  const total = Number(totalMinutes);
  if (!Number.isFinite(total) || total <= 0) return null;
  return ((total - Number(outageMinutes || 0)) / total) * 100;
}

function relativeChange(current, previous) {
  const before = Number(previous);
  if (!Number.isFinite(before) || before === 0) return null;
  return ((Number(current) - before) / before) * 100;
}
```

The returned object must expose `revenue_delta_pct`, `payload_delta_pct`, `avg_availability`, `previous_avg_availability`, and `availability_delta_pct` for the shared table renderer.

- [ ] **Step 5: Bump the area cache schema and run focused tests**

Change `areas-v3` to `areas-v4`, add the cache assertion, then run:

```powershell
Set-Location backend
python -m pytest tests/test_reporting_overview.py tests/test_reporting_redis_cache.py -q
Set-Location ..\frontend
node --test src/__tests__/reportingPerformanceMetrics.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Kabupaten comparison facts**

```powershell
git add backend/services/reporting_overview.py backend/routers/reporting.py backend/tests/test_reporting_overview.py backend/tests/test_reporting_redis_cache.py frontend/src/features/reporting/reportingPerformanceMetrics.js frontend/src/__tests__/reportingPerformanceMetrics.test.js
git commit -m "feat(reporting): add weighted area comparison totals"
```

---

### Task 4: Site Availability MoM and Full Filtered Grand Total

**Files:**

- Modify: `backend/services/reporting_drilldown.py:46-425`
- Modify: `backend/routers/reporting.py:565-630`
- Modify: `backend/tests/test_reporting_drilldown.py`
- Modify: `backend/tests/test_reporting_redis_cache.py`

**Interfaces:**

- Consumes: existing semantic filters in the `filtered` CTE.
- Produces: site-row `availability_delta_pct` and `ReportingSitePage.grand_total` calculated before ordering/rank/pagination for Task 7.

- [ ] **Step 1: Write failing site total and comparison tests**

Extend `FakeSiteSession` so the row result contains previous duration/outage and the facet result contains aggregate fields. Add assertions:

```python
assert result.items[0].availability_delta_pct == pytest.approx(-1.0)
assert result.grand_total.total_sites == 1
assert result.grand_total.revenue == 100
assert result.grand_total.revenue_mom_pct == pytest.approx(25)
assert result.grand_total.avg_availability == pytest.approx(97)
assert result.grand_total.previous_avg_availability == pytest.approx(98)
assert result.grand_total.availability_delta_pct == pytest.approx(-1)
```

Add a SQL-shape test asserting `reporting_site_facets` aggregates from `filtered` and is not followed by `LIMIT`, `OFFSET`, or `ORDER BY`.

- [ ] **Step 2: Run drill-down tests and verify failure**

Run:

```powershell
Set-Location backend
python -m pytest tests/test_reporting_drilldown.py tests/test_reporting_redis_cache.py -q
```

Expected: FAIL because previous availability and the grand-total object are absent.

- [ ] **Step 3: Carry comparison availability through the full CTE chain**

Set drill-down availability extraction to `comparison_start..period_end`. Add `previous_availability`, then retain `previous_total_time_minutes` and `previous_outage_minutes` through `site_facts` and `filtered`. Do not omit these columns from an intermediate CTE.

Calculate row availability values with `weighted_availability` in Python and set:

```python
availability_delta_pct=(
    availability - previous_availability
    if availability is not None and previous_availability is not None
    else None
)
```

- [ ] **Step 4: Aggregate the site grand total in the facet query**

Extend `reporting_site_facets` to return these raw totals from `filtered`:

```sql
COUNT(*)::bigint AS total_sites,
COALESCE(SUM(revenue), 0)::bigint AS revenue,
COALESCE(SUM(previous_revenue), 0)::bigint AS previous_revenue,
COALESCE(SUM(payload), 0)::bigint AS payload,
COALESCE(SUM(previous_payload), 0)::bigint AS previous_payload,
COALESCE(SUM(total_time_minutes), 0)::double precision AS total_time_minutes,
COALESCE(SUM(outage_minutes), 0)::double precision AS outage_minutes,
COALESCE(SUM(previous_total_time_minutes), 0)::double precision AS previous_total_time_minutes,
COALESCE(SUM(previous_outage_minutes), 0)::double precision AS previous_outage_minutes
```

Build `ReportingSiteGrandTotal` from the facet row. Continue limiting the displayed `total` for Top/Bottom mode, but never limit `grand_total.total_sites` or its metrics.

- [ ] **Step 5: Bump the drill-down cache schema and run focused tests**

Change `site-drilldown-v2` to `site-drilldown-v3`, update the cache assertion, then run:

```powershell
Set-Location backend
python -m pytest tests/test_reporting_drilldown.py tests/test_reporting_routes.py tests/test_reporting_redis_cache.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit the site total contract**

```powershell
git add backend/services/reporting_drilldown.py backend/routers/reporting.py backend/tests/test_reporting_drilldown.py backend/tests/test_reporting_redis_cache.py
git commit -m "feat(reporting): add full filtered site totals"
```

---

### Task 5: Scorecards and Direction-Aware Executive Insight

**Files:**

- Modify: `frontend/src/features/reporting/ReportingScorecards.jsx`
- Modify: `frontend/src/features/reporting/reportingInsights.js`
- Modify: `frontend/src/features/reporting/ReportingExecutiveInsights.jsx`
- Modify: `frontend/src/__tests__/reportingInsights.test.js`
- Modify: `frontend/src/__tests__/dashboardReportingContracts.test.js`

**Interfaces:**

- Consumes: Task 2 overview `driver`, `recommendation`, contribution, target, and signed delta fields.
- Produces: compact presentation objects with `tone`, `driver`, `contribution`, and `recommendation` strings.

- [ ] **Step 1: Rewrite the insight tests around approved copy and direction**

Use a selected-NOP fixture containing drivers and recommendations. Assert:

```javascript
assert.equal(cards[0].tone, 'positive');
assert.match(cards[0].driver, /AAA001/);
assert.match(cards[0].driver, /\+Rp/);
assert.match(cards[0].contribution, /Kontribusi NOP SIDOARJO/);
assert.equal(cards[0].recommendation, 'Pertahankan pola operasi dan monitor AAA001 untuk mencegah regresi.');

assert.equal(cards[1].tone, 'negative');
assert.match(cards[1].summary, /-0,50%/);
assert.doesNotMatch(cards[1].summary + cards[1].contribution, /\bpp\b/i);
assert.match(cards[1].driver, /outage \+10 menit/);
```

Update the source contract test so `ReportingScorecards.jsx` must not contain `metricContribution`, `availabilityContribution`, `Kontribusi NOP`, or `difference_pp`, while `reportingInsights.js` must still contain the selected-NOP contribution copy.

- [ ] **Step 2: Run frontend tests and verify the old severity/copy fail**

Run:

```powershell
Set-Location frontend
node --test src/__tests__/reportingInsights.test.js src/__tests__/dashboardReportingContracts.test.js
```

Expected: FAIL because scorecards still show contribution, availability uses `pp`, and card tone follows severity.

- [ ] **Step 3: Remove contribution content from top scorecards**

Delete `contributionPercent`, `normalizedScope`, `metricContribution`, and `availabilityContribution` from `ReportingScorecards.jsx`. Remove the `contribution` prop/paragraph from `Scorecard`. Keep Total Site detail and Revenue/Payload YTD. Render availability MoM with:

```jsx
delta={{
  value: availability.delta_pct,
  label: `${formatSigned(availability.delta_pct, 2, '%')} ${comparisonLabel}`,
}}
```

Do not add filler text to replace the removed line.

- [ ] **Step 4: Build direction-aware insight presentation**

In `reportingInsights.js`, derive tone from the signed delta, not `severity`:

```javascript
function directionTone(value) {
  if (value == null) return 'unavailable';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'unavailable';
  if (number > 0) return 'positive';
  if (number < 0) return 'negative';
  return 'neutral';
}
```

Format drivers with nominal evidence:

- revenue: site ID, signed `formatRevenue(delta_value)`, site MoM, and driver contribution;
- payload: site ID, signed `formatPayload(delta_value)`, site MoM, and driver contribution;
- availability: site ID, signed two-decimal `%`, and signed outage minutes.

Keep target text in `detail`. Keep selected-NOP contribution in `contribution`. Copy backend `recommendation` directly without adding an AI/generated label.

- [ ] **Step 5: Apply restrained insight surfaces**

Replace `TONES` with these tokenized classes:

```javascript
const TONES = {
  positive: 'border-emerald-500/25 bg-emerald-500/[0.055] text-emerald-400',
  negative: 'border-rose-500/25 bg-rose-500/[0.055] text-rose-400',
  neutral: 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)]',
  unavailable: 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-muted)]',
};
```

Render content in this order: label/title, main summary, target detail, driver evidence, Regional contribution, recommendation. Give the recommendation a subtle top border and `line-clamp-2`; do not use glow, gradient, or pulse classes.

- [ ] **Step 6: Run focused frontend tests**

Run:

```powershell
Set-Location frontend
node --test src/__tests__/reportingInsights.test.js src/__tests__/dashboardReportingContracts.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit the scorecard and insight revision**

```powershell
git add frontend/src/features/reporting/ReportingScorecards.jsx frontend/src/features/reporting/reportingInsights.js frontend/src/features/reporting/ReportingExecutiveInsights.jsx frontend/src/__tests__/reportingInsights.test.js frontend/src/__tests__/dashboardReportingContracts.test.js
git commit -m "feat(reporting): show direction based executive insights"
```

---

### Task 6: Compact 70/30 U30 and U60 Trend

**Files:**

- Create: `frontend/src/features/reporting/reportingTrendState.js`
- Create: `frontend/src/__tests__/reportingTrendState.test.js`
- Modify: `frontend/src/features/reporting/ReportingPerformanceTrend.jsx`
- Modify: `frontend/src/index.css:626-683`
- Modify: `frontend/src/__tests__/dashboardReportingContracts.test.js`

**Interfaces:**

- Consumes: Task 2 trend count fields.
- Produces: desktop 70/30 performance/risk charts, mobile segmented state, tooltip at-risk delta, and two-chart print layout.

- [ ] **Step 1: Write failing pure trend and source-contract tests**

Create the trend-state test:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { enrichRevenueBandTrend } from '../features/reporting/reportingTrendState.js';

describe('Reporting U30 and U60 trend state', () => {
  it('computes at-risk totals and deltas from the preceding displayed month', () => {
    const rows = enrichRevenueBandTrend([
      { trx_month: '2026-06', u30_sites: 2, u60_sites: 3 },
      { trx_month: '2026-07', u30_sites: 4, u60_sites: 2 },
    ]);
    assert.deepEqual(rows.map((row) => [row.at_risk_sites, row.at_risk_delta]), [[5, null], [6, 1]]);
  });

  it('keeps a threshold-missing month unavailable instead of zero', () => {
    const [row] = enrichRevenueBandTrend([{ trx_month: '2026-07', u30_sites: null, u60_sites: null }]);
    assert.equal(row.at_risk_sites, null);
    assert.equal(row.at_risk_delta, null);
  });
});
```

Add source assertions for `Bar`, `stackId="risk"`, `Performance | U30 & U60` control labels, desktop grid classes, and print-specific classes.

- [ ] **Step 2: Run the trend tests and verify failure**

Run:

```powershell
Set-Location frontend
node --test src/__tests__/reportingTrendState.test.js src/__tests__/dashboardReportingContracts.test.js
```

Expected: FAIL because the helper and stacked chart do not exist.

- [ ] **Step 3: Implement pure trend enrichment**

Create `enrichRevenueBandTrend(rows)` as a non-mutating mapper. Calculate `at_risk_sites` only when both bands are finite. Calculate `at_risk_delta` only when both the current and immediately preceding displayed month totals are finite.

- [ ] **Step 4: Split the chart component into focused internal views**

Inside `ReportingPerformanceTrend.jsx`, keep the public props unchanged. Move the existing `ResponsiveContainer` and smooth `ComposedChart` body into `PerformanceChart({ rows, selectedPeriod, themeTokens })`. Add `RevenueBandChart({ rows, themeTokens })` for the stacked bars and `RevenueBandTooltip({ active, payload, label })` for U30, U60, at-risk total, and previous-month delta.

Use `Bar` with `stackId="risk"`, muted rose for `u30_sites`, muted amber for `u60_sites`, radius only on the upper U60 segment, and `isAnimationActive={false}`. If every row has unavailable band counts, show `Threshold revenue belum tersedia untuk periode trend.` inside the risk region.

- [ ] **Step 5: Implement the approved responsive composition**

Desktop and print:

```jsx
<div className="reporting-trend-desktop hidden gap-4 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(260px,3fr)]">
  <PerformanceChart rows={rows} selectedPeriod={selectedPeriod} themeTokens={themeTokens} />
  <RevenueBandChart rows={trendRows} themeTokens={themeTokens} />
</div>
```

Below `lg`, use local state with a two-button segmented control labelled `Performance` and `U30 & U60`, then render one full-width 250px chart. The entire feature remains inside the existing `DashboardChartPanel`; do not create another full-width panel.

- [ ] **Step 6: Make print always include both charts**

Add print rules:

```css
@media print {
  .reporting-trend-desktop {
    display: grid !important;
    grid-template-columns: minmax(0, 7fr) minmax(0, 3fr) !important;
  }

  .reporting-trend-mobile {
    display: none !important;
  }
}
```

- [ ] **Step 7: Run focused frontend tests**

Run:

```powershell
Set-Location frontend
node --test src/__tests__/reportingTrendState.test.js src/__tests__/dashboardReportingContracts.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit the compact risk trend**

```powershell
git add frontend/src/features/reporting/reportingTrendState.js frontend/src/features/reporting/ReportingPerformanceTrend.jsx frontend/src/index.css frontend/src/__tests__/reportingTrendState.test.js frontend/src/__tests__/dashboardReportingContracts.test.js
git commit -m "feat(reporting): add compact U30 and U60 trend"
```

---

### Task 7: Inline MoM and Grand Totals in Kabupaten and Site Views

**Files:**

- Create: `frontend/src/features/reporting/ReportingMetricValue.jsx`
- Modify: `frontend/src/features/reporting/reportingTableState.js`
- Modify: `frontend/src/features/reporting/ReportingAreaTable.jsx`
- Modify: `frontend/src/features/reporting/ReportingSiteDrilldown.jsx`
- Modify: `frontend/src/__tests__/reportingTableState.test.js`
- Modify: `frontend/src/__tests__/dashboardReportingContracts.test.js`

**Interfaces:**

- Consumes: Task 3 complete area rows/total helper and Task 4 site row/grand-total response.
- Produces: one consistent value+MoM treatment across desktop, mobile, and total rows.

- [ ] **Step 1: Add failing mobile and source-contract tests**

Extend `toAreaMobileMetric` expectations:

```javascript
assert.deepEqual(mobile.revenue, { value: 200, delta: -4.5 });
assert.deepEqual(mobile.payload, { value: 20, delta: 2.5 });
assert.deepEqual(mobile.availability, { value: 98, delta: -0.03 });
```

Update component source tests to require `ReportingMetricValue`, `<tfoot>`, `grand_total`, and availability MoM. Assert the site table no longer contains `SortHeader field="revenue_mom"`, `SortHeader field="payload_mom"`, `label="Revenue MoM"`, or `label="Payload MoM"`. Keep all remaining headers sortable.

- [ ] **Step 2: Run table tests and verify failure**

Run:

```powershell
Set-Location frontend
node --test src/__tests__/reportingTableState.test.js src/__tests__/dashboardReportingContracts.test.js
```

Expected: FAIL because the shared metric renderer and grand totals are absent.

- [ ] **Step 3: Create the shared metric value renderer**

Implement a small component with explicit formatting props:

```jsx
export default function ReportingMetricValue({ value, delta, formatValue, digits = 1, valueClassName = '' }) {
  const number = delta == null ? Number.NaN : Number(delta);
  const available = Number.isFinite(number);
  const tone = !available || number === 0
    ? 'text-[var(--text-muted)]'
    : number > 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]';
  const sign = available && number > 0 ? '+' : '';

  return (
    <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5 gap-y-0.5">
      <strong className={`font-mono tabular-nums ${valueClassName}`}>{formatValue(value)}</strong>
      <small className={`font-mono text-[10px] tabular-nums ${tone}`}>
        {available ? `${sign}${number.toFixed(digits).replace('.', ',')}%` : '-'}
      </small>
    </span>
  );
}
```

Use `digits={2}` for availability. The `%` suffix is mandatory for availability; do not pass `pp`.

- [ ] **Step 4: Render Kabupaten inline MoM and the full-row grand total**

In `ReportingAreaTable`, calculate `grandTotal = !loading && !error ? buildAreaGrandTotal(rows) : null` before applying `rankAndSortAreas`. Use `ReportingMetricValue` in Revenue, Payload, and Availability cells and mobile cards.

Add a desktop `<tfoot>` after `<tbody>` with a non-clickable `Grand Total` row and the same eight columns. Add a neutral mobile `Grand Total` card after all visible area cards. Both totals must use the complete `rows`, never `visibleRows`.

- [ ] **Step 5: Render site inline MoM and the backend grand total**

In `ReportingSiteDrilldown`:

- use `ReportingMetricValue` in desktop and mobile Revenue, Payload, and Availability;
- delete separate Revenue MoM and Payload MoM cells/headers;
- keep header sorting on `revenue`, `payload`, and `availability`;
- add a `<tfoot>` using `result.grand_total` and a mobile total card;
- clear `result` when the current request fails so a stale total cannot appear beneath the error;
- hide the total while loading, on error, or when the response has no items.

- [ ] **Step 6: Run focused frontend tests**

Run:

```powershell
Set-Location frontend
node --test src/__tests__/reportingTableState.test.js src/__tests__/reportingPerformanceMetrics.test.js src/__tests__/dashboardReportingContracts.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit inline analysis and totals**

```powershell
git add frontend/src/features/reporting/ReportingMetricValue.jsx frontend/src/features/reporting/reportingTableState.js frontend/src/features/reporting/ReportingAreaTable.jsx frontend/src/features/reporting/ReportingSiteDrilldown.jsx frontend/src/__tests__/reportingTableState.test.js frontend/src/__tests__/dashboardReportingContracts.test.js
git commit -m "feat(reporting): add inline MoM and grand totals"
```

---

### Task 8: PostgreSQL Numeric Proof and End-to-End Verification

**Files:**

- Modify: `backend/tests/integration/test_reporting_numeric.py`
- Modify only if verification exposes a defect: files already listed in Tasks 1-7

**Interfaces:**

- Consumes: every API/UI change from Tasks 1-7.
- Produces: numeric proof for boundaries/history/pagination and a review-ready branch with an updated code graph.

- [ ] **Step 1: Add exact threshold-boundary and historical-version integration data**

Add four sites/month rows with revenues `29_999_999`, `30_000_000`, `59_999_999`, and `60_000_000`. Add a second threshold version effective `2026-07` with different U30/U60 bounds, then query a trend spanning one month before and one month after the change.

Assert exact band counts per month and `unavailable_sites` when a required threshold version is removed. Do not assert only SQL strings; call `load_reporting_overview` against PostgreSQL.

- [ ] **Step 2: Add numeric driver and weighted-total assertions**

Seed one tiny-baseline/high-percentage site and one large-nominal-change site. Assert the large nominal site is the Revenue/Payload driver. Seed opposite-direction outage changes and assert the Availability driver follows the aggregate direction.

For site pagination, request page 1 and page 2 with different sort directions and assert:

```python
assert page_one.grand_total == page_two.grand_total
assert page_one.grand_total.total_sites > len(page_one.items)
assert page_one.grand_total.avg_availability == pytest.approx(
    100 * (page_one.grand_total.total_time_minutes - page_one.grand_total.outage_minutes)
    / page_one.grand_total.total_time_minutes
)
```

Then change `site_class`, `target_status`, and search filters independently and assert the grand total changes with each semantic filter.

- [ ] **Step 3: Run all local focused tests**

Run:

```powershell
Set-Location backend
python -m pytest tests/test_reporting_insights.py tests/test_reporting_overview.py tests/test_reporting_drilldown.py tests/test_reporting_routes.py tests/test_reporting_redis_cache.py -q
Set-Location ..\frontend
node --test src/__tests__/reportingInsights.test.js src/__tests__/reportingPerformanceMetrics.test.js src/__tests__/reportingTableState.test.js src/__tests__/reportingTrendState.test.js src/__tests__/dashboardReportingContracts.test.js
```

Expected: PASS.

- [ ] **Step 4: Run the complete local backend and frontend suites**

Run:

```powershell
Set-Location backend
python -m pytest tests -q
Set-Location ..\frontend
node --test --test-reporter=dot src/__tests__/*.test.js
npm run lint
npm run audit:production
npm run build
```

Expected: all available local tests pass; PostgreSQL-gated tests may report skipped locally when `RUN_REPORTING_DB_TESTS` is not enabled.

- [ ] **Step 5: Perform responsive and print browser QA**

Start the existing backend/frontend development processes with process-only development settings. Verify with a real browser:

1. Desktop selected NOP: no contribution on top scorecards; contributions remain in Executive Insight.
2. Positive and negative months: insight surface and driver direction match the API facts.
3. Desktop trend: one panel, approximately 70/30 widths, smooth Performance chart left, stacked U30/U60 right.
4. Tablet/mobile: segmented control switches charts without lengthening the panel; metric cards show inline MoM.
5. Kabupaten Top/Bottom and header sorting: displayed rows change but Grand Total does not.
6. Site pagination, sorting, Top/Bottom: displayed rows change but Grand Total remains the full semantic filter total.
7. Site Class, Target Achieved, and search filters: Grand Total changes with the semantic universe.
8. Print/PDF preview: both trend charts appear; controls and side sheet do not print.
9. Loading/error simulation: no stale grand total remains visible.

Capture screenshots for desktop, mobile, and print review artifacts.

- [ ] **Step 6: Refresh Graphify after material code changes**

Run from the worktree root:

```powershell
graphify update .
git status --short
```

Expected: Graphify reports an updated graph. Do not stage `.graphify/` or generated local graph output.

- [ ] **Step 7: Commit PostgreSQL integration coverage and any verified fixes**

```powershell
git add backend/tests/integration/test_reporting_numeric.py
git commit -m "test(reporting): verify trends drivers and filtered totals"
```

If browser or full-suite verification required source fixes, stage only the relevant Reporting files and include them in this commit with the integration test that proves the correction.

- [ ] **Step 8: Push the feature branch and validate PostgreSQL CI**

Run:

```powershell
git push -u origin codex/reporting-insight-drivers
gh pr create --base main --head codex/reporting-insight-drivers --title "Improve Reporting insights and U30/U60 analysis" --body-file docs/superpowers/specs/2026-09-02-reporting-insight-drivers-u30-u60-design.md
gh pr checks --watch
```

Expected: GitHub `verify` passes with `RUN_REPORTING_DB_TESTS=1`, including PostgreSQL numeric integration, frontend Node tests, lint, production audit, and production build. Treat any external deployment/publish check separately from verification.
