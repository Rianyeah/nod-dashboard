# Site Map Sector Auto LOD Design

**Status:** Pending written review on 2026-08-29; the underlying in-chat design is approved.

## Context

The Site Map currently keeps one GeoJSON sector source and starts a broad sector request after the map crosses a fixed zoom threshold. When no NOP filter is active, that request can load the full network. The current backend then converts every database row into a curved polygon with 16 arc steps and returns the complete property set. This makes database filtering relatively cheap but shifts substantial work into Python geometry generation, JSON serialization, network transfer, browser parsing, and `GeoJSONSource#setData`.

The requested behavior is global. Kota Pasuruan is only an example for validation; no city, Kabupaten, or NOP is hard-coded. A dedicated sector layer must follow the current viewport and zoom, render a lightweight directional representation at city-level zoom, and progressively increase geometry detail as the user zooms in.

## Goals

1. Eliminate unbounded sector requests from the authenticated Site Map.
2. Add a dedicated `Sectoral — Auto Detail` layer that is off by default.
3. Choose sector geometry detail from map zoom while always limiting data to the current viewport.
4. Preserve antenna direction at city-level zoom by grouping co-directed multiband rows per site into lightweight wedges.
5. Show full sector detail for a selected site without loading full-detail geometry for the surrounding network.
6. Cluster site markers at low zoom so the marker layer remains legible independently of the sector layer.
7. Preserve the existing RF Tilt selected-site flow and N8N map integration contract.
8. Provide explicit loading, ready, zoom-required, limit, and error states for the sector layer.

## Non-goals

- No hard-coded behavior for Pasuruan or any other administrative area.
- No redesign of the complete Site Map page, summary cards, results table, or site-detail modal.
- No Mapbox Vector Tile implementation in this change. MVT remains a measured follow-up only if bounded GeoJSON misses the performance targets.
- No global middleware or cache-policy change.
- No database schema migration or precomputed geometry table.
- No change to the period semantics of availability markers.
- No removal or redesign of the shared `SiteDetailModal` contract.

## Chosen Architecture

Use two independent sector data paths and three independent Mapbox sources:

1. `sites-source` contains site points and enables native point clustering.
2. `sector-viewport-source` contains bounded, zoom-dependent sector geometry for the current viewport.
3. `sector-selected-source` contains full-detail geometry for the selected site only.

The existing selected-site endpoint remains the authoritative full-detail contract. A new viewport endpoint owns automatic LOD. Keeping the two paths separate prevents a selected-site interaction from replacing viewport data and prevents the lightweight viewport contract from weakening RF Tilt or N8N data.

## Layer and Zoom Behavior

`Site Markers` and `Sectoral — Auto Detail` are separate controls and data lifecycles.

### Site markers

- Site markers are on by default.
- At low zoom, Mapbox clusters points and displays a cluster count.
- Clicking a cluster uses `getClusterExpansionZoom` and zooms to its members.
- Unclustered site points retain availability-driven coloring and the existing popup/select behavior.
- Cluster styling uses the existing graphite and Telkomsel-red visual language.

### Sectoral — Auto Detail

- The layer is off by default.
- Turning it off aborts the active viewport request and clears viewport sector geometry.
- Below zoom 9, the frontend does not request sector geometry and displays `Zoom in untuk menampilkan sector`.
- Zoom 9 through less than 12 uses `lite` geometry.
- Zoom 12 through less than 14 uses `medium` geometry.
- Zoom 14 and above uses `full` viewport geometry.
- While the sector layer is active, selecting a site loads full-detail geometry for that site through the existing selected-site endpoint. Selected detail is independent from the viewport LOD source.
- Changing zoom, viewport, or NOP filter aborts stale viewport requests. No result may be applied unless its request key still matches the current viewport state.

The thresholds are constants in one frontend/backend contract module so tests can prevent accidental drift. They are not tied to city names, NOP names, or filter values.

## Sector Aggregation Semantics

Lite and medium geometry groups source rows by normalized `site_id` and rounded antenna direction. The direction key is azimuth rounded to one decimal place. This implements the approved `site + arah azimuth` rule and collapses multiband rows that point in the same direction.

Each aggregated feature contains only:

- `site_id`
- `azimuth`
- `beamwidth`
- sorted unique `bands`
- `sector_count`
- `lod`

The render radius is derived from the largest valid radius in the group, bounded by the existing minimum and maximum visualization radii. If a source radius is absent, the largest per-band default in the group is used. This keeps overlapping multiband rows represented by one visible wedge without understating the directional footprint.

Geometry detail is:

- `lite`: 2 arc steps, producing a compact wedge.
- `medium`: 6 arc steps, producing a visibly curved but still compact wedge.
- `full` viewport: 16 arc steps per source row, with display-only properties.
- selected-site full detail: the existing 16-step geometry and complete property contract.

Lite and medium wedges use a neutral sector-coverage style because one feature may represent multiple bands. Full viewport and selected-site features retain band-aware styling where a single band is available. The `bands` array remains available for hover or inspector copy but is not expanded into duplicate polygons.

## Backend API Contract

### Existing `GET /api/v1/map/sectors`

The authenticated dashboard route requires `site_id`. It returns the existing full-detail GeoJSON FeatureCollection for that site. A NOP may still be supplied as an additional scope check.

A request without `site_id` returns HTTP 422 with an actionable message directing callers to the viewport endpoint. This is the guardrail that prevents the Site Map from requesting the full network.

The underlying shared full-detail loader keeps its current optional filters because the separate N8N integration route depends on that contract. N8N compatibility is protected by regression tests rather than by routing its traffic through the new viewport contract.

### New `GET /api/v1/map/sectors/viewport`

Required query parameters:

- `bbox`: comma-separated `west,south,east,north` WGS84 coordinates
- `zoom`: finite number from 0 through 24

Optional query parameter:

- `nop`: exact existing NOP filter

The backend validates coordinate ranges, requires `west < east` and `south < north`, and binds all parsed values as SQL parameters. Dateline-crossing boxes are outside this Jatim-focused scope and return HTTP 422 rather than falling back to an unbounded query.

The server derives `lod` from zoom. The client cannot request a more expensive LOD than the zoom contract permits.

The response remains a valid GeoJSON FeatureCollection and adds a foreign `metadata` member:

```json
{
  "type": "FeatureCollection",
  "features": [],
  "metadata": {
    "lod": "lite",
    "zoom": 10.5,
    "feature_count": 0,
    "feature_limit": 2500,
    "limit_exceeded": false,
    "zoom_required": false
  }
}
```

Per-LOD safety budgets are:

- `lite`: 2,500 aggregated features
- `medium`: 1,500 aggregated features
- `full`: 750 source-row features

Queries request `limit + 1`. If the result exceeds the budget, the endpoint returns no geometry and sets `limit_exceeded=true` and `zoom_required=true`. The API never silently truncates a directional dataset because a partial sector picture would be operationally misleading.

For zoom below 9, the endpoint may return an empty FeatureCollection with `zoom_required=true`; the normal frontend path avoids issuing this request entirely.

## Query Strategy

The viewport loader applies the spatial envelope before geometry generation. It uses the existing PostGIS geometry/index path for bounding-box filtering and retains bound longitude/latitude validation as a defensive condition.

Lite and medium modes aggregate in SQL before Python geometry generation. Full viewport mode returns individual source rows but applies the feature budget before conversion. Only the selected-site loader returns the complete full-detail property set.

No request performs a full-table Python conversion. No viewport result is cached globally in this change; request cancellation and bounded payloads are sufficient for the first implementation. A small client cache or HTTP cache can be evaluated from runtime traces later.

## Frontend Request Lifecycle

The Mapbox component owns a viewport request descriptor:

- normalized bounds
- current zoom
- derived LOD
- active NOP

The descriptor updates on `moveend`, `zoomend`, sector-layer activation, and NOP changes. Bounds are rounded to a stable precision before becoming a request key. A short debounce prevents duplicate requests when one camera transition emits both end events.

Lifecycle rules:

1. Sector layer off: abort viewport and selected-site sector requests, clear both sector sources, status `off`.
2. Zoom below 9: abort, clear, status `zoom-required`.
3. Eligible viewport: clear stale geometry, status `loading`, request bounded data.
4. Successful non-stale response: set source data and status `ready`.
5. Limit response: keep source empty and status `zoom-required` with a specific message.
6. Canceled request: no error state.
7. Network or validation failure: clear source and show a retryable layer-scoped error.

Selected-site requests use a separate AbortController and state object. They run only while the sector layer is active. Selecting another site aborts the previous selected-site request. Deselecting clears only the selected source, not the viewport source.

## Mapbox Rendering

The map style registers viewport and selected sector sources independently. Source and layer recreation after a basemap style switch uses the latest refs so toggles and geometry survive style reloads correctly.

Viewport layers:

- aggregated lite/medium fill
- aggregated lite/medium outline
- full viewport band-aware fill
- full viewport outline

Selected layers:

- selected full-detail fill
- selected full-detail emphasized outline

The layer status control displays one of:

- `Sectors Off`
- `Zoom in for sectors`
- `Loading sectors…`
- `{count} sectors · Lite`
- `{count} sectors · Medium`
- `{count} sectors · Full`
- `Area too wide — zoom in`
- `Sector layer unavailable`

The band legend is hidden while the layer is off, below minimum zoom, loading, or showing aggregated multiband geometry. It appears only when band-specific full geometry is visible. This prevents a legend from claiming band distinctions that the lite layer intentionally aggregates.

## Error and Compatibility Boundaries

- The authenticated Site Map can no longer call `/map/sectors` without `site_id`.
- RF Tilt continues to call `/map/sectors?site_id=...` and receives the existing full-detail properties.
- `/integrations/n8n/map/sectors` retains its existing response and authentication behavior.
- A stale viewport or selected-site response is never rendered.
- Turning the layer off performs zero further sector requests until it is re-enabled.
- Map initialization errors remain independent from sector-layer errors.
- Availability marker failures do not disable the sector layer, and sector failures do not blank site markers.

## Files and Component Boundaries

Backend changes are expected in:

- `backend/routers/map.py`
- `backend/map_sectors.py`
- `backend/sector_geometry.py`
- `backend/queries/sql_queries.py`
- focused map/sector backend tests

Frontend changes are expected in:

- `frontend/src/services/api.js`
- `frontend/src/components/MapboxMap.jsx`
- a focused sector LOD/request helper extracted from `MapboxMap.jsx`
- focused frontend contract and behavior tests

The deterministic zoom-to-LOD and request-key logic belongs in a small pure frontend helper rather than adding more inline responsibility to the already-large `MapboxMap.jsx` file.

## Testing Strategy

Implementation follows test-driven development.

Backend tests cover:

- bbox parsing and invalid-range rejection
- deterministic zoom-to-LOD thresholds
- dashboard rejection of unbounded sector requests
- selected-site full-detail backward compatibility
- N8N full-detail compatibility
- SQL spatial scoping and bound parameters
- site-and-azimuth aggregation with sorted unique bands
- lite, medium, and full vertex counts
- per-LOD feature budgets and no silent truncation
- metadata for ready, zoom-required, and limit-exceeded responses

Frontend tests cover:

- sector layer defaults off
- no sector request at initial render
- no viewport request below zoom 9
- bbox, zoom, NOP, and AbortSignal API parameters
- deterministic zoom-to-LOD and request keys
- stale viewport and selected-site cancellation
- layer-off abort and source clearing
- independent viewport and selected-site GeoJSON sources
- marker source clustering and cluster expansion behavior
- style reload restoration
- conditional status text and legend visibility
- RF Tilt continues using selected-site sector requests

Runtime verification includes:

- complete backend and frontend test suites
- frontend lint, production build, and production audit policy
- authenticated browser QA at desktop and narrow widths
- map movement across multiple regions, not only Pasuruan
- layer off/on, below-minimum zoom, lite, medium, and full transitions
- cluster expansion and ordinary site selection
- request inspection proving every viewport request contains bbox and zoom
- response-size and latency measurement for representative city and dense urban viewports
- zero console errors
- `graphify update .` after material source changes

## Performance Budgets

The implementation is accepted when:

- Initial Site Map load performs zero sector requests.
- Sector layer off performs zero sector requests during pan and zoom.
- No authenticated dashboard request fetches all network sectors or all NOP sectors.
- Selected-site full detail remains below 500 ms and 100 KB for representative sites.
- A representative city-level lite viewport is below 1 MB and one second server response time.
- Lite aggregation reduces representative multiband viewport feature count and payload by at least 80% relative to the current equivalent full-detail response.
- Map interaction produces no 60-second timeout and no stale geometry.
- A feature-budget overflow returns an explicit zoom-required state rather than partial geometry.

## Delivery Sequence

1. Add backend contract tests and pure LOD/aggregation tests.
2. Implement the bounded viewport endpoint and selected-site guardrail.
3. Add frontend pure helper tests for LOD and request descriptors.
4. Replace the broad sector fetch lifecycle with independent viewport and selected-site sources.
5. Add clustered site marker layers and cluster expansion behavior.
6. Add layer status and conditional legend behavior.
7. Run full automated and browser verification, measure payloads, and refresh Graphify.

## Acceptance Criteria

The change is complete when:

1. `Sectoral — Auto Detail` is a separate, default-off layer available everywhere the dataset has coverage.
2. Its behavior depends only on viewport, zoom, and optional active filters, never a hard-coded city.
3. Lite and medium modes aggregate by site and azimuth while preserving unique band metadata.
4. Selected sites render full-detail sectors independently of viewport LOD.
5. Site markers cluster at low zoom and expand predictably.
6. The Site Map cannot trigger an unbounded authenticated sector request.
7. RF Tilt and N8N sector contracts remain compatible.
8. Loading, zoom-required, overflow, ready, and error states are visible and accurate.
9. Automated verification, live browser checks, performance budgets, and Graphify refresh succeed.
