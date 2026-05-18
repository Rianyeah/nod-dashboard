# Sector Antenna Polygon Markers Design

## Goal

Add sector antenna direction polygons to the NOD Dashboard map using the imported `public.ransys_gabungan` table. The map should show where each sector antenna points by using existing site longitude and latitude with these reference fields:

- `azimuth`
- `beamwidth`
- `radius`
- `sector_base`
- `band`
- `site_type`

## Approved Approach

Use backend precomputed GeoJSON.

The backend will expose sector polygon data through a map API endpoint. The frontend will render the returned GeoJSON as Mapbox layers, keeping geometry calculation out of the React map component.

## Behavior

Sector rendering will use a hybrid visibility model:

- All sector polygons are visible only at zoom level 12 and above.
- The selected or focused site's sectors remain emphasized when a marker or table row focuses a site.
- Availability point markers remain the primary map signal.
- Sector polygons must be readable without covering markers, popups, or neighbor cards.

## Radius Rule

Use visual-scaled meters.

The CSV `radius` value remains meaningful as a relative size, but the rendered polygon distance will be clamped to a readable map range. This prevents very small sectors from becoming invisible and very large sectors from dominating the map.

Initial scaling rule:

- Convert `radius` to a numeric value.
- Clamp rendered radius between 120 and 480 meters.
- If `radius` is missing or invalid, use 180 meters.

This rule can be tuned after visual QA without changing the API contract.

## Geometry

Each sector is rendered as a wedge polygon:

- Center point: `[longitude_fix, latitude_fix]`
- Middle bearing: `azimuth`
- Total spread: `beamwidth`
- Start bearing: `azimuth - beamwidth / 2`
- End bearing: `azimuth + beamwidth / 2`
- Coordinates: center point, arc points from start to end, then center point again

The geometry function should normalize bearings to 0-360 degrees and skip rows with invalid coordinates or missing `azimuth`.

## Backend Design

Add `GET /map/sectors`.

Query inputs:

- `site_id` optional
- `nop` optional
- `bbox` reserved for a future performance pass; not part of the first implementation

Response:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "site_id": "BGL001",
        "cell_name": "E_BGL001MT1_DandangGendisNguling-TBG_MT01",
        "sector_base": 1,
        "band": "L900",
        "site_type": "Macro",
        "azimuth": 30,
        "beamwidth": 10,
        "radius": 120,
        "render_radius_m": 120
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[113.043529, -7.747718], "..."]]
      }
    }
  ]
}
```

Implementation details:

- Put SQL text in `backend/queries/sql_queries.py`.
- Add any geometry helpers in `backend/routers/map.py` unless they grow large enough to justify a separate helper module.
- Keep the API behind the existing backend so Neon credentials stay server-side.

## Frontend Design

Add a new API client function:

- `fetchMapSectors({ nop, siteId })`

Update `MapboxMap`:

- Fetch general sectors with the current `nop` filter.
- Add a GeoJSON source for sector polygons.
- Add fill and outline layers before site pins.
- Use `minzoom: 12` for the all-sector layers.
- Add a selected-site layer or feature-state filter to emphasize sectors whose `site_id` matches the focused site.

Band color mapping:

- `L900`: amber
- `L1800`: blue
- `L2100`: cyan
- `L2300`: violet
- unknown bands: slate

Visual style:

- Low-opacity fills.
- Thin bright outlines.
- Selected site sectors use stronger opacity and outline width.
- Map markers and popup interactions keep their existing priority.

## Error Handling

- If sector data fails to load, the map still renders site markers.
- A sector load failure should not replace the existing map marker error state.
- Invalid sector rows are skipped by backend geometry generation.

## Testing

Backend tests:

- Geometry helper creates a closed polygon.
- `azimuth` and `beamwidth` define the expected left and right bearings.
- Radius clamping returns the configured min, max, and fallback values.
- The sector query references `ransys_gabungan` and required fields.

Frontend tests:

- API service exposes `fetchMapSectors`.
- Map component has sector source and layer contracts.
- Sector layers use zoom-gated all-sector rendering and selected-site emphasis.
- Map marker rendering remains unchanged.

## Out Of Scope

- Editing sector geometry from the UI.
- Persisting user toggles.
- Bbox optimization.
- Sector metadata tables outside the map popup/detail flow.
