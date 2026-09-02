# Network Reporting Revenue Band and XLSX Export Design

**Date:** 2026-09-02
**Status:** Approved for implementation
**Scope:** Network Reporting only

## Objective

Make multi-period Network Reporting reliable and analysis-ready by centralizing
U30/U60/Achieved classification in the backend, exposing the same rules to the
area table and site drawer, and providing genuine XLSX exports for the area/site
and pivot analyses.

## Approved business rules

Revenue bands use the effective revenue thresholds for each month:

- `U30`: monthly revenue is below the effective U30 threshold.
- `U60`: monthly revenue is at least U30 and below the effective U60 threshold.
- `Achieved`: monthly revenue is at least the effective U60 threshold.
- `Unavailable`: required revenue data or an effective threshold is unavailable.

For a selected range containing more than one month, a site receives one
conservative range classification:

- `U30` when any selected month is U30.
- Otherwise `U60` when any selected month is U60.
- Otherwise `Achieved` only when every selected month is Achieved.
- Otherwise `Unavailable`.

The comparison period has the same number of months immediately before the
selected range. U30 and U60 MoM values are calculated from the current and
comparison counts. A zero comparison count produces `null`, not an invented
percentage. Grand-total percentages are recalculated from summed counts.

## Backend contracts

### Area analysis

`ReportingAreaRow` gains:

- `u30_sites`, `previous_u30_sites`, `u30_mom_pct`
- `u60_sites`, `previous_u60_sites`, `u60_mom_pct`

The area aggregation classifies each site-month against the threshold effective
for that month, collapses it to one range classification, and aggregates the
site counts by Kabupaten. Missing months and thresholds stay unavailable and do
not silently enter U30 or U60.

### Site drill-down

`ReportingSiteQuery` gains an independent `revenue_band` filter with values
`all`, `u30`, `u60`, `achieved`, and `unavailable`. The existing Target Achieved
filter remains unchanged because it represents the combined availability,
payload, and revenue target result.

The Status column is a presentation of `revenue_band`, not the operational
`status_site`. Sorting the Status column therefore sorts by revenue-band
severity: U30, U60, Achieved, Unavailable. The source operational status remains
available in the backend row for other consumers.

### Overview latency

The overview facts that do not depend on one another run concurrently on
separate `AsyncSession` instances created by the application session factory.
An `AsyncSession` is never shared by concurrent tasks. Tests and callers that do
not provide a session factory retain a sequential compatibility path.

The frontend Reporting overview request gets a 60-second request timeout as a
safety margin. This is not the primary fix; backend concurrency is responsible
for reducing first-load latency.

### XLSX endpoints

Two authenticated endpoints are added:

- `GET /reporting/export/areas.xlsx` with the canonical period and NOP query
  parameters.
- `POST /reporting/export/pivot.xlsx` with the same validated specification as
  `/reporting/pivot`.

The area export is set-based and independent of UI pagination. It contains:

- `Kabupaten`: all area rows for the selected scope and period.
- `Site`: every matching site row for the same scope and period.

The pivot export calls the existing pivot execution path so the workbook cannot
diverge from the web result.

Workbooks use typed numeric cells, explicit number formats, a compact metadata
section, frozen headers, filters, restrained header styling, readable column
widths, and deterministic sheet/file names. No new frontend XLSX dependency is
introduced.

## Frontend behavior

- Sidebar navigation label becomes `Network Reporting`.
- The U30/U60 tooltip displays U30, U60, and Achieved. `At risk` is removed.
- The area table title includes the full Indonesian period, for example
  `Kabupaten & Site Agustus 2026` or
  `Kabupaten & Site Mei - Agustus 2026`.
- U30 and U60 columns appear immediately after Site. Each cell shows the count
  and a small signed comparison percentage.
- Every area-table header remains sortable. U30 and U60 sort by count.
- The site drawer adds U30 and U60 shortcuts after Bottom 10 and displays
  U30/U60/Achieved/Unavailable in Status.
- The area and pivot panels each expose one `Download XLSX` action with loading,
  disabled, and failure feedback.

## Error and download behavior

- User-cancelled requests remain silent.
- Overview failures retain the current inline error surface, but valid
  multi-month and Semester 1 requests must no longer fail due to the default
  30-second Axios timeout.
- A failed export does not replace current table data. The button returns to an
  enabled state and shows a concise inline error.
- Blob URLs are revoked after download.

## Verification

- Unit tests cover conservative range classification, equal-window comparison,
  zero-denominator MoM, total recomputation, site filter validation, period copy,
  and download helpers.
- PostgreSQL integration tests verify numeric counts for single- and multi-month
  windows with effective historical thresholds.
- XLSX round-trip tests open the generated bytes and verify sheet names, headers,
  typed cells, filters, frozen panes, and full unpaginated site rows.
- Browser QA covers desktop and mobile Reporting, Semester 1, U30/U60 shortcuts,
  sorting, and both downloads.
