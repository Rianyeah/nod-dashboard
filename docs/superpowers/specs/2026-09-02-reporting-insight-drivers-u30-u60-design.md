# Reporting Insight Drivers and U30/U60 Trend Design

## Context

Network Reporting already exposes Regional Jatim and selected-NOP scorecards, Executive Insight, monthly performance trends, Kabupaten-to-site drill-down, dynamic pivots, effective-dated thresholds, source coverage, and revenue targets. The next revision must make the page more actionable without repeating information or adding visual noise.

The approved direction keeps the page focused on availability, payload, and revenue. It adds evidence-backed site drivers, deterministic improvement recommendations, inline MoM context, filter-aware grand totals, and a compact U30/U60 site trend.

## Goals

1. Remove Regional Jatim contribution copy from the top scorecards because the same context already belongs in Executive Insight.
2. Explain the selected scope's MoM direction using the site that contributed most strongly in the same direction.
3. Color Executive Insight cards by MoM direction with restrained, non-neon status surfaces.
4. Generate short, deterministic improvement recommendations from dashboard facts and an approved telecom action playbook.
5. Show revenue, payload, and availability MoM inline beside table values.
6. Add filter-aware grand totals to Kabupaten and site tables.
7. Add a monthly stacked U30/U60 site-count chart inside Performance Trend without materially increasing page length.

## Non-goals

- No free-form LLM or external AI service at runtime.
- No automatic root-cause claim from correlation alone.
- No automated network action, ticket creation, or closed-loop remediation.
- No replacement of the existing effective-dated threshold configuration.
- No change to pivot-table behavior in this revision.
- No new standalone dashboard section or additional full-width chart panel.

## Confirmed Product Decisions

- Availability changes are displayed with `%`, for example `+0,03%` and `-0,03%`. The internal value remains a signed difference between current and comparison availability values.
- Executive Insight recommendations are rules-first and auditable. An LLM may be considered later only as a wording layer, not as the decision-maker.
- U30/U60 uses a 70/30 split inside the existing Performance Trend panel on desktop. Tablet and mobile use a `Performance | U30 & U60` toggle.
- The U30/U60 chart renders only U30 and U60 segments. Achieved and unavailable counts remain available for reconciliation and empty-state decisions.
- Kabupaten grand total covers every area in the active page filter, independent of sorting and Top/Bottom display mode.
- Site grand total covers the full backend-filtered site universe, independent of pagination, sorting, and Top/Bottom display mode.
- Availability totals use duration/outage weighting. Availability is never averaged from displayed percentages.

## Data Contracts

### Metric driver

Each overview metric may expose one driver:

```text
ReportingMetricDriver
  site_id: string
  site_name: string | null
  current_value: number | null
  previous_value: number | null
  delta_value: number | null
  delta_pct: number | null
  contribution_pct: number | null
  outage_delta_minutes: number | null
```

`ReportingMetricFact` gains `driver: ReportingMetricDriver | null` and `recommendation: string | null`. The response contains computed evidence, not preformatted metric values. Indonesian formatting remains a frontend responsibility.

### Monthly U30/U60 trend

The existing trend item gains:

```text
u30_sites: integer | null
u60_sites: integer | null
achieved_sites: integer | null
unavailable_sites: integer
```

`null` means the category cannot be classified reliably for that month. It must not be converted to zero.

### Kabupaten comparison fields

Each Kabupaten row gains the underlying values needed for trustworthy totals:

```text
previous_revenue: integer
previous_payload: integer
previous_total_time_minutes: number
previous_outage_minutes: number
availability_delta_pct: number | null
```

Existing `revenue_delta_pct` and `payload_delta_pct` remain the canonical row-level MoM values.

### Site comparison and total fields

Each site row gains:

```text
previous_total_time_minutes: number
previous_outage_minutes: number
availability_delta_pct: number | null
```

The paginated site response gains a `grand_total` object containing site count, current and previous revenue/payload, current and previous availability inputs, and the three derived MoM values.

## Calculation Rules

### Aggregate direction

- Positive: signed MoM value is greater than zero.
- Negative: signed MoM value is less than zero.
- Stable: signed value is zero after calculation, without display rounding.
- Unavailable: current or valid comparison input is missing, or the comparison denominator required for percentage change is zero.

### Revenue and payload driver

For every site present in either the selected or comparison period:

1. Aggregate current and comparison facts over equivalent contiguous month ranges.
2. Calculate the signed nominal delta and the site MoM percentage when the comparison denominator is non-zero.
3. If the scope aggregate increased, select the largest positive nominal delta.
4. If the scope aggregate decreased, select the most negative nominal delta.
5. Calculate contribution to the aggregate change as `site_delta / aggregate_delta * 100` when both values have the same non-zero sign.
6. Do not select a contradictory driver from the opposite direction.

Nominal change is the ranking key. A tiny comparison baseline must not win solely because it produces an extreme percentage.

### Availability driver

Availability is non-additive, so percentage changes are not used as the ranking key.

1. Calculate weighted availability per site from total service minutes and outage minutes for both periods.
2. Calculate `availability_delta_pct = current_availability - previous_availability`.
3. Calculate `outage_delta_minutes = current_outage - previous_outage`.
4. When scope availability improves, select the site with the largest outage reduction.
5. When scope availability declines, select the site with the largest outage increase.
6. Display the site's availability change using `%`, and optionally include the outage-minute change as supporting evidence.
7. Calculate driver contribution from the same-direction outage change when a valid aggregate outage change exists.

This describes operational impact without claiming that outage alone proves a root cause.

### U30/U60 monthly classification

For each displayed trend month:

1. Sum revenue per site for that month inside the selected Regional/NOP scope.
2. Resolve the newest revenue thresholds whose `effective_month` is less than or equal to the fact month.
3. Classify revenue below the U30 upper bound as U30.
4. Classify revenue at or above the U30 upper bound and below the U60 upper bound as U60.
5. Classify revenue at or above the U60 upper bound as achieved.
6. Classify the site as unavailable when required revenue or threshold configuration is missing.

With the currently approved defaults, boundary behavior is:

- `29.999.999` is U30.
- `30.000.000` is U60.
- `59.999.999` is U60.
- `60.000.000` is achieved.

Historical months always use the threshold version effective in that month.

### Grand totals

Revenue, payload, traffic, ticket counts, activity counts, and site counts are summed from the full active filter universe. Rates are recomputed from their numerators and denominators.

Availability is recomputed as:

```text
(sum(total_time_minutes) - sum(outage_minutes))
/ sum(total_time_minutes)
* 100
```

MoM totals are recomputed from aggregate current and aggregate previous values. Row percentages are never summed or averaged.

## Deterministic Recommendation Engine

Recommendations are short operator-facing checks or actions. They must identify the observed trigger and must not assert an unverified cause.

Priority order:

1. Missing or partial evidence.
2. Availability deterioration or target miss.
3. Revenue deterioration.
4. Payload deterioration.
5. Cross-metric pattern.
6. Positive sustain/monitor condition.

Representative rules:

| Evidence | Recommendation intent |
| --- | --- |
| Comparison or threshold coverage incomplete | Complete the missing comparison/configuration before prioritizing sites. |
| Availability declines and outage increases | Prioritize the named driver site; review outage history, active tickets, power backup, and transport condition. |
| Availability improves but remains below its Site Class target | Preserve the improvement and continue remediation on sites still below target. |
| Revenue declines while payload is stable or increases | Review revenue mix and monetization at the named driver site; do not label this a network fault without supporting evidence. |
| Revenue and payload both decline with availability deterioration | Correlate the driver site with outage and ticket history before deciding the corrective action. |
| Payload increases while revenue declines | Review revenue per traffic and service mix at the named site. |
| U30/U60 population rises month over month | Prioritize newly degraded sites and the largest negative revenue drivers. |
| Metric improves and target is achieved | Maintain the operating pattern and monitor the leading driver for regression. |

Only one recommendation per metric card is rendered. Copy is functional, evidence-bound, and limited to two lines at the intended desktop width.

## UI Design

### Top scorecards

- Remove Regional Jatim contribution copy from Total Revenue, Total Payload, and Availability.
- Keep the main value, MoM, YTD, and existing primary detail.
- Total Site is unchanged.
- Do not leave an empty spacer where contribution copy previously appeared.

### Executive Insight

Card tone is based on MoM direction, not metric identity or target state:

- Positive: desaturated emerald surface tint and border.
- Negative: desaturated red/rose surface tint and border.
- Stable or unavailable: neutral slate surface and border.

There is no outer glow, neon fill, gradient, or animated pulse. Primary values remain the normal high-contrast text color. Status color is concentrated on the border, icon, label, and title. Target status remains visible in supporting copy even when its status differs from the MoM direction.

Content order:

1. Metric label and MoM condition.
2. Current value and signed MoM.
3. Primary site driver with site ID, signed metric change, and supporting nominal/outage change.
4. Contribution to Regional Jatim when a NOP is selected.
5. One deterministic recommendation.

### Performance Trend

Desktop uses a single chart panel with a 70/30 grid:

- Left: existing smooth revenue, payload, and availability trend.
- Right: monthly stacked U30/U60 bars.

U30 uses muted rose because it is the more critical revenue band. U60 uses muted amber. Colors remain distinguishable without relying on glow or high saturation.

The U30/U60 tooltip shows U30 count, U60 count, total at-risk count, and count change from the preceding displayed month. Achieved/unavailable may be shown as subdued reconciliation lines when present, but they are not stacked segments.

Below the desktop breakpoint, a segmented `Performance | U30 & U60` control switches between full-width charts without increasing panel height. Print rendering includes both charts.

### Kabupaten and site tables

MoM is rendered inside the same cell as the main value:

```text
Rp 94,4 M  +6,8%
21,4 PB    +1,1%
99,84%     -0,03%
```

- Positive values are green.
- Negative values are red.
- Stable or unavailable values are muted gray.
- Separate Revenue MoM and Payload MoM columns are removed from the site table.
- Mobile metric cards use the same inline or immediately-below treatment.

Grand total uses a distinct non-interactive table footer with a stronger top border, neutral background, and bold numeric values. It remains below the displayed rows but represents the full filter universe defined above.

## API and Query Flow

The overview loader remains the single source for scorecards, insights, and both trend charts. It resolves:

1. Selected, Regional, and comparison aggregates.
2. Site-level driver candidates for the selected and comparison periods.
3. Effective revenue thresholds for each trend month.
4. Monthly revenue-band counts.
5. Deterministic recommendations from the typed facts.

The existing overview cache key already includes metric-threshold and revenue-target versions. The response version must be bumped so old cache payloads cannot omit the new fields.

The Kabupaten endpoint returns expanded comparison inputs with each row. The frontend can calculate the Kabupaten grand total from the complete endpoint result because this endpoint is not paginated.

The site endpoint calculates its total in the backend using the filtered CTE before pagination. Search, Site Class, NOP, Kabupaten, target-status, and data-availability filters affect the total. Sorting, pagination, and Top/Bottom display mode do not.

## Empty and Error States

- Missing comparison or a zero percentage denominator renders `-`, neutral tone, no contradictory driver, and a data-completeness recommendation.
- Missing availability comparison renders `-`; it is not treated as stable.
- Missing monthly threshold renders the affected U30/U60 values as `null`, not zero.
- A U30/U60 chart with no classifiable month shows a compact inline empty state inside its 30% region.
- Driver selection returns `null` when no site changed in the aggregate direction.
- Grand total is absent during loading and error states; stale totals are not shown under a failed request.

## Testing Strategy

### Backend unit tests

- Aggregate direction and driver selection for positive, negative, stable, unavailable, and zero-baseline cases.
- Nominal-delta ranking prevents a tiny baseline with extreme percentage from becoming the primary driver.
- Availability driver selection follows same-direction outage impact.
- Recommendation priority and wording remain deterministic for the representative rule matrix.
- Weighted availability and aggregate MoM helpers use raw inputs, not row percentages.

### PostgreSQL numeric integration tests

- U30/U60 boundary values at `29.999.999`, `30.000.000`, `59.999.999`, and `60.000.000`.
- Two effective threshold versions classify their respective historical months correctly.
- Regional/NOP filters change monthly band counts and driver candidates correctly.
- Site grand total is identical across pagination pages and sorting directions.
- Site grand total changes when semantic filters change.
- Kabupaten and site availability comparison use duration/outage weighting.

### Frontend tests

- Scorecards do not contain Regional contribution copy.
- Executive Insight retains Regional contribution for a selected NOP.
- Insight tones follow positive, negative, neutral, and unavailable MoM directions.
- Availability changes are rendered with `%` and never `pp`.
- Driver and recommendation copy disappears cleanly when unavailable.
- Desktop renders the 70/30 chart composition; tablet/mobile renders the segmented toggle.
- U30/U60 tooltip formats counts and monthly changes.
- All three table metrics render inline MoM tone.
- Site table no longer renders separate Revenue MoM and Payload MoM headers.
- Grand total footer is non-interactive and uses the full provided total.

### Completion verification

- Focused backend and frontend tests during TDD cycles.
- Full backend suite, including PostgreSQL integration in CI.
- Full frontend Node tests, lint, production audit, and production build.
- Responsive browser checks for desktop, tablet/mobile toggle, side-sheet table, and print/PDF layout.
- Graphify update after material code changes.
- Reviewable feature branch and pull request; no direct write to `main`.

## Acceptance Criteria

1. No Regional Jatim contribution sub-label remains in the top scorecards.
2. Each available Executive Insight identifies a same-direction primary site driver and displays evidence.
3. Insight surface color follows MoM direction with no neon/glow treatment.
4. Every displayed recommendation is deterministic and traceable to current response facts.
5. Availability changes use the `%` symbol throughout this page.
6. Revenue, payload, and availability cells show inline MoM on Kabupaten, site, mobile, and total rows.
7. Kabupaten and site grand totals reconcile to the full active filter universe.
8. Performance Trend shows the approved desktop 70/30 composition and mobile toggle.
9. U30/U60 monthly counts use the threshold version effective in each month.
10. Missing comparison or threshold data is visibly unavailable and never silently converted to zero or stable.
