# Site Map Spatial Explorer Design

**Date:** 2026-08-30
**Status:** Proposed for implementation
**Branch:** `codex/site-map-spatial-explorer`
**Base:** `origin/main` at `fd90a4d` (merged PR #38 Auto LOD)

## Goal

Refocus Site Map as a fast spatial exploration workspace instead of repeating Home summary cards and a permanently visible reporting table. A single shareable state must drive the map markers, sector viewport, contextual counts, selected-site inspector, and paginated results.

## Product decisions

### Chosen approach: map-first spatial explorer

Use the existing Site Map route and Mapbox implementation, but replace the summary sidebar and large Mapbox popup with a React inspector, a compact explorer toolbar, and a collapsible results drawer. This keeps the proven Auto LOD work from PR #38 and removes duplicated Home content without creating a second mapping subsystem.

### Alternatives considered

1. **Layout-only cleanup.** Removing `SummaryCards` and shrinking the table would be quick, but marker, polygon, count, and table filters would still disagree. Rejected because it treats the visible symptom rather than the data-flow problem.
2. **Map-first spatial explorer.** Unify state and API filters, then reorganize existing capabilities around the map. Chosen because it fixes correctness and hierarchy while reusing Mapbox, `SiteDetailModal`, and existing dashboard controls.
3. **New GIS/MVT application.** A separate tile-driven subsystem would scale furthest, but duplicates routing and selection behavior and belongs to the measured PR 3 follow-up. Deferred.

## Scope

### Included

- Remove the Site Map `SummaryCards` sidebar.
- Add a compact toolbar for site search and Kabupaten, Cluster, and Kelas Site filters. Period and NOP remain in the existing shared `Header` to avoid a second copy of the same controls.
- Make one filter object drive marker data, sector viewport data, result rows, and contextual counts.
- Replace the large draggable Mapbox popup and floating neighbor cards with a stable selected-site inspector.
- Replace the permanently expanded table with a collapsible results drawer.
- Move table sorting to a safe server-side whitelist.
- Synchronize supported explorer state with the URL.
- Add contextual actions for full detail, Data Potensi, and RF Tilt.
- Provide desktop and mobile layouts using existing NOD tokens and components.

### Excluded

- MVT/vector-tile delivery, materialized PostGIS geometry, or new tile infrastructure.
- New charts or KPI scorecards on Site Map.
- Changes to availability, outage, RF engineering, or Data Potensi business calculations.
- Replacing the shared `SiteDetailModal` or `siteDetailBundle` contract.
- Cascading filter-option queries. Options remain global in this PR; selected values still apply consistently to all explorer data.

### Relationship to the original PR 3

PR #38 already delivered the first PR 3 stage: bounded `bbox + zoom` requests, Auto LOD, debounced/stale-request cancellation, spatial intersection queries, and hard feature limits. PR 2 completes that GeoJSON path by applying every Spatial Explorer filter to the bounded sector request and by verifying payload, latency, and interaction behavior in the integrated layout.

MVT is no longer an automatic PR 3 requirement. It becomes a separate follow-up only if the completed Spatial Explorer still exceeds any measured guardrail:

- normal viewport payload is `>= 1 MB`;
- normal viewport response time is `>= 1 second`; or
- browser QA still shows visible pan/zoom stalls attributable to sector transfer, parsing, or `setData`.

If all three guardrails pass, GeoJSON Auto LOD remains the production architecture and no MVT work is added.

## Experience architecture

### Desktop

```text
[ Shared Header: Period + NOP ]
[ Search site | Kabupaten | Cluster | Kelas | Reset ]
[ Filtered sites | With coordinates | Selected site | Sector status ]

[                       Map (flex) ][ Inspector 300-340 px ]
[              Collapsible filtered-results drawer             ]
```

- The map remains the dominant surface.
- The inspector is visible as an empty instructional state until a site is selected.
- The results drawer is collapsed by default and remembers only in-session UI state, not URL state.
- Opening or closing the drawer triggers a Mapbox resize; resizing by pointer is removed.

### Mobile

- The toolbar wraps into compact controls without horizontal page scrolling.
- The map remains the first content surface with a stable minimum height.
- Site selection opens the inspector in the existing bottom-sheet primitive.
- Results open as a separate bottom sheet/drawer; the inspector and results sheet are never open simultaneously.
- Map controls retain reachable touch targets and are not covered by the collapsed results handle.

### Visual language

- Preserve the existing Matte Graphite and Telkomsel Red Edge token system.
- Use borders, spacing, and typography for hierarchy; do not add decorative gradients, generic glass cards, or new accent families.
- Use the existing Lucide icon family and existing dashboard/shadcn primitives.
- Status color remains semantic: marker availability and sector bands keep their established meanings.

## Unified explorer state

The canonical state is:

```js
{
  bulan: number | null,
  tahun: number | null,
  nop: string | null,
  kabupaten: string | null,
  cluster: string | null,
  kelas: string | null,
  q: string,
  site: string | null,
}
```

Rules:

- Empty strings and the dashboard all-option sentinel normalize to `null` before API calls or URL writes.
- Search is trimmed and debounced by 300 ms before network requests and URL replacement.
- Changing any data filter resets results pagination to page 1.
- Selecting a site writes `site` to the URL with `replace: true`; ordinary filter edits also replace rather than create a browser-history entry per keystroke.
- When `bulan` and `tahun` are absent, latest-period resolution remains authoritative and the resolved values are then reflected in the canonical URL.
- Supported URL keys are `bulan`, `tahun`, `nop`, `kabupaten`, `cluster`, `kelas`, `q`, and `site`. Unknown keys are preserved.
- Invalid month/year values are ignored. Site IDs are trimmed and normalized to uppercase.
- A selected site outside the active result filter may still be loaded by exact ID for the inspector and focus overlay. The inspector labels it as outside the active filters and offers a clear-filter action; it is not added to filtered counts.

Examples:

- `/site-map?site=BGL001`
- `/site-map?nop=SIDOARJO&kabupaten=KABUPATEN+SIDOARJO`
- `/site-map?tahun=2026&bulan=8&cluster=PASURUAN&q=PSR`

## Backend contracts

### `GET /api/v1/map/sites`

Accept:

- required `bulan`, `tahun`;
- optional `nop`, `kabupaten`, `cluster`, `kelas`, `status`, and `q`.

Return:

```json
{
  "data": [],
  "total": 1079,
  "with_coordinates": 1074
}
```

- `data` contains only sites with valid coordinates and monthly metrics, suitable for Mapbox markers.
- `total` counts monthly sites matching the same filters, including sites without valid coordinates.
- `with_coordinates` counts the marker-eligible subset and normally equals `data.length`.
- The endpoint reuses the same safe master-data filter and search builders as `/sites`; filter SQL must not be duplicated in the router.

### `GET /api/v1/sites`

Add optional `sort_by` and `sort_dir`.

- Allowed `sort_by`: `site_id`, `site_name`, `kabupaten`, `site_class`, `jumlah_cell`, `avg_availability`, `total_outage_menit`, `rca_dominan`, `status_site`.
- Allowed `sort_dir`: `asc`, `desc`.
- Default: `site_id asc`.
- SQL column expressions come only from a server-owned dictionary. User input is never interpolated directly.
- Nulls sort last in both directions; `site_id asc` is the deterministic tie-breaker.
- Count, search, pagination, and row queries use the same filters.

### `GET /api/v1/map/sectors/viewport`

Keep the PR #38 `bbox + zoom` guardrails and add optional `kabupaten`, `cluster`, `kelas`, and `q` alongside `nop`.

- Sector queries join the site master only to apply the active explorer filters.
- The spatial `geom && ST_MakeEnvelope(...)` predicate, Auto LOD thresholds, hard feature limits, and selected-site full-detail endpoint remain unchanged.
- Selected-site polygons are fetched by exact `site_id` and remain visible even when the inspector is showing an outside-filter site.

## Frontend boundaries

### `SiteMapPage`

Owns canonical explorer state, selected-site fallback loading, modal state, drawer state, and URL synchronization. It composes focused feature components rather than accumulating new presentation logic.

### `useMapData`

Accepts the canonical data filters and returns:

```js
{
  sites,
  total,
  withCoordinates,
  loading,
  error,
  refetch,
}
```

It aborts stale requests whenever period, search, or any location filter changes.

### Explorer toolbar

Uses the existing dashboard search, combobox, select, chip, sheet, and reset patterns. Search is a first-class map filter rather than a table-only field. Active filter copy says that filters apply to map, sectors, and results.

### Context strip

Shows only spatial context:

- filtered site count;
- count with valid coordinates;
- selected Site ID or `Belum dipilih`;
- sector status emitted by `MapboxMap`.

It does not calculate availability KPIs already owned by Home/Reporting.

### `MapboxMap`

- Receives the filtered marker array and the full active filter object.
- Emits a normalized site object on marker selection.
- Keeps cluster expansion, camera focus, selected-site radius, basemap switching, and Auto LOD.
- Removes the large Mapbox popup, daily sparkline, popup dragging, and floating neighbor marker cards.
- Emits sector status to the page for the context strip.
- Passes all applicable filters into the viewport descriptor/request key so a filter change aborts and replaces stale sector geometry.
- Selected-site focus never waits for inspector-detail requests.

### Selected-site inspector

Renders immediately from marker/table data and enriches from exact site detail only when necessary.

Content:

- identity: Site ID, name, NOP, Kabupaten, Cluster, class, and site status;
- operational summary: availability, outage, cell count, dominant RCA;
- nearby sites within 1 km, calculated from the already-filtered marker set and sorted by distance;
- an explicit outside-filter notice when applicable;
- actions: `Full Site Detail`, `Buka di Data Potensi`, and `Analisis RF Tilt`.

Action behavior:

- `Full Site Detail` uses the existing `fetchSiteDetailBundle` and shared modal.
- Data Potensi navigates to `/data-potensi?site=<SITE_ID>` and opens the matching detail surface.
- RF Tilt navigates to `/rf-tilt-analysis?site=<SITE_ID>` and primes the site search. It does not auto-select the first cell because one site can have multiple valid cell/sector choices.

### Results drawer

- Reuses the existing table columns and pagination presentation.
- Search and filters are controlled by the page; the table no longer owns a second search/filter state.
- Sorting sends `sort_by` and `sort_dir` to the backend and resets page to 1.
- Loading, empty, and error states are contained inside the drawer.
- A row selection closes the mobile results sheet, selects the site, focuses the map, and updates the URL.

## Data and interaction flow

```text
URL + latest period
        |
        v
canonical explorer state
   |          |             |
   v          v             v
/map/sites  /sites       /map/sectors/viewport
markers +   drawer rows  filtered Auto LOD polygons
counts
   \          |             /
    \         v            /
     ---- SiteMapPage -----
              |
        selected site
        /      |       \
     map    inspector   shared detail modal
```

No request result may overwrite newer state. Map, results, selected-site detail, and sector requests each retain independent `AbortController` ownership.

## Error and empty states

- Marker/count failure keeps the map shell and results available, with a scoped retry.
- Results failure displays an inline drawer error and retry; it is not reduced to `console.error`.
- Sector failure remains scoped to the sector status and does not fail the map.
- Invalid or unresolved deep-linked sites show an inspector error with `Hapus pilihan site`; the map and filters remain usable.
- Zero filtered markers show the existing map empty message plus counts of zero.
- Zero coordinates with non-zero total explicitly says that matching sites exist but lack valid coordinates.

## Accessibility and responsiveness

- Every drawer, sheet, close action, sort header, and selected state has a textual accessible name.
- Sort direction uses `aria-sort`; it is not communicated only by an arrow glyph.
- Context counts use `aria-live="polite"` without announcing every map movement.
- Keyboard focus returns to the control that opened a sheet.
- Touch targets remain at least 40 px on mobile.
- Reduced-motion users get immediate camera transitions where the current Mapbox API supports an essential-motion flag.

## Testing strategy

### Backend

- Unit tests for shared filter/search builders and safe sort mapping.
- Router tests proving `/map/sites` and `/sites` apply the same filters.
- Query-contract tests for coordinate counts, deterministic sorting, and spatial predicate preservation.
- Sector viewport tests proving every explorer filter reaches the bounded query while exact-site full detail remains unchanged.

### Frontend

- Pure tests for URL parse/serialize, invalid values, unknown-key preservation, and filter normalization.
- Pure tests for nearby-site distance and ordering.
- Contract tests for controlled table sorting/search and removal of the Mapbox popup path.
- Hook/API tests for full filter propagation and stale-request cancellation.
- Route tests for Data Potensi exact-site opening and RF Tilt search priming.

### Runtime verification

- Desktop and mobile browser QA for filtering, clustering, selection, inspector, drawer, modal, and back/forward navigation.
- Direct-load QA for each deep-link example.
- Network verification that marker, result, and sector requests carry identical filters.
- Verify there are no unbounded sector requests, stale geometry, console errors, or horizontal overflow.
- Run backend suite, frontend tests, lint, production build, production audit, and `graphify update .` before handoff.

## Acceptance criteria

1. Site Map no longer renders `SummaryCards` or a permanent left KPI sidebar.
2. Marker data, sector viewport, contextual counts, and results use one canonical filter state.
3. The large Mapbox popup and floating nearby-site cards are absent; selection is handled by the inspector.
4. Low-zoom marker clustering and PR #38 Auto LOD behavior remain intact.
5. Sorting changes the full server-side result order, not only the current 15-row page.
6. A shared Site Map URL restores period, filters, search, and selected site.
7. Data Potensi receives an exact Site ID; RF Tilt receives a primed Site ID without an arbitrary cell choice.
8. Desktop and mobile flows remain usable with no map-control obstruction or horizontal overflow.
9. Existing Home, Reporting, Data Potensi detail, RF Tilt analysis, N8N, and selected-site sector contracts remain green.
