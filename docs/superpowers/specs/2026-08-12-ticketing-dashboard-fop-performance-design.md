# Ticketing Dashboard FOP Performance Design

Date: 2026-08-12
Status: Approved design awaiting written-spec review
Base: `origin/main` at `27eb469`
Branch: `codex/ticketing-dashboard-fop`

## Objective

Improve the Ticketing dashboard so it supports takeover-focused filtering, a meaningful MTTR scorecard, period-aware trend aggregation, selectable Kabupaten/Kota operational breakdowns, and a ranked FOP team performance table sourced from `public.ticketing_fault_center` in Neon.

The implementation extends the existing `GET /api/v1/ticketing/dashboard` contract. It does not add a second frontend request or a new database table.

## Confirmed Requirements

1. Replace the advanced `SLA Status` filter with `Takeover`.
2. Replace the `Response P90` scorecard with `Average MTTR`, sourced from `ticketing_fault_center.mttr`.
3. Swap the scorecard positions of `Manual Takeover` and `OUT SLA Rate`.
4. Aggregate the Ticket-by-category trend by selected period:
   - one month: daily;
   - two or three months: weekly;
   - more than three months: monthly.
5. Add a metric dropdown to `Kabupaten/Kota Distribution` with:
   - Takeover;
   - Visitation;
   - Backup Sukses;
   - Escalate.
6. Add `Performance Tim FOP` below `Top Problem Sites` in the left column, while `Ticket List` remains in the right column on desktop.
7. Rank all filtered PICs from best to worst using this score composition:
   - takeover count: 50%;
   - visitation count: 30%;
   - backup-success count: 10%;
   - response speed: 10%.

## Current Data Evidence

The Neon schema confirms that `mttr` and `respon_time` are interval columns, `takeover`, `visitation`, `backup_sukses`, and `pic_take_over_ticket` are text columns, and `is_escalate` is boolean.

A read-only profile of May through July 2026 returned 3,397 tickets. It showed these operational values:

- takeover: `TAKE OVER` and `NOT TAKEN`;
- visitation: `Visit site` and `Not Visit`;
- backup: `BU Genset` and `Not BU Genset`;
- escalation: boolean true or false;
- 25 distinct nonblank PICs;
- all 1,531 nonblank PIC rows were takeover rows.

Queries will normalize surrounding whitespace and use case-insensitive matching where business labels are compared.

## Backend Design

### Filter contract

Replace `sla_status` with `takeover` only in the advanced-filter request path. The SLA distribution chart and SLA Status column in Ticket List remain unchanged.

The filter contract changes are:

- `TicketingFilters.takeovers: list[str]` replaces `sla_statuses`;
- `shared_query_params` accepts `takeover`;
- `build_filter_params` carries `takeover`;
- `build_filter_clause` applies `UPPER(TRIM(t.takeover)) = UPPER(TRIM(:takeover))`;
- dashboard, ticket list, and CSV export all reuse the same filter clause.

The frontend sends only the new `takeover` parameter. Backward compatibility for the old advanced `sla_status` query parameter is not required because the dashboard is the only known caller of this filter surface. SLA fields remain available in dashboard and ticket rows.

### Average MTTR

Add `average_mttr_hours` to `TicketingSummary`. It is calculated as:

```sql
AVG(EXTRACT(EPOCH FROM mttr))
  FILTER (WHERE mttr IS NOT NULL AND EXTRACT(EPOCH FROM mttr) >= 0)
  / 3600
```

Invalid, negative, and null intervals do not contribute. If no valid MTTR exists, the value is null and the frontend displays its existing empty-value marker.

The old `p90_response_minutes` response field may remain temporarily for API compatibility, but it is no longer rendered by the Ticketing scorecards.

### Dynamic trend granularity

Introduce a pure helper that resolves one of `day`, `week`, or `month` from the active filter range. Canonical month filters use `MonthPeriod.month_count`. Custom dates use inclusive day count: up to 31 days is daily, 32-93 days is weekly, and 94 days or more is monthly.

The aggregation rules are:

| Selected span | Bucket | Label |
| --- | --- | --- |
| 1 month | day | `DD Mon` |
| 2-3 months | week | `DD Mon` using the week start |
| 4-12 months | month | `Mon YYYY` |

Weekly buckets use PostgreSQL `date_trunc('week', created_at)`, whose bucket begins on Monday. The dashboard payload adds `trend_granularity: "day" | "week" | "month"` so the frontend title is derived from backend behavior rather than duplicated date logic.

### Kabupaten/Kota metric breakdown

Replace the current ticket-total-only location rows with `TicketingLocationBreakdownItem` values containing:

- `label`;
- `takeover_tickets`;
- `visitation_tickets`;
- `backup_sukses_tickets`;
- `escalated_tickets`.

Each row groups by normalized `kabupaten_kota`. Counts use these rules:

- takeover: `UPPER(TRIM(takeover)) = 'TAKE OVER'`;
- visitation: `TRIM(visitation) = 'Visit site'`;
- backup sukses: `TRIM(backup_sukses) = 'BU Genset'`;
- escalate: `is_escalate IS TRUE`.

The query returns every Kabupaten/Kota row. Returning all four metrics in one response lets the dropdown switch instantly without refetching. The frontend sorts by the active metric, applies label as a deterministic tie-breaker, and displays the top 12 rows for that metric. This ensures each dropdown option shows its own true top Kabupaten/Kota values.

### FOP performance aggregation and scoring

The FOP query groups filtered rows by `TRIM(pic_take_over_ticket)` and excludes blank PIC values. Each result contains:

- takeover tickets;
- visitation tickets;
- backup-success tickets;
- average valid response minutes.

All nonblank PICs in the filtered result are ranked. Scoring is performed in a pure Python helper after the aggregate query so the normalization and tie behavior can be unit-tested without a database.

For each count metric, min-max normalization is:

```text
100 * (value - minimum) / (maximum - minimum)
```

For response speed, lower time is better:

```text
100 * (maximum_response - value) / (maximum_response - minimum_response)
```

If all values for a count component are equal and greater than zero, every PIC receives 100 for that component. If all count values are zero, every PIC receives 0 for that component. If all valid response values are equal, every PIC with that valid response receives 100 for the response component. A missing response time receives 0. Counts are always treated as zero or greater.

The final score is rounded to two decimals:

```text
performance_score =
  takeover_score * 0.50 +
  visitation_score * 0.30 +
  backup_score * 0.10 +
  response_speed_score * 0.10
```

Rows are sorted by:

1. performance score descending;
2. takeover tickets descending;
3. visitation tickets descending;
4. backup-success tickets descending;
5. average response minutes ascending, with null last;
6. PIC name ascending for deterministic output.

The backend assigns a one-based `rank` after sorting and returns the complete filtered list in `fop_performance`.

## Frontend Design

### Advanced filter

The filter popover replaces the SLA selector with a Takeover selector. Its state key, request parameter, option source, element ID, reset behavior, and filter chip all change to `takeover`. The label and reset copy use `Takeover` and `Semua Takeover`.

### Scorecards

The scorecard order swaps the existing component positions:

- `Manual Takeover` moves into the former `OUT SLA Rate` position;
- `OUT SLA Rate` moves into the former `Manual Takeover` position.

`Response P90` becomes `Average MTTR`, uses the existing hours formatter, and includes a help hint explaining that it averages valid nonnegative MTTR values in the active filter.

### Trend chart

The chart reads `trend_granularity` and renders one of:

- `Daily Trend Ticket by Kategori`;
- `Weekly Trend Ticket by Kategori`;
- `Monthly Trend Ticket by Kategori`.

The BPS and TS series, tooltip, legend, sizing, and empty state remain consistent with the current chart system.

### Kabupaten/Kota dropdown

The location chart panel header receives a compact accessible select control. The initial metric is Takeover. The four options map to the four numeric fields returned for each Kabupaten/Kota.

Changing the option sorts all location rows by the active metric, selects that metric's top 12, and updates the bar data key, legend/tooltip label, and chart accessibility label without a network request. The panel title remains `Kabupaten/Kota Distribution` so geography stays explicit.

### Desktop and mobile table layout

The current two-column section becomes:

```text
Desktop
+--------------------------------+--------------------------------------+
| Top Problem Sites              | Ticket List                          |
+--------------------------------+                                      |
| Performance Tim FOP            |                                      |
+--------------------------------+--------------------------------------+

Mobile
+--------------------------------+
| Top Problem Sites              |
+--------------------------------+
| Performance Tim FOP            |
+--------------------------------+
| Ticket List                    |
+--------------------------------+
```

This is implemented by wrapping the two left panels in a vertical stack while keeping Ticket List as the second desktop grid column. Ticket List keeps its own search, pagination, and loading behavior.

The FOP table columns are:

1. Rank;
2. PIC;
3. Performance Score;
4. Takeover;
5. Visitation;
6. Backup Sukses;
7. Average Response Time.

All ranked PICs are rendered in a bounded scroll area so the worst performer remains reachable without extending the page indefinitely. An empty table state appears when the filtered result has no nonblank PIC.

## Loading, Error, and Empty States

No new frontend request is introduced. Existing dashboard loading and error states cover the new aggregates.

- Null Average MTTR displays the standard empty-value marker.
- Empty trend or location data uses `DashboardChartEmpty`.
- Empty FOP results show a concise row-level empty state.
- Unknown or blank Kabupaten/Kota values use `Unknown`.
- The metric dropdown remains enabled when data is empty so the user can inspect all four modes consistently.

## Testing and Verification

### Backend tests

- Filter model and endpoint expose `takeover`, not the advanced `sla_status` option.
- The shared filter clause reaches dashboard, ticket list, and export paths.
- Average MTTR uses valid nonnegative `mttr` values.
- Trend helper resolves daily, weekly, and monthly buckets at the required boundaries.
- Trend SQL groups and labels by the selected bucket.
- Location query exposes all four requested counts.
- FOP aggregation excludes blank PICs and applies active filters.
- Pure scoring tests cover the 50:30:10:10 composition, inverse response scoring, equal-value ranges, missing response, tie-breakers, and deterministic ranks.

### Frontend tests

- Advanced filter labels, state, chip, ID, options, and API parameter use Takeover.
- Scorecard order is swapped and Average MTTR replaces Response P90.
- Trend title follows `trend_granularity`.
- Location dropdown exposes exactly four metrics and maps them to the correct data keys.
- FOP table columns and desktop/mobile layout contracts are present.
- No extra dashboard request is introduced.

### Runtime verification

1. Run targeted backend and frontend Ticketing tests.
2. Run the broader backend test suite relevant to router/model contracts.
3. Run scoped frontend lint and the production build.
4. Start backend and frontend locally with the required process-only development configuration.
5. Verify authenticated Ticketing rendering for one-month, two-to-three-month, and more-than-three-month filters.
6. Inspect each Kabupaten/Kota dropdown metric and compare representative counts with Neon.
7. Verify FOP ranking order and score values against an independent Neon aggregate/sample calculation.
8. Confirm the responsive left-stack/right-list layout at desktop and mobile widths.
9. Run `graphify update .` and verify `graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md` are refreshed.

## Scope Boundaries

- No Neon schema or source-data mutation.
- No change to SLA distribution visualization or SLA columns outside the removed advanced filter.
- No new pagination, search, or manual sorting for the FOP table.
- No redesign of unrelated Ticketing charts or dashboard pages.
- No GitHub push, pull request, or deployment unless requested separately.
