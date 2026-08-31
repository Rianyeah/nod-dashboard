# Network Reporting P0 + P1 Design

**Date:** 2026-08-31
**Status:** Approved in chat; pending document review
**Branch:** `codex/reporting-p0-p1`
**Base:** `origin/main` at `0bb341b`

## Goal

Make Network Reporting trustworthy and useful for short, deep analysis while keeping the page compact. P0 and P1 ship as one implementation: one consistent metric foundation, one compact curated reporting surface, Kabupaten-to-site drill-down, and a safe dynamic pivot table.

The existing combined Performance Trend chart remains. This design does not replace it with vertically separated small-multiple charts.

## Approved product decisions

### Regional scope

- Rename the all-NOP option to `Regional Jatim`.
- Regional Jatim includes every distinct Site ID present in `traktor_data` for the selected period.
- NOP-scoped results include only sites that can be mapped to a NOP through `data_site_master`.
- Sites without a master-data match remain part of Regional Jatim and appear as `Belum Terpetakan` in the Kabupaten breakdown.
- `Belum Terpetakan` is not treated as a real Kabupaten for top/bottom Kabupaten rankings.
- Opening `Belum Terpetakan` shows its Site IDs so the mapping gap can be corrected.

The data snapshot inspected during design for July 2026 contained 7,165 performance sites: 1,086 mapped and 6,079 unmapped. These counts are evidence for the design, not constants to encode in the application.

### Availability contribution

Availability is not additive. The UI must never calculate selected availability divided by Regional availability and call the result a contribution.

- Revenue contribution = selected revenue / Regional revenue.
- Payload contribution = selected payload / Regional payload.
- Availability comparison = selected weighted availability minus Regional weighted availability, in percentage points.
- Availability contribution = selected outage minutes / Regional outage minutes.
- If outage minutes are unavailable for the selected source or period, the contribution is unavailable rather than estimated.
- When Regional Jatim is selected, Revenue and Payload contribution are 100%; the Availability Regional comparison is hidden.

### Compact information hierarchy

- Keep the existing combined trend chart.
- Keep three Executive Insight cards: Revenue, Availability, and Payload.
- Add at most one concise contribution line to each insight.
- Put source coverage and freshness in one compact strip below the filters, with details on demand.
- Remove the dashboard-level Site Class table and its tab.
- Show Site Class only in the Kabupaten-to-site drill-down and pivot dimensions.
- Avoid decorative subtitles, redundant badges, generated prose, and repeated explanations.

## Alternatives considered

1. **Extend every current endpoint independently.** This minimizes initial code movement but preserves duplicated SQL, repeated database scans, and inconsistent site universes. Rejected.
2. **Introduce a shared reporting foundation and focused endpoints while retaining old contracts for compatibility.** Chosen. All new surfaces use the same site universe, weighting rules, and source metadata.
3. **Build a materialized reporting cube or warehouse.** This would maximize query speed but adds refresh orchestration and operational scope that current measurements do not yet justify. Deferred unless the guarded queries fail their latency limits.

## Scope

### Included

- One canonical site universe for scorecards, area rows, contributions, rankings, and drill-down totals.
- `Regional Jatim` label and unmapped-site treatment.
- Revenue target configuration in PostgreSQL.
- Source coverage and refresh tracking.
- Correct Executive Insight severity and Payload wording.
- Regional contribution values for all three insights.
- Kabupaten-to-site drill-down with Site Class, sorting, ranking, SLA, and pagination.
- Responsive area and site presentations using prioritized mobile metrics.
- Safe dynamic pivot analysis for Performance, Ticketing, and Proker datasets.
- Numeric PostgreSQL integration tests and frontend behavior tests.
- Splitting the current oversized Reporting page into focused feature modules.

### Excluded

- Replacing the combined Performance Trend with small multiples.
- A new reporting warehouse, BI server, or external pivot library.
- Drag-and-drop pivot configuration.
- Arbitrary client-provided SQL, expressions, joins, or column names.
- Admin UI for editing revenue targets. The table and migration are included; a target-management workflow is a separate feature.
- Correcting the 6,079 current master-data mismatches as part of this feature.
- Adding a capacity model for Payload.

## Canonical metric foundation

### Site key

All Reporting joins normalize Site ID using a shared SQL expression equivalent to:

```sql
UPPER(TRIM(site_id))
```

The same expression is used for `traktor_data.site_id`, `data_site_master."Siteid"`, `site_month_metrics.site_id`, and source-specific site fields. Query builders own these expressions; routes and client input do not construct them.

### Site universe

For a selected inclusive month range:

1. Aggregate `traktor_data` to one row per normalized Site ID and month.
2. Derive the distinct period Site ID set from those rows.
3. Left join the normalized master site.
4. Resolve `Regional Jatim`, NOP, Kabupaten, and mapping state from that joined set.

`Total Site` is the count of distinct Site IDs in this universe. Master status does not remove a performance site; status is exposed in drill-down. This makes the scorecard and area-table total identical by definition.

For multi-month ranges, a site is counted once across the range. Revenue, Payload, and Traffic are summed across the selected months.

### Regional and area rows

- Regional totals include mapped and unmapped sites.
- Kabupaten rows contain mapped sites only.
- One synthetic `Belum Terpetakan` row contains the unmatched remainder.
- The sum of distinct sites and additive measures across all returned rows must equal the scorecard values.
- Availability is always recomputed from summed time and outage values; area percentages are never averaged to produce totals.
- Backup success rate is successful backups divided by BPS tickets after summing the numerator and denominator.

### SLA

The initial SLA threshold remains 99.5% Availability.

- `met`: weighted Availability is at least 99.5%.
- `missed`: weighted Availability is below 99.5%.
- `unavailable`: there is no valid Availability value.

No unapproved “at risk” band is invented. The threshold remains a server-owned constant until SLA configuration is separately introduced.

## Revenue target configuration

Create `public.reporting_revenue_targets`:

```sql
CREATE TABLE IF NOT EXISTS public.reporting_revenue_targets (
    nop_key text NOT NULL,
    trx_month text NOT NULL,
    target_revenue numeric(20, 0) NOT NULL CHECK (target_revenue >= 0),
    note text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (nop_key, trx_month),
    CHECK (trx_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
```

Rules:

- `nop_key` uses the canonical prefix-free uppercase NOP label.
- A multi-month target is the sum of configured monthly targets for the selected NOP.
- The response includes selected month count, configured month count, and missing target months.
- The UI evaluates target severity only when every selected month has a target.
- No Regional target is derived by scaling an NOP target.
- The existing Sidoarjo monthly target is migrated into table rows for available Reporting months so current behavior is preserved as data rather than frontend code.

## Source coverage and freshness

### Coverage contract

Every Reporting source returns:

```json
{
  "source_key": "traktor",
  "label": "Performance",
  "expected_periods": ["2026-01", "2026-02"],
  "available_periods": ["2026-01", "2026-02"],
  "missing_periods": [],
  "latest_data_period": "2026-07",
  "record_count": 90879,
  "mapped_sites": 1086,
  "total_sites": 7165,
  "last_refreshed_at": null,
  "status": "complete"
}
```

Only applicable fields are populated. `record_count` is period-scoped where practical; master-data coverage is site-scoped.

### Refresh tracking

Create `public.reporting_source_refresh`:

```sql
CREATE TABLE IF NOT EXISTS public.reporting_source_refresh (
    source_key text PRIMARY KEY,
    last_refreshed_at timestamptz,
    last_operation text,
    updated_at timestamptz NOT NULL DEFAULT now()
);
```

Attach one statement-level trigger to each Reporting source table. `INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE` upsert the source refresh row once per statement. This covers application uploads, direct SQL, and COPY-based imports without row-level overhead.

- Existing sources with a trustworthy `updated_at` or `imported_at` value may initialize their tracker from that timestamp.
- Other existing sources start with `last_refreshed_at = NULL`.
- The UI shows `Refresh belum terlacak` until the next real source mutation.
- `latest_data_period` is displayed separately as `Data s.d. ...`; it is never mislabeled as an ingestion timestamp.

The compact strip shows source name, coverage state, and latest data period. A popover/sheet shows missing periods, counts, mapping coverage, and refresh timestamp.

## Backend architecture

### Module boundaries

- `backend/routers/reporting.py`: parameter validation, cache headers, and response orchestration only.
- `backend/services/reporting_overview.py`: canonical scorecard, Regional baseline, contributions, severity inputs, coverage, and area results.
- `backend/services/reporting_drilldown.py`: paginated site rows, ranking, and SLA filtering.
- `backend/services/reporting_pivot.py`: pivot dataset definitions, allowlists, query planning, cardinality guards, and result shaping.
- `backend/queries/reporting_foundation.py`: reusable normalized SQL fragments and idempotent schema SQL.
- `backend/models/reporting.py`: typed request and response models.

Do not introduce a generic query builder. Each supported dataset has an explicit server-owned definition.

### Main overview

Add `GET /api/v1/reporting/overview`.

Parameters:

- `period_start`
- `period_end`
- optional `nop`

Response sections:

- scorecards;
- Regional baselines;
- contribution values;
- configured revenue target and target coverage;
- Executive Insight facts and severity inputs;
- source coverage/freshness;
- period metadata.

The backend returns facts and stable severity codes, not prose-heavy insight paragraphs. The frontend owns concise Indonesian presentation.

### Area table

Add `GET /api/v1/reporting/areas` with the same period/NOP parameters.

Return one row per Kabupaten plus `Belum Terpetakan`, including:

- distinct sites;
- Revenue and components;
- Payload and technology components;
- Traffic and technology components;
- weighted Availability and outage minutes;
- SLA status;
- SWFM ticket and backup-success counts/rate;
- Proker open/closed counts;
- previous-period deltas used by the curated table.

The current endpoints remain temporarily available for Home and compatibility, but the Network Reporting page stops composing six independent requests.

### Drill-down

Add `GET /api/v1/reporting/areas/{area_key}/sites`.

Parameters:

- period/NOP;
- `page`, `page_size`;
- `sort_by`, `sort_dir`;
- `rank=all|top|bottom` and `rank_limit`;
- `rank_metric=revenue|payload|availability|revenue_mom|payload_mom`;
- `sla=all|met|missed|unavailable`;
- optional `site_class` and search query.

Allowed sorts and dimensions come only from dictionaries. Nulls sort last and normalized Site ID is the deterministic tie-breaker.

Return:

- paginated site rows;
- total matching rows;
- area summary;
- available Site Class options;
- ranking context.

Site rows include Site ID, name, NOP, Kabupaten, status, Site Class, Revenue, Revenue MoM, Payload, Payload MoM, weighted Availability, outage minutes, and SLA status. Selecting a row opens the existing shared Site Detail flow.

`area_key=unmapped` selects Regional performance sites without a master match and omits unavailable master fields.

### Pivot

Add `POST /api/v1/reporting/pivot`.

Request:

```json
{
  "dataset": "performance",
  "period_start": "2026-01",
  "period_end": "2026-07",
  "nop": "SIDOARJO",
  "rows": ["kabupaten"],
  "columns": ["period"],
  "values": [
    {"field": "revenue", "aggregation": "sum"},
    {"field": "availability", "aggregation": "weighted_avg"}
  ],
  "filters": []
}
```

Datasets are grain-safe and cannot be cross-joined arbitrarily:

#### Performance

- Dimensions: period, NOP, Kabupaten, Site ID, Site Class, Transport Type, mapping status.
- Measures: distinct sites, Revenue, Revenue per site, Payload, Payload per site, Traffic, weighted Availability, outage minutes.

#### Ticketing

- Dimensions: period, NOP, Kabupaten, Site ID, ticket category, backup result.
- Measures: ticket count, BPS ticket count, TS ticket count, backup success count, backup success rate.

#### Proker

- Dimensions: period, NOP, Kabupaten, Site ID, status.
- Measures: activity count, open count, closed count.

Rules:

- At most two row dimensions, one column dimension, and three values.
- Range limit follows the existing dashboard maximum of 12 months.
- Estimate cardinality before the aggregate query.
- Reject requests above 1,000 result cells with a clear 422 response.
- Never accept raw SQL, aliases, functions, or identifiers from the client.
- Aggregate in PostgreSQL and return only the compact result.
- Availability uses ratio of summed uptime to summed total time.
- Backup success rate uses ratio of summed successes to summed BPS tickets.
- Cache keys use the normalized request specification.

## Executive Insight behavior

### Revenue

- Target severity is evaluated only for complete target configuration.
- `success`: complete target and selected Revenue meets/exceeds it.
- `warning`: complete target and selected Revenue is below it.
- `unavailable`: selected data or complete target is unavailable.
- Show value, equal-period comparison, target gap, and one Regional contribution line.

### Availability

- `warning`: missing data, below SLA, or a continuing decline of at least two month-to-month steps.
- `success`: meets SLA and is not in a continuing decline.
- The title, icon, chip, and tone all use the same severity code.
- Show value, equal-period comparison, Regional difference in percentage points, and outage contribution when available.

### Payload

- Remove `capacity`, `within capacity`, and equivalent wording.
- Describe only observed traffic behavior: current value, equal-period comparison, and whether it is the highest value in the six-month context.
- Use informational tone unless data is unavailable.
- Show one Regional contribution line.

## Frontend experience

### Page order

```text
[ Header + export ]
[ Period | Area (Regional Jatim / NOP) ]
[ Compact source coverage strip ]
[ Four KPI cards ]
[ Three compact Executive Insight cards ]
[ Existing combined Performance Trend ]
[ Kabupaten & Site | Analisis Pivot ]
```

No Site Class tab remains on the main page.

### Kabupaten and site analysis

Desktop:

- Keep the curated Kabupaten table.
- Add accessible sortable headers.
- Provide a compact metric selector and `Semua / Top / Bottom` ranking control.
- Show the SLA indicator next to Availability.
- Clicking a row opens a right-side drill-down drawer.

Mobile:

- Render Kabupaten and site rows as compact metric cards rather than forcing the desktop table width.
- Prioritize identity, Revenue, Payload, Availability/SLA, and site count.
- Reveal tickets, backup, Proker, deltas, and other secondary fields through one expand action.
- The drill-down drawer becomes a full-screen sheet.

### Pivot analysis

- Use ordinary select/combobox controls for Dataset, Rows, Columns, Values, Aggregation, and Filters.
- Apply changes explicitly; do not issue a request for every control edit.
- Render a semantic pivot table with totals, sortable row labels, sticky first column, and horizontally contained value columns.
- Preserve the grid on mobile; show prioritized value columns first and allow contained horizontal scrolling for the remainder.
- Show cardinality-limit errors inside the Pivot tab without affecting the curated Reporting data.
- No chart toggle is required in this implementation.

### Component boundaries

- `NetworkReportingPage.jsx`: route-level state, period/NOP application, tab selection, and feature composition.
- `features/reporting/ReportingCoverageStrip.jsx`
- `features/reporting/ReportingExecutiveInsights.jsx`
- `features/reporting/ReportingPerformanceTrend.jsx`
- `features/reporting/ReportingAreaTable.jsx`
- `features/reporting/ReportingSiteDrilldown.jsx`
- `features/reporting/ReportingPivot.jsx`
- `features/reporting/reportingInsights.js`
- `features/reporting/reportingTableState.js`
- `features/reporting/reportingPivotState.js`

Reuse existing dashboard filters, sheet/dialog primitives, `SiteDetailModal`, formatters, theme tokens, and chart primitives.

## Loading, failure, and cache behavior

- Overview, areas, drill-down, and pivot have independent loading/error states.
- A Pivot or drill-down failure never blanks scorecards or the chart.
- Optional ticket/proker facts may return source-specific warnings while core performance remains usable.
- Preserve the last successful section value during a transient refresh failure.
- Abort stale frontend requests when period, NOP, page, sort, ranking, or pivot specification changes.
- Redis keys include period, normalized NOP, area, pagination/sort/rank filters, or normalized pivot request as applicable.
- Schema/target changes invalidate Reporting cache namespaces.

## Performance guardrails

- Reporting overview and areas use monthly aggregates before joining facts.
- Prefer `site_month_metrics` over scanning raw `availability_logs_jatim`.
- Raw Availability is a fallback only for periods missing from the monthly cache.
- Do not transfer raw site-month rows for pivot construction.
- Site drill-down is server-paginated with a maximum page size of 100.
- Pivot is capped at 1,000 result cells.
- Add or verify indexes for normalized source keys, month ranges, NOP/Kabupaten filters, and revenue target lookup.
- Target local/production-like response time after warm database connection:
  - overview: under 1.5 seconds;
  - areas: under 1.5 seconds;
  - site drill-down: under 1.0 second;
  - accepted pivot: under 2.0 seconds.

These are verification guardrails, not user-visible SLA promises.

## Testing strategy

### PostgreSQL integration tests

Add a PostgreSQL 16 service to the GitHub verify job and a dedicated Reporting integration schema fixture. Tests insert small numeric datasets and exercise the real SQL/service path.

Required numeric scenarios:

1. Three Regional sites: two mapped and one unmapped. Assert scorecard Total Site is three and equals the sum of area rows.
2. Assert Regional Revenue/Payload include the unmapped site while NOP results exclude it.
3. Assert Revenue and Payload contribution percentages against Regional totals.
4. Assert weighted Availability from summed total/outage minutes.
5. Assert Availability Regional percentage-point difference and outage-minute contribution.
6. Assert a two-month Revenue target is the sum of two monthly rows and incomplete configuration is reported rather than evaluated.
7. Assert `Belum Terpetakan` drill-down returns only unmatched Site IDs.
8. Assert server sorting, deterministic tie-breaks, top/bottom ranking, Site Class filter, pagination, and SLA filter.
9. Assert Pivot sum, distinct count, weighted Availability, and backup ratio-of-sums.
10. Assert invalid pivot identifiers and excessive cardinality are rejected.

### Backend unit/contract tests

- Period and NOP normalization.
- Severity fact generation.
- Pivot allowlists and normalized cache specifications.
- Coverage/freshness response shaping.
- Existing Home/Reporting compatibility contracts.

Tests should import and execute code. Source-text pattern checks may remain for legacy coverage but do not count as acceptance tests for this feature.

### Frontend tests

- Insight severity/title/icon consistency.
- Compact contribution-line formatting.
- Area sorting/ranking and unmapped-row behavior.
- Mobile prioritized-card projection.
- Drill-down request parameters and stale-request cancellation.
- Pivot specification validation, cell shaping, totals, and error state.
- Removal of the dashboard Site Class tab/request.

### Browser verification

Verify authenticated Reporting with representative data at:

- desktop around 1,440 px;
- compact desktop/tablet around 736 px;
- mobile around 390 px.

Exercise Regional Jatim, NOP, mapped Kabupaten, unmapped drill-down, site detail opening, sorting, Top/Bottom, SLA, Pivot apply, Pivot validation, source details, print/PDF layout, light theme, and dark theme.

## Migration and rollout

1. Add idempotent Reporting foundation schema and trigger definitions.
2. Seed the existing Sidoarjo monthly Revenue target for currently available Reporting months.
3. Deploy backend contracts while retaining old endpoints.
4. Deploy the refactored Reporting frontend against the new endpoints.
5. Run numeric integration tests and live read-only consistency queries.
6. Confirm Regional and NOP cache namespaces are separate.
7. After production verification, old Network Reporting-only endpoint usage may be removed in a later cleanup; Home compatibility remains out of scope here.

No current source rows are deleted or rewritten by this feature.

## Acceptance criteria

- The all-area label is `Regional Jatim` everywhere on Network Reporting and exports.
- For every supported period/filter, Total Site equals the sum of area rows returned by the same metric foundation.
- Regional Jatim includes unmatched performance sites and shows their mapping coverage honestly.
- Revenue target logic contains no frontend hard-coded target.
- Source coverage and freshness are visible without cluttering KPI or insight cards.
- Executive Insight severity, copy, icon, and tone cannot contradict each other.
- Payload insight makes no capacity claim.
- Each Executive Insight exposes the approved Regional comparison/contribution in one concise line.
- Site Class is absent from the main dashboard and present in the site drill-down and Performance pivot.
- Kabupaten rows and site rows support sorting, Top/Bottom ranking, and SLA state.
- Mobile shows prioritized metrics without full-page horizontal overflow.
- Dynamic Pivot is allowlisted, server-aggregated, grain-safe, and cardinality-limited.
- Numeric PostgreSQL integration tests prove totals, weighting, contributions, targets, rankings, and pivot calculations.
- Existing backend tests, frontend tests, lint, production audit, and build remain green.
- `graphify update .` completes after the final code changes.
