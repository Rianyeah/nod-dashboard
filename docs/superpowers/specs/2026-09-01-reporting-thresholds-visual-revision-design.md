# Network Reporting Threshold and Visual Revision Design

## Objective

Revise PR #40 so Network Reporting regains the richer scorecard, Executive
Insight, and smooth chart presentation shown in the approved reference while
retaining the new Regional Jatim reconciliation, coverage, Kabupaten-to-site
drill-down, and dynamic pivot capabilities.

The same change adds effective-dated Reporting threshold management. Thresholds
must be editable from Management Data, must not rewrite historical target
interpretation, and must drive site-level Target Achieved filtering.

## Confirmed Business Rules

### Geographic scope

- Site-performance thresholds are Regional Jatim rules.
- The same rules apply in every NOP and Kabupaten/Kota.
- Availability varies by Site Class, not by NOP or Kabupaten/Kota.
- Site Class comparisons are case-insensitive and use normalized uppercase
  values.

### Availability targets

| Site Class | Minimum cell-based availability |
|---|---:|
| Diamond | 99.87% |
| Platinum | 99.73% |
| Gold | 99.68% |
| Silver | 99.67% |
| Bronze | 99.73% |

A site meets its availability target when its weighted availability is greater
than or equal to the configured target for its Site Class. A missing Site Class,
missing availability, or missing applicable threshold produces an unavailable
target status rather than silently using a fallback class.

### Revenue thresholds

Revenue thresholds classify one site's monthly revenue:

- `U30`: revenue below Rp30,000,000.
- `U60`: revenue from Rp30,000,000 up to but excluding Rp60,000,000.
- `Achieved`: revenue greater than or equal to Rp60,000,000.

The exact Rp60,000,000 boundary is Achieved so every non-negative value belongs
to one category.

### Payload target

A site meets its payload target at 15 TB or more per month. Source payload is
stored in MB. Configuration is presented and stored as a human-readable TB
value, while comparison converts it using the dashboard's existing binary unit
contract:

```text
1 TB = 1,024 * 1,024 MB
```

### Overall Target Achieved status

For one month, a site is `achieved` only when availability, revenue, and payload
all meet their applicable targets.

Status precedence is:

1. `unavailable` when any required source value, Site Class, or threshold is
   missing;
2. `achieved` when every metric is achieved;
3. `not_achieved` otherwise.

For a multi-month reporting range, metric thresholds are resolved independently
for every active month. The period is Achieved only when every active month is
Achieved. Revenue classification uses the worst monthly band in the range, so a
range containing U30 is U30 even when another month is Achieved. This preserves
the stated monthly meaning of the thresholds.

## Effective-Dated Configuration

Threshold changes take effect from a selected `effective_month`. They do not
modify or delete prior versions. For a reporting month, the applicable value is
the newest configuration whose effective month is less than or equal to that
month.

The initial configuration is seeded at the earliest valid month available in
`traktor_data`, making the approved baseline available to the current reporting
history. Future changes insert a new effective version.

### Storage model

Add `public.reporting_metric_thresholds` with the following fields:

- `metric`: `availability`, `revenue`, or `payload`;
- `threshold_key`: `target`, `u30_upper`, or `u60_upper` as allowed by metric;
- `site_class`: normalized Site Class for availability and `*` for global
  revenue/payload rules;
- `effective_month`: canonical `YYYY-MM`;
- `threshold_value`: non-negative numeric value in the declared display unit;
- `unit`: `percent`, `idr`, or `tb`;
- `updated_by`, `updated_at` for accountability.

The primary key is `(metric, threshold_key, site_class, effective_month)`.
Database checks constrain metric/key/unit combinations. API validation adds the
cross-field rules that U30 must be lower than U60 and percentage targets cannot
exceed 100.

The existing `reporting_revenue_targets` table remains the monthly aggregate NOP
target used by Executive Insight. It is not replaced by site revenue bands.

## Management Data Experience

Add a `Threshold Configuration` section to the existing authenticated
Management Data page. It uses the existing `management_data:write` permission,
so `data_admin` and `sysadmin` can edit while viewers cannot enter the page.

The section contains two explicit groups:

1. **Site performance thresholds**
   - effective month picker;
   - five availability inputs, one for each approved Site Class;
   - U30 and U60 revenue boundaries in rupiah;
   - monthly payload target in TB;
   - current effective values and latest update metadata.
2. **Monthly NOP revenue target**
   - NOP, month, target revenue, and optional note;
   - uses the existing `reporting_revenue_targets` rows;
   - exposes the configuration that already drives Executive Insight rather
     than leaving it editable only through SQL.

Saving one site-threshold version is atomic: all required availability,
revenue, and payload rows for the chosen month are written in one transaction.
Validation errors are shown next to the affected field and no partial version
is retained. Re-saving the same effective month updates that version; saving a
later month creates a new historical version.

### Management API

Add permission-protected endpoints under `/api/v1/management-data`:

- `GET /reporting-thresholds?effective_month=YYYY-MM` returns the resolved
  site-threshold snapshot plus the source version metadata;
- `PUT /reporting-thresholds/{effective_month}` validates and atomically saves
  a complete threshold version;
- `GET /reporting-revenue-targets` lists monthly NOP target rows with bounded
  filters;
- `PUT /reporting-revenue-targets/{nop}/{trx_month}` upserts one monthly NOP
  target and note.

Every write records the authenticated username. No endpoint accepts a table
name, SQL fragment, arbitrary metric, or arbitrary threshold key.

## Reporting Backend Contract

### Scorecards

Extend `ReportingOverviewScorecards` with:

- `epm_sites`;
- `non_epm_sites`;
- `revenue_ytd`;
- `payload_ytd`.

EPM and non-EPM counts use the exact same distinct selected reporting-site
universe as `total_sites`; EPM is identified by normalized Site ID prefix
`EPM`. The invariant must hold:

```text
total_sites = epm_sites + non_epm_sites
```

YTD values apply the selected NOP/Regional scope and sum January through the
selected period end.

### Threshold snapshot

The overview response includes the resolved site-threshold snapshot so visible
target wording never relies on duplicated frontend constants. Threshold version
metadata participates in Reporting cache identity and invalidation.

The aggregate NOP revenue target remains in `overview.revenue.target`.

### Site drill-down

Each `ReportingSiteRow` adds:

- `availability_target` and `availability_target_status`;
- `revenue_band` and `revenue_target_status`;
- `payload_target_tb` and `payload_target_status`;
- `overall_target_status`.

`ReportingSiteQuery` replaces the `sla` filter with `target_status` supporting:

- `all`;
- `achieved`;
- `not_achieved`;
- `unavailable`.

The filter is evaluated in SQL before pagination and ranking. Sorting remains
server-side for the site drill-down. Sort fields include every visible desktop
column: Site, Class, Status, Revenue, Revenue MoM, Payload, Payload MoM, and
Availability.

## Reporting Presentation

### Top scorecards

Restore the approved richer content hierarchy and semantic value colors:

- Total Site: EPM and non-EPM counts;
- Revenue: selected value, relative comparison, YTD, and Regional contribution;
- Payload: selected value, relative comparison, YTD, and Regional contribution;
- Availability: selected value, relative comparison, Regional difference in
  percentage points, and Regional outage contribution.

For a selected NOP, revenue wording follows this format:

```text
Kontribusi NOP SIDOARJO Rp 92,0 M / 17,6% pada Regional Jatim.
```

Payload uses the same sentence structure. Availability must not divide one
availability percentage by another. It states the percentage-point difference
and contribution to Regional outage minutes. Regional Jatim selection omits the
redundant contribution sentence.

### Executive Insight

Restore the previous three-card panel treatment:

- one outer graphite panel with period and scope;
- three softly tinted semantic cards;
- concise category label, informative title, metric summary, detail, and one
  small status chip;
- contribution is retained as the final data line for Revenue, Availability,
  and Payload;
- no `Auto-generated`, AI attribution, decorative filler, or redundant
  sub-label.

Revenue insight uses the monthly aggregate NOP target. Availability insight uses
the configured Site Class targets for target-achievement context and retains the
Regional weighted comparison. Payload insight uses the configured monthly
threshold instead of describing the metric as generic capacity.

### Performance Trend

Use the existing Recharts stack and dashboard color tokens. Restore a smooth,
restrained presentation with:

- `monotone` curves;
- subtle Revenue and Payload gradient fills;
- a clear amber Availability line;
- small dots only at observed points;
- readable Revenue, Payload, and Availability axes;
- no decorative animation that changes data interpretation.

The result should visually follow the supplied reference while remaining
responsive and compatible with print export.

## Kabupaten and Site Table Interaction

### Kabupaten table

- Remove the SLA badge.
- Remove the `Urutkan` dropdown.
- Keep Semua, Top 10, and Bottom 10 controls.
- Make every desktop table header sortable.
- The currently active header becomes the Top/Bottom ranking metric.
- Composite columns use explicit deterministic values:
  - Ticket / Backup sorts by total BPS + TS tickets;
  - Proker sorts by total open + closed activities.
- Null values are always placed last and identity is the deterministic tie
  breaker.

### Site sidebar

- Remove the `Urutkan` dropdown and SLA badges.
- Replace the SLA filter with `Target Achieved` using the four statuses defined
  above.
- Make every desktop header sortable and send the active field/direction to the
  backend.
- Top/Bottom uses the active header as `rank_metric`.
- Mobile cards preserve the prioritized Revenue, Payload, and Availability
  metrics and expose plain target-status text without a decorative badge.

## Pivot Sorting

Every rendered pivot result header is clickable. Sorting is applied to the
already returned cross-tab rows and does not issue a new backend request.

Rules:

- clicking a different header starts descending for numeric metrics and
  ascending for text dimensions;
- clicking the active header toggles direction;
- numeric comparison uses unformatted source numbers;
- text uses Indonesian locale comparison;
- null or unavailable values are always last;
- the first row dimension is the deterministic tie breaker.

Existing pivot row, column, value, month, and cell-count guardrails remain
unchanged.

## Coverage, Cache, and Refresh

- `reporting_metric_thresholds` is registered in source refresh tracking.
- Coverage exposes threshold configuration with last update metadata.
- Reporting cache keys include both the aggregate NOP revenue-target version and
  metric-threshold version.
- A Management Data threshold write invalidates subsequent Reporting reads via
  version change; no application restart is required.

## Testing Strategy

### Backend unit and contract tests

- schema parsing and idempotent seed statements;
- threshold resolution by effective month;
- validation for Site Class, units, percentages, U30/U60 order, and payload;
- Management Data permission enforcement and atomic upserts;
- scorecard EPM/non-EPM invariant and YTD range;
- boundary tests at Rp30,000,000, Rp60,000,000, and 15 TB;
- Site Class availability boundaries for all five classes;
- missing data/config precedence;
- multi-month effective-version evaluation;
- target filtering before pagination;
- numeric integration reconciliation against real PostgreSQL.

### Frontend tests

- restored scorecard content and Regional contribution wording;
- availability contribution remains percentage-point/outage based;
- Executive Insight panel structure and removal of AI attribution;
- monotone chart and gradient contracts;
- removal of SLA badges and `Urutkan` dropdowns;
- all Kabupaten and Site headers drive sorting;
- Target Achieved filter values and query mapping;
- every pivot result header sorts with stable null-last behavior;
- Threshold Configuration load, validation, save, permissions, and error states;
- desktop table and mobile-card contracts.

### Runtime QA

- dark and light theme at desktop widths;
- Reporting at a mobile width, including site sidebar cards;
- Management Data threshold editing with an authenticated data admin;
- exact threshold-boundary fixtures;
- browser console and failed-request inspection;
- print preview remains readable.

## Deployment and Migration

The existing Reporting foundation startup remains the idempotent deployment
path. It creates the new table and baseline configuration before Reporting
serves requests. Existing `reporting_revenue_targets` rows are preserved.

Deployment order:

1. deploy backend schema and API;
2. verify baseline threshold rows and Management Data permissions;
3. deploy frontend consumers;
4. run numeric integration checks;
5. verify Reporting and Management Data in the deployed environment.

No production data mutation is performed from the development worktree.

## Scope Boundaries

This revision does not:

- create per-NOP or per-Kabupaten availability thresholds;
- create per-site manually entered revenue or payload targets;
- replace the aggregate monthly NOP revenue target with site revenue bands;
- retroactively rewrite a threshold version when a later version is saved;
- add new datasets or remove the existing pivot guardrails;
- add AI-generated prose or visual decoration unrelated to data state.
