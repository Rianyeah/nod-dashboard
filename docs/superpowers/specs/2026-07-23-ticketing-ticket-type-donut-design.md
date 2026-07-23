# Ticketing Ticket Type Donut Design

## Goal

Add a `Tipe Ticket INAP` donut chart to the Ticketing dashboard. The chart compares Incident and Event ticket counts from `public.ticketing_fault_center.type_ticket`, follows every existing dashboard filter, and shares the current RC Category Pareto layout area without making the page unusable on narrower screens.

## Current-state audit

The Ticketing page is a dense operational dashboard with a dark theme, cyan primary accent, soft card radii, compact 12-pixel gaps, ten equal-weight scorecards, two chart rows, and table sections below them. The existing chart architecture already provides reusable panel, tooltip, legend, empty-state, donut-center, and color-token patterns.

The audit at a 1440-pixel viewport found four layout concerns:

1. The header combines update metadata, period controls, filters, reset, refresh, and export in one horizontal region. Some labels become compressed or truncated.
2. All ten scorecards have equal visual emphasis, which makes primary operational KPIs harder to distinguish from supporting metrics.
3. The first chart row is readable, but the `Visiting Site vs Backup Genset` title and legends are close to their minimum usable width.
4. RC Category Pareto is currently comfortable at half-row width. Reducing it directly to one quarter at every desktop width would make its six category labels difficult to scan.

This feature makes only the targeted chart and data-contract changes. The broader header and scorecard improvements remain recommendations rather than implementation scope.

## Verified data shape

A read-only database query on 23 July 2026 found exactly two normalized values in `type_ticket`:

- `INCIDENT`: 19,166 total rows and 1,317 rows in June 2026.
- `EVENT`: 17,007 total rows and 452 rows in June 2026.

No blank or additional normalized values were present. The implementation still normalizes labels with `UPPER(TRIM(type_ticket))` so casing and surrounding whitespace cannot split a category.

## Approved layout

The second chart row uses a responsive hybrid grid:

- At viewport widths of 1536 pixels and above: `2fr 1fr 1fr`, producing Kabupaten/Kota at 50 percent, RC Category Pareto at 25 percent, and Tipe Ticket INAP at 25 percent.
- From 1280 through 1535 pixels: three equal columns. This protects RC Category Pareto from the narrowest quarter-width presentation on common laptop screens.
- Below 1280 pixels: one column, preserving chart order as Kabupaten/Kota, RC Category Pareto, then Tipe Ticket INAP.

All three panels keep the established 220-pixel chart height and existing `DashboardChartPanel` surface treatment. No new design system or chart dependency is introduced.

## Donut presentation

The panel title is exactly `Tipe Ticket INAP`.

The donut follows the established SLA distribution pattern:

- Incident and Event appear as two donut segments.
- The center label shows the combined Incident plus Event total and the caption `Total`.
- The chart uses a compact vertical composition inside the narrow panel: a centered donut occupies the upper area, followed by two full-width legend rows below it.
- Each legend row lists `Incident` or `Event`, its count, and its percentage of the two-category total. This layout does not depend on enough width for a side-by-side chart and legend.
- Incident uses the existing primary cyan chart token.
- Event uses the existing amber chart token.
- Hover and keyboard focus expand the active segment using the current active-pie treatment.
- The shared tooltip exposes the normalized label, ticket count, and percentage.
- An empty or all-zero response renders the existing `DashboardChartEmpty` component.

The chart is informational and does not introduce click-to-filter behavior.

## Backend contract and data flow

`GET /api/v1/ticketing/dashboard` adds a `type_ticket_distribution` array. Each item uses the existing distribution shape with at least `label` and `tickets`.

The query:

1. Reads from `public.ticketing_fault_center`.
2. Applies the same generated `filter_clause` and parameters as all other Ticketing dashboard queries.
3. Normalizes `type_ticket` with `UPPER(TRIM(type_ticket))`.
4. Includes only normalized `INCIDENT` and `EVENT` rows.
5. Returns both categories in a deterministic Incident-then-Event order, including a zero count when one category is absent from a filtered period.
6. Maps API labels to the display strings `Incident` and `Event`.

Because the aggregation is part of the existing dashboard response, period, custom date, NOP, cluster, ticket category, SLA status, ticket status, backup status, RC category, and escalation filters automatically affect the donut.

## Frontend component changes

`TicketingCharts` reads `dashboard.type_ticket_distribution`, calculates the two-category total and percentages, and renders the new panel in the approved responsive grid.

The implementation reuses the current donut-center and active-segment behavior rather than introducing a second donut implementation with different interaction rules. Ticket-type colors are added to `ticketingChartConfig` so Recharts, the tooltip, and the legend share one source of truth.

To keep RC Category Pareto readable in its reduced-width layouts, its visible x-axis tick text is capped at ten characters with an ellipsis. The underlying category label is not renamed: the complete business label remains in the chart data, tooltip, and accessible SVG title.

The existing chart order, RC Pareto data, Kabupaten/Kota data, titles, filter behavior, and table behavior remain unchanged.

## Loading, empty, and error behavior

- While the dashboard request is loading, the page retains its existing loading overlay behavior.
- When `type_ticket_distribution` is empty or totals zero, the new panel displays `DashboardChartEmpty`.
- Dashboard request failures continue to use the page-level Ticketing error message.
- Missing `type_ticket_distribution` in a temporarily stale response is treated as an empty array and does not crash rendering.

## Accessibility and responsive behavior

- The PieChart keeps Recharts `accessibilityLayer` enabled.
- Each segment remains keyboard focusable and receives the same active visual treatment on focus and hover.
- The legend conveys category names and exact numeric values without relying on color alone.
- The donut and legend stack vertically, so neither component depends on a minimum side-by-side width.
- Compact Pareto tick labels retain their complete value in the tooltip and accessible title.
- The two colors use existing theme tokens that already support the dashboard's dark and light modes.
- The layout collapses to one column below 1280 pixels, avoiding horizontal scrolling.
- Motion remains limited to direct hover and focus feedback, consistent with the dashboard's low-motion operational design.

## Testing and verification

Backend coverage will verify:

- the model exposes `type_ticket_distribution`;
- the query references `type_ticket`, normalizes casing and whitespace, applies the shared filter clause, and emits Incident and Event in deterministic order;
- the dashboard handler executes the new query and returns its result.

Frontend coverage will verify:

- the title `Tipe Ticket INAP` and a dedicated chart test ID exist;
- the donut reads `type_ticket_distribution` and renders Incident and Event;
- the donut uses the narrow-panel vertical composition and exposes counts plus percentages;
- the RC Pareto x-axis compacts long visual labels without changing the full source label;
- the responsive grid contains the approved wide-desktop `2fr 1fr 1fr`, laptop equal-thirds, and single-column behavior;
- the existing RC Pareto, Kabupaten/Kota, tooltip, accessibility, and 220-pixel height contracts remain intact.

Final verification will run the focused backend and frontend contract tests, the broader relevant test suites, a production frontend build, and an authenticated browser check at desktop and mobile widths. The browser check will confirm live Incident and Event counts match the dashboard API for the selected period.

## Out of scope

- Adding `type_ticket` as a new user-selectable dashboard filter.
- Clicking donut segments to filter tables or other charts.
- Changing the existing Ticket List columns or ticket-detail modal.
- Redesigning the header filter bar or changing scorecard hierarchy.
- Adding new chart libraries, icon libraries, theme colors, or animation dependencies.
