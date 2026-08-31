# Network Reporting P0 + P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one compact Network Reporting implementation with trustworthy Regional/NOP totals, configured targets, source freshness, concise Regional contribution insights, Kabupaten-to-site drill-down, mobile prioritization, and a safe dynamic pivot table.

**Architecture:** Introduce a canonical normalized site-month foundation and focused Reporting services behind new overview, area, drill-down, and pivot contracts. Keep legacy endpoints for compatibility while refactoring the Network Reporting frontend into feature modules that consume the new contracts independently.

**Tech Stack:** FastAPI, SQLAlchemy async, PostgreSQL/Neon, Redis cache, Pydantic, pytest, React 19, Vite 8, Recharts, Radix/shadcn primitives, Node test runner, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-31-network-reporting-p0-p1-design.md`

## Global Constraints

- The all-area label is exactly `Regional Jatim`.
- Regional totals include every normalized Site ID in `traktor_data`; NOP filters include only master-mapped sites.
- Unmapped Regional sites appear as exactly `Belum Terpetakan` and remain in all additive totals.
- `Total Site` counts distinct normalized performance Site IDs and must equal the sum of returned area rows.
- Availability uses ratio of summed uptime to summed total time; contribution uses outage minutes, not Availability percentages.
- Revenue and Payload contribution use selected value divided by Regional value.
- The Availability SLA threshold is exactly `99.5%`; do not invent another SLA band.
- Payload copy must not claim capacity, headroom, saturation, or remaining capacity.
- Revenue targets come from PostgreSQL by canonical NOP and month; a range target is the sum of complete monthly configuration.
- Pivot input is allowlisted, server-aggregated, limited to 12 months and 1,000 result cells, and never accepts raw SQL identifiers.
- Keep the existing combined Performance Trend chart; do not create small-multiple charts.
- Do not add drag-and-drop pivot controls or a pivot chart toggle.
- Keep contribution copy to one concise line per Executive Insight and coverage/freshness in one separate compact strip.
- Preserve old Reporting endpoints for Home and compatibility until a later cleanup.
- Use existing NOD theme tokens, Lucide icons, shadcn/Radix primitives, and `SiteDetailModal`.
- Run `graphify update .` after material code changes.

---

## File structure

### Backend

- Create `backend/sql/reporting_foundation.sql`: idempotent target/refresh schema, indexes, trigger function, and statement-level triggers.
- Create `backend/queries/reporting_foundation.py`: schema bootstrap plus shared normalized SQL constants and period helpers.
- Create `backend/services/reporting_overview.py`: canonical Regional/selected aggregates, target resolution, source coverage, contribution facts, and area rows.
- Create `backend/services/reporting_drilldown.py`: allowlisted site sorting/ranking/filtering and paginated site response.
- Create `backend/services/reporting_pivot.py`: dataset registry, validation, cardinality estimate, SQL plans, aggregation, and cache-spec normalization.
- Modify `backend/models/reporting.py`: new typed overview, coverage, area, drill-down, and pivot models.
- Modify `backend/routers/reporting.py`: add focused endpoints and keep legacy routes.
- Modify `backend/main.py`: run the idempotent Reporting schema bootstrap during lifespan.
- Create `backend/tests/test_reporting_foundation.py`: target, freshness, normalization, and calculation unit tests.
- Create `backend/tests/test_reporting_overview.py`: service/route behavior tests with deterministic fake sessions.
- Create `backend/tests/test_reporting_drilldown.py`: sort/rank/SLA/page validation tests.
- Create `backend/tests/test_reporting_pivot.py`: registry, allowlist, ratio, and cardinality tests.
- Create `backend/tests/integration/test_reporting_numeric.py`: real PostgreSQL numeric integration cases.
- Modify `backend/tests/conftest.py`: integration marker/URL fixture without changing ordinary test isolation.
- Modify `.github/workflows/deploy.yml`: PostgreSQL 16 service and integration-test environment.

### Frontend

- Modify `frontend/src/services/api.js`: new overview, areas, drill-down, and pivot API calls with abort signals.
- Create `frontend/src/features/reporting/reportingInsights.js`: severity and concise contribution presentation.
- Create `frontend/src/features/reporting/reportingTableState.js`: immutable sorting/ranking/mobile projection helpers.
- Create `frontend/src/features/reporting/reportingPivotState.js`: draft validation and flat-result-to-grid shaping.
- Create `frontend/src/features/reporting/ReportingCoverageStrip.jsx`: one compact source strip and detail popover/sheet.
- Create `frontend/src/features/reporting/ReportingExecutiveInsights.jsx`: three concise consistent insight cards.
- Create `frontend/src/features/reporting/ReportingPerformanceTrend.jsx`: existing combined chart extracted without changing its metric semantics.
- Create `frontend/src/features/reporting/ReportingAreaTable.jsx`: sortable/rankable desktop table and mobile cards.
- Create `frontend/src/features/reporting/ReportingSiteDrilldown.jsx`: responsive drawer/sheet and shared Site Detail handoff.
- Create `frontend/src/features/reporting/ReportingPivot.jsx`: explicit pivot controls and semantic grid.
- Modify `frontend/src/pages/NetworkReportingPage.jsx`: orchestration only; remove Site Class request/tab and six-request composition.
- Create `frontend/src/__tests__/reportingInsights.test.js`.
- Create `frontend/src/__tests__/reportingTableState.test.js`.
- Create `frontend/src/__tests__/reportingPivotState.test.js`.
- Modify `frontend/src/__tests__/dashboardReportingContracts.test.js`: replace obsolete source-pattern assertions with new route/component contracts.

---

### Task 1: Reporting schema, target lookup, and refresh tracking

**Files:**
- Create: `backend/sql/reporting_foundation.sql`
- Create: `backend/queries/reporting_foundation.py`
- Modify: `backend/main.py:51-112`
- Create: `backend/tests/test_reporting_foundation.py`

**Interfaces:**
- Produces: `ensure_reporting_foundation(session: AsyncSession) -> None`
- Produces: `load_revenue_target(session, *, nop: str | None, period_start: str, period_end: str) -> RevenueTargetResult`
- Produces: `load_revenue_target_version(session, *, nop: str | None) -> str` for cache invalidation.
- Produces: `canonical_nop(value: str | None) -> str | None`
- Produces: SQL constants `NORMALIZED_TRAKTOR_SITE_ID`, `NORMALIZED_MASTER_SITE_ID`, and `UNMAPPED_AREA_KEY`
- Consumes: existing `AsyncSession`, `MonthPeriod`, and application lifespan session factory.

- [ ] **Step 1: Write failing schema and target tests**

```python
def test_canonical_nop_removes_optional_prefix():
    from queries.reporting_foundation import canonical_nop
    assert canonical_nop(" NOP Sidoarjo ") == "SIDOARJO"
    assert canonical_nop("Regional Jatim") is None


@pytest.mark.asyncio
async def test_target_range_requires_every_month():
    session = FakeTargetSession([
        {"trx_month": "2026-06", "target_revenue": 90_000_000_000},
    ])
    result = await load_revenue_target(
        session,
        nop="SIDOARJO",
        period_start="2026-06",
        period_end="2026-07",
    )
    assert result.target_revenue == 90_000_000_000
    assert result.selected_months == 2
    assert result.configured_months == 1
    assert result.missing_months == ["2026-07"]
    assert result.complete is False
```

- [ ] **Step 2: Run the tests and verify the imports fail**

Run: `python -m pytest tests/test_reporting_foundation.py -q`

Expected: FAIL because `queries.reporting_foundation` does not exist.

- [ ] **Step 3: Add the idempotent SQL schema**

Implement `reporting_foundation.sql` as statements separated by an exact line containing `-- statement-breakpoint`, with:

```sql
CREATE TABLE IF NOT EXISTS public.reporting_revenue_targets (
    nop_key text NOT NULL,
    trx_month text NOT NULL CHECK (trx_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    target_revenue numeric(20, 0) NOT NULL CHECK (target_revenue >= 0),
    note text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (nop_key, trx_month)
);

CREATE TABLE IF NOT EXISTS public.reporting_source_refresh (
    source_key text PRIMARY KEY,
    last_refreshed_at timestamptz,
    last_operation text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.touch_reporting_source_refresh()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.reporting_source_refresh(source_key, last_refreshed_at, last_operation, updated_at)
  VALUES (TG_ARGV[0], clock_timestamp(), TG_OP, clock_timestamp())
  ON CONFLICT (source_key) DO UPDATE SET
    last_refreshed_at = EXCLUDED.last_refreshed_at,
    last_operation = EXCLUDED.last_operation,
    updated_at = EXCLUDED.updated_at;
  RETURN NULL;
END;
$$;
```

Create statement-level triggers for `traktor_data`, `site_month_metrics`, `availability_logs_jatim`, `data_site_master`, `ticketing_fault_center`, `proker_enom_jatim_2026`, and `reporting_revenue_targets`. Use guarded `DO $$` blocks so missing optional source tables do not fail startup.

Seed canonical `SIDOARJO` target rows for available `traktor_data.trx_month` values with `90_000_000_000`, using `ON CONFLICT DO NOTHING`.

- [ ] **Step 4: Implement the schema bootstrap and target result**

```python
@dataclass(frozen=True)
class RevenueTargetResult:
    target_revenue: int
    selected_months: int
    configured_months: int
    missing_months: list[str]
    version: str

    @property
    def complete(self) -> bool:
        return self.selected_months > 0 and self.configured_months == self.selected_months


async def ensure_reporting_foundation(session: AsyncSession) -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    statements = [item.strip() for item in sql.split("\n-- statement-breakpoint\n")]
    for statement in statements:
        if not statement:
            continue
        await session.execute(text(statement))
    await session.commit()
```

The explicit marker keeps PL/pgSQL function and guarded `DO $$` bodies intact. Use the existing period range helper to generate expected months. Query only canonical NOP rows; Regional returns an incomplete zero-target result instead of inheriting an NOP target. Derive `version` from `MAX(updated_at)` plus row count for the canonical NOP, and expose the same value through `load_revenue_target_version` before reading/writing overview cache entries.

- [ ] **Step 5: Wire bootstrap into lifespan**

Call `ensure_reporting_foundation(session)` inside the existing startup database session. Log a concise warning and keep the application bootable only for genuinely optional refresh-trigger failures; target-table creation failure remains fatal because the new Reporting contract depends on it.

- [ ] **Step 6: Run focused and full backend tests**

Run: `python -m pytest tests/test_reporting_foundation.py tests/test_month_period.py -q`

Expected: PASS.

Run: `python -m pytest tests -q`

Expected: existing 384 tests plus new tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/sql/reporting_foundation.sql backend/queries/reporting_foundation.py backend/main.py backend/tests/test_reporting_foundation.py
git commit -m "feat: add reporting data foundation"
```

---

### Task 2: Typed models and canonical overview/area calculations

**Files:**
- Modify: `backend/models/reporting.py`
- Create: `backend/services/reporting_overview.py`
- Create: `backend/tests/test_reporting_overview.py`

**Interfaces:**
- Consumes: `RevenueTargetResult`, canonical NOP/site SQL constants, `MonthPeriod`.
- Produces: `load_reporting_overview(session, period, nop) -> ReportingOverview`
- Produces: `load_reporting_areas(session, period, nop) -> list[ReportingAreaRow]`
- Produces: `safe_share(selected: int | float | None, regional: int | float | None) -> float | None`
- Produces: `weighted_availability(total_minutes, outage_minutes) -> float | None`

- [ ] **Step 1: Write failing numeric helper and model tests**

```python
def test_weighted_availability_uses_ratio_of_sums():
    assert weighted_availability(2000, 20) == pytest.approx(99.0)
    assert weighted_availability(0, 20) is None


def test_safe_share_handles_zero_regional():
    assert safe_share(25, 100) == pytest.approx(25.0)
    assert safe_share(5, 0) is None


def test_area_rows_reconcile_to_overview():
    rows = [
        ReportingAreaRow(area_key="kab-a", total_sites=2, revenue=300, payload=30),
        ReportingAreaRow(area_key="unmapped", total_sites=1, revenue=100, payload=10),
    ]
    assert sum(row.total_sites for row in rows) == 3
    assert sum(row.revenue for row in rows) == 400
```

- [ ] **Step 2: Run and verify missing models/functions**

Run: `python -m pytest tests/test_reporting_overview.py -q`

Expected: FAIL on missing new model names.

- [ ] **Step 3: Add typed response models**

Add exact Pydantic structures:

```python
class ReportingContribution(BaseModel):
    regional_value: int | float | None = None
    contribution_pct: float | None = None
    difference_pp: float | None = None


class ReportingSourceCoverage(BaseModel):
    source_key: str
    label: str
    expected_periods: list[str] = Field(default_factory=list)
    available_periods: list[str] = Field(default_factory=list)
    missing_periods: list[str] = Field(default_factory=list)
    latest_data_period: str | None = None
    record_count: int | None = None
    mapped_sites: int | None = None
    total_sites: int | None = None
    last_refreshed_at: datetime | None = None
    status: Literal["complete", "partial", "missing", "untracked"]


class ReportingAreaRow(BaseModel):
    area_key: str
    kabupaten: str
    is_unmapped: bool = False
    total_sites: int = 0
    revenue: int = 0
    payload: int = 0
    traffic: int = 0
    total_time_minutes: float = 0
    outage_minutes: float = 0
    avg_availability: float | None = None
    sla_status: Literal["met", "missed", "unavailable"]
```

Include current Revenue component, Payload technology, Traffic technology, ticket, backup, Proker, delta, target, insight-fact, and period metadata fields required by the spec.

- [ ] **Step 4: Implement one normalized aggregate SQL path**

Build SQL in `reporting_overview.py` from fixed fragments. The core CTE shape must be:

```sql
WITH performance AS (
  SELECT UPPER(TRIM(t.site_id)) AS site_key,
         t.trx_month,
         SUM(t.rev) AS revenue,
         SUM(t.payload) AS payload,
         SUM(t.traffic) AS traffic
  FROM public.traktor_data t
  WHERE t.trx_month BETWEEN :period_start AND :period_end
  GROUP BY 1, 2
),
master AS (
  SELECT DISTINCT ON (UPPER(TRIM(d."Siteid")))
         UPPER(TRIM(d."Siteid")) AS site_key,
         d."Siteid" AS site_id,
         d."NOP" AS nop,
         d."Kabupaten/KOTA" AS kabupaten,
         d."Site Class" AS site_class,
         d."Status Site" AS status_site,
         d."Transport Type" AS transport_type
  FROM public.data_site_master d
  WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
  ORDER BY UPPER(TRIM(d."Siteid")), d.row_number NULLS LAST
)
```

Aggregate Availability from `site_month_metrics` by normalized site/month and sum total/outage minutes. Use raw logs only for a period absent from the cache and do not expose outage contribution from percentage-only fallback data.

Run Regional and selected aggregates in the same service call. Apply NOP only to the selected aggregate. Derive contributions in Python with `safe_share`.

- [ ] **Step 5: Implement source coverage/freshness**

Query available periods and counts independently for Performance, Availability cache/raw fallback, Ticketing, Proker, Site Master, and Revenue Target. Join `reporting_source_refresh` by fixed source keys. Set `status` from expected/available periods and refresh tracking without converting latest business dates into ingestion timestamps.

- [ ] **Step 6: Run focused tests**

Run: `python -m pytest tests/test_reporting_overview.py tests/test_reporting_foundation.py -q`

Expected: PASS with exact numeric assertions.

- [ ] **Step 7: Commit**

```powershell
git add backend/models/reporting.py backend/services/reporting_overview.py backend/tests/test_reporting_overview.py
git commit -m "feat: unify reporting overview metrics"
```

---

### Task 3: Overview and areas API contracts with cache isolation

**Files:**
- Modify: `backend/routers/reporting.py`
- Modify: `backend/tests/test_reporting_redis_cache.py`
- Modify: `backend/tests/test_period_router_params.py`
- Modify: `backend/tests/test_reporting_nop_contract.py`

**Interfaces:**
- Consumes: `load_reporting_overview`, `load_reporting_areas`, `resolve_reporting_period`.
- Produces: `GET /reporting/overview`
- Produces: `GET /reporting/areas`

- [ ] **Step 1: Write failing endpoint tests**

```python
@pytest.mark.asyncio
async def test_overview_passes_normalized_scope_to_service(monkeypatch):
    captured = {}
    async def fake_loader(session, period, nop):
        captured.update(nop=nop, start=period.period_start, end=period.period_end)
        return overview_fixture()
    monkeypatch.setattr(reporting, "load_reporting_overview", fake_loader)
    result = await reporting.get_reporting_overview(
        period_start="2026-06", period_end="2026-07", nop="NOP SIDOARJO",
        session=FakeSession(), response=Response(),
    )
    assert captured == {"nop": "SIDOARJO", "start": "2026-06", "end": "2026-07"}
    assert result.scorecards.total_sites == 3
```

- [ ] **Step 2: Run and verify route functions are missing**

Run: `python -m pytest tests/test_period_router_params.py tests/test_reporting_redis_cache.py -q`

Expected: FAIL on missing `get_reporting_overview`/new cache resources.

- [ ] **Step 3: Add the two routes**

```python
@router.get("/overview", response_model=ReportingOverview)
async def get_reporting_overview(
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
    trx_month: str | None = Query(default=None),
    period_start: str | None = Query(default=None),
    period_end: str | None = Query(default=None),
    nop: str | None = Query(default=None),
) -> ReportingOverview:
    period = resolve_reporting_period(trx_month, period_start, period_end)
    normalized_nop = canonical_nop(nop)
    return await load_reporting_overview(session, period, normalized_nop)


@router.get("/areas", response_model=list[ReportingAreaRow])
async def get_reporting_areas(
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
    trx_month: str | None = Query(default=None),
    period_start: str | None = Query(default=None),
    period_end: str | None = Query(default=None),
    nop: str | None = Query(default=None),
) -> list[ReportingAreaRow]:
    period = resolve_reporting_period(trx_month, period_start, period_end)
    return await load_reporting_areas(session, period, canonical_nop(nop))
```

Use separate Redis resources `overview-v3` and `areas-v3`. Include period, normalized NOP, and the target configuration version in the overview key. Continue returning `X-Cache` headers. Do not change legacy route signatures.

- [ ] **Step 4: Update obsolete source-pattern contracts**

Replace assertions that require Network Reporting to call `site-class-by-kabupaten` with assertions that legacy endpoints remain registered and new routes call the service functions. Preserve NOP parameter coverage for legacy Home users.

- [ ] **Step 5: Run focused and full backend suites**

Run: `python -m pytest tests/test_reporting_redis_cache.py tests/test_period_router_params.py tests/test_reporting_nop_contract.py tests/test_reporting_overview.py -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add backend/routers/reporting.py backend/tests/test_reporting_redis_cache.py backend/tests/test_period_router_params.py backend/tests/test_reporting_nop_contract.py
git commit -m "feat: expose trusted reporting overview"
```

---

### Task 4: Kabupaten-to-site drill-down API

**Files:**
- Create: `backend/services/reporting_drilldown.py`
- Modify: `backend/models/reporting.py`
- Modify: `backend/routers/reporting.py`
- Create: `backend/tests/test_reporting_drilldown.py`

**Interfaces:**
- Produces: `ReportingSiteQuery` validated query model.
- Produces: `load_reporting_sites(session, *, period, nop, area_key, query) -> ReportingSitePage`
- Produces: `GET /reporting/areas/{area_key}/sites`
- Consumes: normalized site/master fragments and 99.5 SLA threshold.

- [ ] **Step 1: Write failing validation and result tests**

```python
def test_drilldown_rejects_unknown_sort():
    with pytest.raises(ValidationError):
        ReportingSiteQuery(sort_by="drop table")


@pytest.mark.asyncio
async def test_unmapped_area_uses_null_master_match():
    session = CapturingSession(site_rows=[site_row(site_id="ZZZ001", kabupaten=None)])
    page = await load_reporting_sites(
        session,
        period=period("2026-07"),
        nop=None,
        area_key="unmapped",
        query=ReportingSiteQuery(),
    )
    assert [row.site_id for row in page.rows] == ["ZZZ001"]
    assert 'master.site_key IS NULL' in session.sql
```

- [ ] **Step 2: Run and verify missing service/models**

Run: `python -m pytest tests/test_reporting_drilldown.py -q`

Expected: FAIL.

- [ ] **Step 3: Implement allowlisted query state**

```python
SORT_EXPRESSIONS = {
    "site_id": "facts.site_id",
    "revenue": "facts.revenue",
    "payload": "facts.payload",
    "availability": "facts.avg_availability",
    "revenue_mom": "facts.revenue_mom_pct",
    "payload_mom": "facts.payload_mom_pct",
}
RANK_METRICS = set(SORT_EXPRESSIONS) - {"site_id"}
PAGE_SIZE_MAX = 100
```

Use `Literal` validation for sort/rank/SLA fields and validated `page_size <= 100`. Generate `ORDER BY` only from `SORT_EXPRESSIONS`; add normalized Site ID as tie-breaker and nulls last.

- [ ] **Step 4: Implement period facts and previous-period deltas**

Aggregate current selected range and equal-length previous range by normalized Site ID. Join weighted Availability, master identity, and Site Class. Apply area/NOP/search/SLA/Site Class filters before count and pagination. `rank=top|bottom` applies the rank metric ordering and rank limit before pagination.

- [ ] **Step 5: Add the route**

Map validated query parameters to `ReportingSiteQuery`, preserve cache isolation by period/NOP/area/query, and return 404 only for an invalid mapped area key—not for a valid empty result.

- [ ] **Step 6: Run focused tests**

Run: `python -m pytest tests/test_reporting_drilldown.py tests/test_site_performance.py -q`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/services/reporting_drilldown.py backend/models/reporting.py backend/routers/reporting.py backend/tests/test_reporting_drilldown.py
git commit -m "feat: add reporting site drilldown"
```

---

### Task 5: Safe dynamic pivot API

**Files:**
- Create: `backend/services/reporting_pivot.py`
- Modify: `backend/models/reporting.py`
- Modify: `backend/routers/reporting.py`
- Create: `backend/tests/test_reporting_pivot.py`

**Interfaces:**
- Produces: `ReportingPivotRequest`, `ReportingPivotValue`, `ReportingPivotResponse`.
- Produces: `normalize_pivot_spec(request) -> str` stable JSON cache identity.
- Produces: `execute_reporting_pivot(session, request) -> ReportingPivotResponse`.
- Produces: `POST /reporting/pivot`.

- [ ] **Step 1: Write failing allowlist and calculation tests**

```python
def test_pivot_rejects_dimension_from_another_dataset():
    with pytest.raises(ValidationError):
        ReportingPivotRequest(
            dataset="performance",
            period_start="2026-07", period_end="2026-07",
            rows=["ticket_category"], columns=[],
            values=[{"field": "revenue", "aggregation": "sum"}],
        )


def test_ratio_of_sums_is_not_average_of_rates():
    assert ratio_of_sums(3, 6) == pytest.approx(50.0)
    assert ratio_of_sums(0, 0) is None


def test_cardinality_guard_rejects_more_than_one_thousand_cells():
    with pytest.raises(HTTPException) as error:
        enforce_cell_limit(row_count=101, column_count=10, value_count=1)
    assert error.value.status_code == 422
```

- [ ] **Step 2: Run and verify missing pivot module**

Run: `python -m pytest tests/test_reporting_pivot.py -q`

Expected: FAIL.

- [ ] **Step 3: Implement explicit dataset registry**

```python
DATASETS = {
    "performance": PivotDataset(
        dimensions={"period": "facts.trx_month", "nop": "facts.nop", "kabupaten": "facts.kabupaten", "site_id": "facts.site_id", "site_class": "facts.site_class", "transport_type": "facts.transport_type", "mapping_status": "facts.mapping_status"},
        measures={"sites": distinct_sites, "revenue": sum_measure("revenue"), "revenue_per_site": ratio_measure("revenue", "site_count"), "payload": sum_measure("payload"), "payload_per_site": ratio_measure("payload", "site_count"), "traffic": sum_measure("traffic"), "availability": weighted_availability_measure, "outage_minutes": sum_measure("outage_minutes")},
    ),
    "ticketing": PivotDataset(
        dimensions={"period": "facts.period", "nop": "facts.nop", "kabupaten": "facts.kabupaten", "site_id": "facts.site_id", "ticket_category": "facts.ticket_category", "backup_result": "facts.backup_result", "mapping_status": "facts.mapping_status"},
        measures={"tickets": count_rows, "backup_success": sum_measure("backup_success"), "backup_ratio": ratio_measure("backup_success", "backup_eligible")},
    ),
    "proker": PivotDataset(
        dimensions={"period": "facts.period", "nop": "facts.nop", "kabupaten": "facts.kabupaten", "site_id": "facts.site_id", "status": "facts.status", "mapping_status": "facts.mapping_status"},
        measures={"activities": count_rows, "open_activities": sum_measure("is_open"), "closed_activities": sum_measure("is_closed")},
    ),
}
```

Define every Ticketing and Proker mapping explicitly in the file. Do not derive database identifiers from client values.

- [ ] **Step 4: Implement request validation and normalized cache identity**

Enforce two row dimensions, one column dimension, three values, unique dimensions, dataset-valid filters, 12-month range, and supported aggregations. Serialize a sorted canonical dict with compact JSON separators.

- [ ] **Step 5: Implement cardinality estimate and aggregate execution**

Run distinct-count estimates for each selected row/column expression and calculate the conservative Cartesian cell estimate. Reject over 1,000 cells before running the final query. Return flat rows with ordered `dimensions` and `values` maps plus metadata; the browser shapes the cross-tab.

- [ ] **Step 6: Add the route and normalized Redis cache**

Hash `normalize_pivot_spec(request)` into the cache key. Return a stable 422 detail containing `code="pivot_too_large"`, estimated cells, and the 1,000-cell limit.

- [ ] **Step 7: Run focused tests**

Run: `python -m pytest tests/test_reporting_pivot.py tests/test_reporting_overview.py -q`

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add backend/services/reporting_pivot.py backend/models/reporting.py backend/routers/reporting.py backend/tests/test_reporting_pivot.py
git commit -m "feat: add guarded reporting pivot api"
```

---

### Task 6: Real PostgreSQL numeric integration coverage and CI service

**Files:**
- Create: `backend/tests/integration/test_reporting_numeric.py`
- Modify: `backend/tests/conftest.py`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: real Reporting schema/services/routes from Tasks 1-5.
- Produces: `reporting_db_session` isolated transaction fixture.

- [ ] **Step 1: Add the PostgreSQL CI service**

Add under the `verify` job:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: test
    ports:
      - 5432:5432
    options: >-
      --health-cmd "pg_isready -U test -d test"
      --health-interval 5s
      --health-timeout 5s
      --health-retries 10
env:
  RUN_REPORTING_DB_TESTS: "1"
  REPORTING_TEST_DATABASE_URL: postgresql+asyncpg://test:test@127.0.0.1:5432/test
```

- [ ] **Step 2: Write a failing isolated database fixture**

Create one temporary PostgreSQL schema per test session, set `search_path`, create the minimal source tables, apply `reporting_foundation.sql`, and drop the schema in fixture teardown. Skip only when `RUN_REPORTING_DB_TESTS != "1"`.

The fixture must create an `AsyncEngine` from `REPORTING_TEST_DATABASE_URL`, open one connection, create a UUID-suffixed schema with a quoted identifier, set `search_path` to that schema, create the exact minimal source columns used by the services, execute every foundation statement using the marker-aware loader, and yield an `AsyncSession` bound to that connection. In `finally`, roll back and close the session, restore `search_path`, drop only the generated schema with `CASCADE`, dispose the engine, and never reuse the application database URL.

- [ ] **Step 3: Add numeric fixtures**

Insert July and June 2026 data for `AAA001`, `BBB001`, and unmapped `ZZZ001`; master rows exist only for the first two. Use values that produce exact assertions:

- July Revenue: 200, 100, 100 => Regional 400.
- Selected SIDOARJO Revenue: 300 => 75% contribution.
- July Payload: 20, 10, 10 => Regional 40 and selected 75%.
- Availability time/outage: mapped 1,000/10 and 1,000/20; unmapped 1,000/30 => selected 98.5%, Regional 98.0%, outage contribution 50%.

- [ ] **Step 4: Write the required numeric integration tests**

Call real service functions and assert:

```python
assert overview.scorecards.total_sites == 3
assert sum(row.total_sites for row in areas) == 3
assert overview.revenue.contribution_pct == pytest.approx(75.0)
assert overview.payload.contribution_pct == pytest.approx(75.0)
assert overview.availability.value == pytest.approx(98.5)
assert overview.availability.contribution.difference_pp == pytest.approx(0.5)
assert overview.availability.contribution.contribution_pct == pytest.approx(50.0)
```

Add target completeness, unmapped drill-down, SLA/sort/rank/page, Pivot weighted Availability, and backup ratio-of-sums assertions from the spec.

- [ ] **Step 5: Run integration and full backend tests**

Run with a local PostgreSQL service or CI-equivalent environment:

`$env:RUN_REPORTING_DB_TESTS='1'; $env:REPORTING_TEST_DATABASE_URL='postgresql+asyncpg://test:test@127.0.0.1:5432/test'; python -m pytest tests/integration/test_reporting_numeric.py -q`

Expected: PASS.

Run: `python -m pytest tests -q`

Expected: all unit/contract tests PASS; integration tests skip only when the explicit service flag is absent.

- [ ] **Step 6: Commit**

```powershell
git add backend/tests/integration/test_reporting_numeric.py backend/tests/conftest.py .github/workflows/deploy.yml
git commit -m "test: verify reporting numbers in postgres"
```

---

### Task 7: Frontend data contracts and pure Reporting state helpers

**Files:**
- Modify: `frontend/src/services/api.js:212-253`
- Create: `frontend/src/features/reporting/reportingInsights.js`
- Create: `frontend/src/features/reporting/reportingTableState.js`
- Create: `frontend/src/features/reporting/reportingPivotState.js`
- Create: `frontend/src/__tests__/reportingInsights.test.js`
- Create: `frontend/src/__tests__/reportingTableState.test.js`
- Create: `frontend/src/__tests__/reportingPivotState.test.js`

**Interfaces:**
- Produces: `fetchReportingOverview(period, nop, {signal})`
- Produces: `fetchReportingAreas(period, nop, {signal})`
- Produces: `fetchReportingSites(areaKey, period, nop, query, {signal})`
- Produces: `fetchReportingPivot(spec, {signal})`
- Produces: `buildReportingInsights(overview, comparisonLabel) -> Insight[]`
- Produces: `sortAreaRows`, `rankAreaRows`, `toMobileAreaMetric`.
- Produces: `validatePivotDraft`, `buildPivotSpec`, `shapePivotGrid`.

- [ ] **Step 1: Write failing pure behavior tests**

```javascript
test('availability decline cannot render a success tone', () => {
  const [availability] = buildReportingInsights(fixture({
    availabilitySeverity: 'warning',
  }), 'vs periode sebelumnya').filter((item) => item.key === 'availability')
  assert.equal(availability.tone, 'warning')
  assert.match(availability.contribution, /outage Regional/)
})

test('mobile area projection keeps only prioritized metrics', () => {
  assert.deepEqual(toMobileAreaMetric(areaFixture()), {
    areaKey: 'kab-sidoarjo', label: 'Kabupaten Sidoarjo', sites: 2,
    revenue: 300, payload: 30, availability: 99.8, slaStatus: 'met',
  })
})

test('pivot shaping produces deterministic row and column totals', () => {
  const grid = shapePivotGrid(pivotFixture())
  assert.equal(grid.rows[0].cells['2026-07'].revenue, 300)
  assert.equal(grid.totals.revenue, 400)
})
```

- [ ] **Step 2: Run and verify modules are missing**

Run: `node --test src/__tests__/reportingInsights.test.js src/__tests__/reportingTableState.test.js src/__tests__/reportingPivotState.test.js`

Expected: FAIL.

- [ ] **Step 3: Add API functions with abort support**

Use the existing API client and period params. `fetchReportingPivot` posts the validated specification. Do not remove legacy API functions because Home/compatibility tests may still import them.

- [ ] **Step 4: Implement concise insight facts**

Return exactly three insight objects with `key`, `label`, `title`, `value`, `comparison`, `detail`, `contribution`, `severity`, `tone`, and `iconName`. Do not generate more than one contribution line. For Regional Availability set `contribution = null`; for missing outage data use `Kontribusi outage belum tersedia`.

- [ ] **Step 5: Implement immutable area/rank/mobile helpers**

Sorting never mutates input. Null values sort last in both directions; `kabupaten` is the deterministic tie-breaker. `rankAreaRows` removes `is_unmapped` before Top/Bottom slicing and appends the unmapped row afterward.

- [ ] **Step 6: Implement pivot draft and grid helpers**

Reject more than two rows, one column, or three values before calling the API. Preserve backend dimension order, create stable compound keys with JSON serialization, and compute additive totals only from backend total metadata—do not average percentage cells in the browser.

- [ ] **Step 7: Run focused tests**

Run: `node --test src/__tests__/reportingInsights.test.js src/__tests__/reportingTableState.test.js src/__tests__/reportingPivotState.test.js`

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add frontend/src/services/api.js frontend/src/features/reporting/reportingInsights.js frontend/src/features/reporting/reportingTableState.js frontend/src/features/reporting/reportingPivotState.js frontend/src/__tests__/reportingInsights.test.js frontend/src/__tests__/reportingTableState.test.js frontend/src/__tests__/reportingPivotState.test.js
git commit -m "feat: add reporting analysis state"
```

---

### Task 8: Compact overview, coverage, insights, and existing trend extraction

**Files:**
- Create: `frontend/src/features/reporting/ReportingCoverageStrip.jsx`
- Create: `frontend/src/features/reporting/ReportingExecutiveInsights.jsx`
- Create: `frontend/src/features/reporting/ReportingPerformanceTrend.jsx`
- Modify: `frontend/src/pages/NetworkReportingPage.jsx`
- Modify: `frontend/src/__tests__/dashboardReportingContracts.test.js`

**Interfaces:**
- Consumes: new API functions and `buildReportingInsights`.
- Produces: a compact page overview with independent overview/areas failures.
- Produces: `ReportingCoverageStrip({sources})`, `ReportingExecutiveInsights({insights})`, `ReportingPerformanceTrend({rows, period})`.

- [ ] **Step 1: Replace obsolete contract expectations with failing new expectations**

Assert the page imports the three feature components, calls `fetchReportingOverview` and `fetchReportingAreas`, renders `Regional Jatim`, and does not import/call `fetchSiteClassByKabupaten`. Assert the hard-coded `REVENUE_TARGET` is absent.

- [ ] **Step 2: Run the Reporting contract test**

Run: `node --test src/__tests__/dashboardReportingContracts.test.js`

Expected: FAIL against the current page.

- [ ] **Step 3: Build the compact coverage strip**

Desktop renders one row of source labels with complete/partial/missing state and latest data period. A Popover contains counts, missing months, mapping coverage, and refresh timestamp. Mobile uses the same trigger and a bottom Sheet. Do not duplicate source details below KPI cards.

- [ ] **Step 4: Build consistent Executive Insight cards**

Render label, title, primary value/comparison, one factual detail, and one contribution line. Tone/icon come from `severity`; the component must not recompute them from raw Availability.

- [ ] **Step 5: Extract the existing combined trend unchanged**

Move the current Recharts `ComposedChart` into `ReportingPerformanceTrend`. Keep Revenue, Payload, and Availability together, preserve dynamic domains and period highlight, and retain accessible tooltip content.

- [ ] **Step 6: Refactor page orchestration**

Use one abort controller per overview/areas request generation. Keep available-month and filter-option loading. Preserve last successful overview/areas data on transient failure. Rename all no-NOP labels and PDF titles to `Regional Jatim`. Remove Site Class state, reducer, request, tab, and table.

- [ ] **Step 7: Run focused frontend tests and lint**

Run: `node --test src/__tests__/dashboardReportingContracts.test.js src/__tests__/reportingInsights.test.js`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add frontend/src/features/reporting/ReportingCoverageStrip.jsx frontend/src/features/reporting/ReportingExecutiveInsights.jsx frontend/src/features/reporting/ReportingPerformanceTrend.jsx frontend/src/pages/NetworkReportingPage.jsx frontend/src/__tests__/dashboardReportingContracts.test.js
git commit -m "feat: rebuild compact reporting overview"
```

---

### Task 9: Sortable area analysis and responsive site drill-down

**Files:**
- Create: `frontend/src/features/reporting/ReportingAreaTable.jsx`
- Create: `frontend/src/features/reporting/ReportingSiteDrilldown.jsx`
- Modify: `frontend/src/pages/NetworkReportingPage.jsx`
- Create: `frontend/src/__tests__/reportingDrilldownContracts.test.js`

**Interfaces:**
- Consumes: `fetchReportingSites`, `sortAreaRows`, `rankAreaRows`, `toMobileAreaMetric`, `fetchSiteDetailBundle`, `SiteDetailModal`.
- Produces: `ReportingAreaTable({rows, loading, error, onSelectArea})`.
- Produces: `ReportingSiteDrilldown({area, period, nop, open, onOpenChange})`.

- [ ] **Step 1: Write failing interaction contracts**

Assert desktop sortable headers, ranking controls, SLA label, unmapped-row action, mobile metric-card projection, server drill-down parameters, abort cleanup, Sheet semantics, Site Class filter, and Site Detail opening.

- [ ] **Step 2: Run and verify components are missing**

Run: `node --test src/__tests__/reportingDrilldownContracts.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement the area table and mobile cards**

Desktop columns prioritize Kabupaten, Sites, Revenue, Payload, Traffic, Availability/SLA, tickets, backup, and Proker; detailed Revenue columns remain behind the existing explicit toggle. Sorting/ranking uses pure helpers because the area row count is bounded. Mobile cards show Kabupaten, Sites, Revenue, Payload, Availability/SLA; one expand action reveals secondary metrics.

- [ ] **Step 4: Implement the drill-down drawer/sheet**

Desktop uses a right-side Sheet with a bounded width; mobile uses a full-screen/bottom Sheet. State includes page, page size, sort, ranking, metric, SLA, Site Class, and debounced search. Every request passes an AbortSignal and stale responses cannot replace current state.

- [ ] **Step 5: Reuse Site Detail**

On site selection, call `fetchSiteDetailBundle(siteId, resolvedMonthYear, {signal})`, show contained loading/error state, and render the existing `SiteDetailModal`. Unmapped rows remain selectable even without master fields.

- [ ] **Step 6: Wire the `Kabupaten & Site` tab**

Replace the old Performance/Site Class tab switcher with `Kabupaten & Site` and `Analisis Pivot`. Preserve the compact table position below the combined trend.

- [ ] **Step 7: Run focused tests, lint, and build**

Run: `node --test src/__tests__/reportingDrilldownContracts.test.js src/__tests__/reportingTableState.test.js src/__tests__/siteDetailBundle.test.js`

Expected: PASS.

Run: `npm run lint && npm run build`

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add frontend/src/features/reporting/ReportingAreaTable.jsx frontend/src/features/reporting/ReportingSiteDrilldown.jsx frontend/src/pages/NetworkReportingPage.jsx frontend/src/__tests__/reportingDrilldownContracts.test.js
git commit -m "feat: add reporting area site drilldown"
```

---

### Task 10: Dynamic Pivot interface

**Files:**
- Create: `frontend/src/features/reporting/ReportingPivot.jsx`
- Modify: `frontend/src/pages/NetworkReportingPage.jsx`
- Create: `frontend/src/__tests__/reportingPivotContracts.test.js`

**Interfaces:**
- Consumes: `validatePivotDraft`, `buildPivotSpec`, `shapePivotGrid`, `fetchReportingPivot`.
- Produces: `ReportingPivot({period, nop})` with local draft/applied state and contained errors.

- [ ] **Step 1: Write failing Pivot UI contracts**

Assert Dataset/Rows/Columns/Values/Aggregation/Filters controls, explicit `Terapkan` action, no drag/drop dependency, no chart toggle, loading/error/empty states, semantic table totals, sticky first column, and mobile contained overflow.

- [ ] **Step 2: Run and verify component is missing**

Run: `node --test src/__tests__/reportingPivotContracts.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement dataset-aware controls**

Use existing Select/Combobox components. Changing Dataset resets incompatible dimensions/measures. Default Performance draft is rows=`kabupaten`, columns=`period`, values=`revenue sum`. Controls modify draft only; `Terapkan` validates and copies to applied state.

- [ ] **Step 4: Implement request and contained error behavior**

Abort the previous Pivot request on every apply/unmount. Display `pivot_too_large` with estimated/limit values and suggest removing a dimension. Never clear overview/area data on Pivot failure.

- [ ] **Step 5: Implement semantic grid**

Render row headers, grouped value headers, cells, and backend-provided totals. Use one sticky first column, tabular numeric formatting, sortable row labels, and contained horizontal overflow. On mobile, preserve the grid and order applied values as selected.

- [ ] **Step 6: Run focused tests, lint, and build**

Run: `node --test src/__tests__/reportingPivotContracts.test.js src/__tests__/reportingPivotState.test.js`

Expected: PASS.

Run: `npm run lint && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/features/reporting/ReportingPivot.jsx frontend/src/pages/NetworkReportingPage.jsx frontend/src/__tests__/reportingPivotContracts.test.js
git commit -m "feat: add dynamic reporting pivot"
```

---

### Task 11: Full verification, live read-only consistency, browser QA, and Graphify

**Files:**
- Modify only files required by failures found in this task.
- Update: `docs/superpowers/plans/2026-08-31-network-reporting-p0-p1.md` checkbox states.

**Interfaces:**
- Consumes all implemented contracts.
- Produces a clean reviewable branch with verification evidence.

- [ ] **Step 1: Run full backend verification**

Run: `python -m pytest tests -q`

Expected: all tests PASS; integration tests skip only when the local PostgreSQL flag is absent.

Run against PostgreSQL service: `python -m pytest tests/integration/test_reporting_numeric.py -q`

Expected: all numeric integration tests PASS.

- [ ] **Step 2: Run full frontend verification**

Run:

```powershell
node --test src/__tests__/*.test.js
npm run lint
npm run audit:production
npm run build
```

Expected: 0 test/lint/audit/build failures.

- [ ] **Step 3: Run live read-only consistency checks**

For a current Regional month and SIDOARJO month, compare API response values to direct aggregate SQL without printing credentials. Assert:

```text
overview.total_sites == sum(areas.total_sites)
overview.total_revenue == sum(areas.revenue)
overview.total_payload == sum(areas.payload)
mapped_sites + unmapped_sites == regional total_sites
```

Record only counts, percentages, months, and response times.

- [ ] **Step 4: Run authenticated browser QA**

Start backend/frontend with process-only development configuration. At 1,440 px, 736 px, and 390 px verify Regional Jatim, NOP, coverage detail, concise contributions, combined chart, mapped/unmapped drill-down, sorting, Top/Bottom, SLA, Site Detail, Pivot apply, Pivot limit error, print layout, and light/dark themes. Stop servers and reset browser viewport afterward.

- [ ] **Step 5: Measure query guardrails**

Measure cold/warm database execution for overview, areas, drill-down, and one accepted Pivot. If a guardrail fails, inspect `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` using read-only queries and add only evidence-backed indexes or aggregate reductions.

- [ ] **Step 6: Update Graphify**

Run: `graphify update .`

Expected: graph update completes and reflects new Reporting modules/routes.

- [ ] **Step 7: Review diff and secrets**

Run:

```powershell
git diff origin/main...HEAD --check
git status --short
git diff --stat origin/main...HEAD
```

Search tracked changes for credential-like values without printing environment files. Confirm only scoped Reporting, test, workflow, spec, and plan files changed.

- [ ] **Step 8: Commit verification-only fixes and plan completion**

```powershell
git add -u
git add -- docs/superpowers/plans/2026-08-31-network-reporting-p0-p1.md
git commit -m "test: verify reporting p0 p1 workflow"
```

- [ ] **Step 9: Prepare review handoff**

Report branch, commits, changed modules, schema behavior, test counts, browser coverage, live consistency results, measured timings, known limitations, and whether production schema/data were mutated. Do not merge or push unless explicitly requested.
