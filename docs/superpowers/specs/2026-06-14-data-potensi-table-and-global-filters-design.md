# Data Potensi Table and Global Filters Design

## Scope

- Make the Data Potensi table follow the Impact Service table interaction and component patterns.
- Replace page-local hover filters with a shadcn advanced-filter Popover.
- Apply NOP, Status Site, and every advanced filter to KPI cards, charts, and the site table.
- Keep free-text search specific to the site table.
- Move table filtering, sorting, and pagination to the backend.
- Fix responsive KPI layout, loading/error/empty states, and category normalization.

## Filter Contract

Global filters:

- `nop`
- `status_site`
- `cluster`
- `kabupaten`
- `site_class`
- `type_site`
- `transport_type`
- `type_battery`
- `tp`

The dashboard and site-table endpoints accept the same global filter fields. The site-table endpoint additionally accepts:

- `q`
- `page`
- `limit`
- `sort_by`
- `sort_dir`

The advanced-filter option endpoint returns complete option lists constrained by the current NOP and Status Site. This keeps every selected option available while advanced filters are being composed.

## Table UX

- Use the shared `DashboardTableToolbar`, `DashboardSearchInput`, `DashboardFilterPopover`, `DashboardFilterChips`, and `DashboardPagination` components.
- Use shadcn `Card`, `Table`, `Button`, `Badge`, `Tooltip`, `Skeleton`, and `Empty`.
- Search remains visible in the toolbar.
- Cluster, Kabupaten, Class, Type, Transport, Battery, and TP live in the advanced-filter Popover.
- The Popover uses draft values and only updates the dashboard after `Terapkan`.
- `Bersihkan` clears the draft; `Batal`, outside click, and Escape discard unapplied changes.
- A badge reports the number of active advanced filters.
- Applied filters appear as removable chips.
- Every search, filter, or sort change resets the table to page 1.
- Sorting is performed by a backend whitelist.
- Rows support mouse click, Enter, and Space to open site detail.

## Data and Error Handling

- Dashboard data remains visible if a refresh fails; an Alert explains the stale state.
- Table data remains visible if a table refresh fails; an Alert appears above the table.
- Initial KPI/chart loading uses Skeleton placeholders.
- Table loading uses Skeleton rows and no-data results use the shared Empty state.
- Equivalent missing-value labels such as `tidak ada`, blank values, and `#N/A` are normalized to `Tidak ada`.

## Responsive Behavior

- KPI cards use one column on narrow mobile, two columns from `sm`, and five columns from `xl`.
- Toolbar controls wrap on narrow screens.
- The table remains horizontally scrollable through the shared shadcn Table wrapper.
- Desktop and mobile retain the existing Data Potensi page hierarchy and dashboard theme.

## Verification

- Backend contract tests cover the shared global filters, filter options, normalized categories, and whitelisted server sorting.
- Frontend contract tests cover the extracted table module, advanced Popover, server parameters, page reset handlers, shadcn states, and responsive KPI grid.
- Browser QA covers desktop/mobile, advanced-filter apply/cancel, sorting, pagination reset, site detail keyboard interaction, light/dark theme, and console health.
