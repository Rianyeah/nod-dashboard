# Ticket TOTI Dashboard Design

**Status:** Approved on 2026-08-20

## Context

The existing Ticketing surface reports `public.ticketing_fault_center` at `/ticketing`. The requested enhancement adds a compact Ticket TOTI subpage backed by `public.ticket_toti` while keeping the existing Ticketing layout and interaction language.

A read-only Neon inspection on 2026-08-20 confirmed:

- `public.ticket_toti` contains 7,005 rows and 7,005 distinct nonblank ticket IDs.
- All 7,005 `tgl_request` values use the parseable `YYYY-MM-DD HH:MM:SS` form.
- 6,732 rows have a parseable `tgl_close`; 273 rows are not closed.
- No closed ticket has a negative `tgl_close - tgl_request` duration.
- Request dates span 2025-01-01 through 2026-07-30.
- The database category is `VANDALISM`; the dashboard label will be `Vandalisme`.
- NOP values contain both `NOP ...` and legacy `NSA ...` prefixes.

The source column is `tgl_close`. The user wording `tg_close` is interpreted as this existing database column.

## Goals

1. Change the existing Manual Takeover scorecard so percentage is the primary value and ticket-count comparison is the sub-label.
2. Add a route-addressable Ticket TOTI subpage under Ticketing.
3. Present four compact KPI cards, one combined trend chart, two distribution charts, and a paginated mini table.
4. Apply one consistent filter contract to KPI, chart, distribution, and table results.
5. Normalize legacy NSA labels to canonical NOP labels without changing Neon data.
6. Preserve the existing graphite dashboard design system, accessibility behavior, and responsive layout.

## Non-goals

- No Neon schema, index, or data mutation.
- No Ticket TOTI CSV export.
- No Ticket TOTI detail modal.
- No new top-level sidebar item.
- No redesign of the existing Ticketing dashboard.
- No unrelated refactoring of Ticketing, Overview, or reporting modules.

## Chosen Architecture

Use a route-separated subpage with shared Ticketing navigation.

- Existing page: `/ticketing`, labeled `Fault Center` in the local tab navigation.
- New page: `/ticketing/toti`, labeled `Ticket TOTI`.
- Sidebar remains a single `Ticketing` destination pointing to `/ticketing` and remains active for both routes.
- A focused `TicketingSectionNav` component renders the two route links on both pages.
- The new backend is isolated in `backend/routers/ticket_toti.py` and `backend/models/ticket_toti.py` rather than expanding the existing 890-line Ticketing router.
- The API prefix is `/api/v1/ticketing/toti`.

This architecture keeps the two source tables and their filter semantics independent while preserving a coherent Ticketing product area.

## Route and Navigation Behavior

The authenticated React route `/ticketing/toti` renders `TicketTotiPage`. The existing `/ticketing` route continues to render `TicketingPage`.

Both pages show a compact segmented navigation directly below the page identity area:

- `Fault Center`
- `Ticket TOTI`

The active item uses the existing primary red token and a clear `aria-current="page"` state. Keyboard focus follows the existing dashboard focus-ring treatment. On narrow viewports the two items remain on one row and may use the available width equally.

Breadcrumb mapping includes `toti: Ticket TOTI`, producing a Ticketing context rather than adding a separate global product name.

## Data Semantics

### Safe timestamp parsing

The table stores timestamps as text. Every query that depends on time uses a parsed base CTE:

- `requested_at` is produced only when trimmed `tgl_request` matches `YYYY-MM-DD HH:MM:SS`.
- `closed_at` is produced only when trimmed `tgl_close` matches the same form.
- Rows with invalid `requested_at` are excluded from period-based aggregates and lists rather than causing the endpoint to fail.
- A duration is valid only when both timestamps exist and `closed_at >= requested_at`.

All current rows satisfy the request timestamp rule, but the defensive contract protects future imports.

### Period identity

- All dashboard and table period filters use `requested_at`, sourced from `tgl_request`.
- Month mode accepts canonical `period_start=YYYY-MM` and `period_end=YYYY-MM`.
- Custom mode accepts inclusive `start_date=YYYY-MM-DD` and `end_date=YYYY-MM-DD`.
- The two period modes are mutually exclusive, matching the existing Ticketing contract.
- Default period is the latest available request month.
- A single selected month produces daily trend points.
- A multi-month range produces monthly trend points.
- Total-ticket comparison uses the immediately preceding period with the same number of calendar months or the same custom-date length.
- When the preceding period has zero tickets, the count delta is still returned and the percentage rate is `null` so the UI displays an unavailable comparison rather than dividing by zero.

### NOP normalization

NOP comparisons and response options use a canonical value:

- Trim and collapse surrounding whitespace.
- Replace a case-insensitive leading `NSA ` with `NOP `.
- Preserve an existing `NOP ` prefix.
- Return `Unknown` only when the value is blank for grouped display.

Therefore `NSA MALANG` and `NOP MALANG` both filter and aggregate as `NOP MALANG`. Normalization is query-time only.

### Category normalization

- Category matching is case-insensitive after trimming.
- Database value `VANDALISM` is returned with the display label `Vandalisme`.
- Other nonblank categories retain their source wording after trimming.
- Blank grouped values use `Unknown`.

### Duration display

The API returns `duration_seconds` for valid closed tickets and `null` for open or invalid tickets. The frontend formats valid values as compact Indonesian units, for example `4j 32m` or `2h 7j`. A row without `tgl_close` displays `Belum close`. A malformed or negative duration displays `-`.

## Backend API Contract

### `GET /ticketing/toti/filters`

Returns:

- `min_date`, `max_date`
- `default_start_date`, `default_end_date`
- `available_months`
- normalized `nops`
- `clusters`
- `mitras`
- display-ready `categories`
- `statuses`

Filter options are sorted, unique, and omit blank values.

### `GET /ticketing/toti/dashboard`

Accepts:

- one period mode
- optional `nop`
- optional `cluster`
- optional `mitra`
- optional `kategori`
- optional `status`

Returns:

- `summary.total_tickets`
- `summary.total_tickets_period_delta`
- `summary.total_tickets_period_rate`
- `summary.top_mitra.label`
- `summary.top_mitra.tickets`
- `summary.top_mitra.share`
- `summary.top_category.label`
- `summary.top_category.tickets`
- `summary.top_category.share`
- `summary.vandalism_tickets`
- `summary.vandalism_rate`
- `summary.last_updated_at`
- `trend_granularity`, either `day` or `month`
- `trend`, with `period`, `label`, `total`, and `vandalism`
- `cluster_distribution`
- `mitra_distribution`
- `period_meta`

Top-provider and top-category ties are deterministic: ticket count descending, then normalized label ascending.

Each distribution returns the ten highest groups and, when needed, one `Lainnya` row containing the sum of all remaining groups. Every item contains `label`, `tickets`, and `share`.

### `GET /ticketing/toti/tickets`

Accepts the dashboard filters plus:

- `q`
- `page`, default `1`
- `limit`, fixed by the frontend to `15` and bounded by the backend

Search covers ticket `id`, `siteid`, `sitename`, and `permasalahan` using case-insensitive matching.

Rows are sorted by `requested_at DESC`, then ticket `id DESC`. Each row returns:

- `siteid`
- `sitename`
- `id`
- `kategori`
- `sub_kategori`
- `permasalahan`
- `kondisi_site`
- `requested_at`
- `closed_at`
- `duration_seconds`

The response also contains `total`, `page`, `limit`, `total_pages`, and `period_meta`.

## Query and Caching Strategy

- Filters, dashboard, and table share one trusted parameter builder and one SQL filter-clause builder.
- SQL identifiers and sort expressions are fixed in source; user input is always a bound parameter.
- Dashboard aggregates execute as sequential session calls, avoiding concurrent operations on one `AsyncSession`.
- Filter and dashboard results use the existing Redis cache abstraction and scoped cache keys. Table search and pagination remain uncached.
- The current 7,005-row table does not justify an index or schema migration in this scope.

## Frontend Composition

`TicketTotiPage` follows the existing Ticketing page shell and uses focused feature modules:

- `TicketingSectionNav.jsx`: local route navigation shared by both Ticketing pages.
- `TicketTotiPage.jsx`: page state, filter state, request orchestration, and section composition.
- `TicketTotiCharts.jsx`: trend, Cluster distribution, and Tower Provider distribution.
- `TicketTotiTable.jsx`: search, row rendering, pagination, and scoped states.
- `ticketTotiUtils.js`: duration formatting and small deterministic presentation helpers.

The API service adds `fetchTicketTotiFilters`, `fetchTicketTotiDashboard`, and `fetchTicketTotiTickets`.

## Visual Layout

### Header and filters

The page header displays:

- title `Ticket TOTI`
- subtitle `Tower Operations Ticket Insight`
- last update timestamp
- local Ticketing tabs
- month/custom period mode
- period picker
- canonical NOP combobox
- advanced-filter popover for Cluster, Tower Provider, Kategori, and Status
- reset and refresh actions

There is no export action in this scope.

### Scorecards

Four cards use one responsive row at wide widths, two columns on medium widths, and one column on narrow screens.

1. `Total Ticket TOTI`
   - Primary: filtered ticket count.
   - Sub-label: signed count and percentage versus the equal preceding period.
2. `Top Tower Provider`
   - Primary: provider name.
   - Sub-label: `{tickets} ticket • {share}% dari total`.
3. `Kategori Terbanyak`
   - Primary: category label.
   - Sub-label: `{tickets} ticket • {share}% dari total`.
4. `Ticket Vandalisme`
   - Primary: vandalism ticket count.
   - Sub-label: `{share}% dari total ticket`.

Long primary labels truncate with a native title tooltip and must not expand the card height.

### Charts

The first chart spans the available width and uses a composed chart:

- bars for `Total Ticket TOTI`
- a line for `Vandalisme`
- one shared count axis because both series use the same unit
- tooltip and accessible chart labels from the existing dashboard primitives

Below it, Cluster and Tower Provider distributions render as two horizontal bar charts. They stack vertically below the desktop breakpoint. Both use the ten-plus-`Lainnya` contract to remain compact.

### Mini table

The table spans the page width below the charts and shows 15 rows per page. It has a sticky header, compact row height, horizontal scrolling on small screens, and these visible columns in order:

1. Site ID
2. Site Name
3. Nomor Ticket
4. Kategori
5. Sub Kategori
6. Permasalahan
7. Kondisi Site
8. Durasi

Long text uses ellipsis and a native title tooltip. Ticket ID and Site ID use tabular or mono treatment. No row opens a detail modal.

## Existing Manual Takeover Change

The `Manual Takeover` card on `/ticketing` changes from:

- primary ticket count
- percentage sub-label

to:

- primary `manual_takeover_rate` formatted as a percentage
- sub-label `{manual_takeover_tickets} dari {total_tickets} ticket`

No backend contract change is required because both fields already exist.

## Loading, Empty, and Error States

- Dashboard and table requests have independent loading and error state.
- Search and pagination never reload KPI cards or charts.
- Skeletons match the final card, chart, and table geometry to prevent layout shift.
- An empty filter result displays zeroed scorecards, empty charts, and `Tidak ada Ticket TOTI pada periode ini`.
- A failed module displays a contextual message and `Coba lagi` action without clearing the last successful result.
- Missing selected months are reported through the existing period-coverage alert pattern.
- Refresh retries filters, dashboard, and table without resetting the user's applied filters.

## Accessibility and Responsive Behavior

- Interactive elements are keyboard reachable and retain visible focus treatment.
- Route tabs expose the active page semantically.
- Charts use the existing Recharts accessibility layer and tooltip primitives.
- Color is not the only differentiator between Total and Vandalisme.
- Loading, error, and empty text is announced in the relevant page region.
- The layout remains usable at 390 px width without page-level horizontal overflow; only the table viewport scrolls horizontally.

## Testing Strategy

Implementation follows test-driven development.

Backend tests cover:

- NSA-to-NOP normalization and combined filtering
- strict timestamp parsing and invalid-row exclusion
- duration calculation for closed, open, malformed, and negative cases
- VANDALISM matching and Vandalisme display
- mutually exclusive period modes and latest-month defaults
- equal-period comparison
- top-provider and top-category deterministic ties
- top-ten plus `Lainnya` distribution aggregation
- consistent filters across dashboard and table
- search, ordering, pagination, and response models
- authenticated router registration

Frontend tests cover:

- `/ticketing/toti` route, shared tab navigation, breadcrumb, and sidebar behavior
- the three new API service functions
- four required scorecards and their primary/sub-label contracts
- combined trend and two distribution charts
- table columns, search isolation, 15-row pagination, and duration states
- responsive classes and scoped loading, error, retry, and empty states
- Manual Takeover percentage-first rendering

Runtime verification includes:

- complete backend and frontend test suites
- frontend lint and production build
- authenticated browser QA against live Neon-backed endpoints
- desktop and narrow viewport inspection
- NOP filtering that combines `NSA ...` and `NOP ...`
- one-month daily trend and multi-month monthly trend
- open ticket `Belum close` rendering
- `graphify update .` after material code changes

## Acceptance Criteria

The work is complete when:

1. Manual Takeover shows percentage first and `{takeover} dari {total} ticket` second.
2. `/ticketing/toti` is reachable through the Ticketing local navigation and remains inside the authenticated shell.
3. Every requested KPI, chart, distribution, and table column is visible and driven by filtered `public.ticket_toti` data.
4. Tower Provider and category cards show the winning label as primary, with count and share beneath it.
5. NSA and NOP variants aggregate and filter as one canonical NOP.
6. Vandalisme is computed from `VANDALISM` and labeled in Indonesian.
7. Closed duration equals `tgl_close - tgl_request`; open tickets display `Belum close`.
8. Dashboard and table request lifecycles are isolated.
9. Automated tests, lint, build, browser QA, and Graphify refresh succeed, with any unrelated baseline advisory reported separately.
