# Sector Antenna Polygon Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render sector antenna direction polygons on the NOD Dashboard map from `public.ransys_gabungan`.

**Architecture:** The backend owns sector data access and GeoJSON polygon generation, returning a FeatureCollection from `GET /map/sectors`. The frontend fetches that GeoJSON and renders Mapbox fill/line layers, with all sectors gated at zoom 12+ and selected-site sectors emphasized during map focus.

**Tech Stack:** FastAPI, SQLAlchemy async text queries, Python geometry helpers, React, Axios, Mapbox GL JS, Node test contracts, Python unittest.

---

## File Structure

- Create `backend/sector_geometry.py`
  - Responsible for clamping visual radius, calculating destination coordinates, and converting sector rows into GeoJSON polygon features.
- Create `backend/tests/test_sector_geometry.py`
  - Unit tests for radius clamping and wedge polygon generation.
- Create `backend/tests/test_sector_query_contract.py`
  - Contract tests for the SQL query and router endpoint shape.
- Modify `backend/queries/sql_queries.py`
  - Add `MAP_SECTORS_QUERY`.
- Modify `backend/routers/map.py`
  - Add `GET /map/sectors`, import geometry helpers and the new SQL query.
- Modify `frontend/src/services/api.js`
  - Add `fetchMapSectors({ nop, siteId })`.
- Modify `frontend/src/components/MapboxMap.jsx`
  - Fetch sector GeoJSON, add source/layers, gate all sectors at zoom 12+, emphasize selected site sectors.
- Modify `frontend/src/__tests__/dashboardOptimizationContracts.test.js`
  - Add frontend contract coverage for sector API and Mapbox layers.

---

### Task 1: Backend Sector Geometry

**Files:**
- Create: `backend/sector_geometry.py`
- Test: `backend/tests/test_sector_geometry.py`

- [ ] **Step 1: Write failing geometry tests**

Create `backend/tests/test_sector_geometry.py`:

```python
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sector_geometry import (
    clamp_render_radius_m,
    destination_point,
    sector_row_to_feature,
)


class SectorGeometryTest(unittest.TestCase):
    def test_radius_clamp_uses_min_max_and_fallback(self):
        self.assertEqual(clamp_render_radius_m(None), 180.0)
        self.assertEqual(clamp_render_radius_m("bad"), 180.0)
        self.assertEqual(clamp_render_radius_m(10), 120.0)
        self.assertEqual(clamp_render_radius_m(240), 240.0)
        self.assertEqual(clamp_render_radius_m(900), 480.0)

    def test_destination_point_moves_north_from_center(self):
        longitude, latitude = destination_point(113.0, -7.0, 0, 1000)

        self.assertAlmostEqual(longitude, 113.0, places=3)
        self.assertGreater(latitude, -7.0)

    def test_sector_feature_is_closed_polygon_with_expected_properties(self):
        row = {
            "site_id": "BGL001",
            "cell_name": "E_BGL001MT1_DandangGendisNguling-TBG_MT01",
            "sector_base": 1,
            "band": "L900",
            "site_type": "Macro",
            "latitude_fix": -7.747718,
            "longitude_fix": 113.043529,
            "azimuth": 30,
            "beamwidth": 10,
            "radius": 120,
        }

        feature = sector_row_to_feature(row, arc_steps=4)

        self.assertEqual(feature["type"], "Feature")
        self.assertEqual(feature["geometry"]["type"], "Polygon")
        self.assertEqual(feature["properties"]["site_id"], "BGL001")
        self.assertEqual(feature["properties"]["band"], "L900")
        self.assertEqual(feature["properties"]["sector_base"], 1)
        self.assertEqual(feature["properties"]["render_radius_m"], 120.0)

        ring = feature["geometry"]["coordinates"][0]
        self.assertEqual(ring[0], [113.043529, -7.747718])
        self.assertEqual(ring[-1], [113.043529, -7.747718])
        self.assertEqual(len(ring), 7)

    def test_sector_feature_skips_invalid_coordinates_or_azimuth(self):
        valid = {
            "site_id": "BGL001",
            "cell_name": "cell",
            "sector_base": 1,
            "band": "L900",
            "site_type": "Macro",
            "latitude_fix": -7.7,
            "longitude_fix": 113.0,
            "azimuth": 30,
            "beamwidth": 10,
            "radius": 120,
        }

        invalid_lat = {**valid, "latitude_fix": None}
        invalid_lon = {**valid, "longitude_fix": None}
        invalid_azimuth = {**valid, "azimuth": None}

        self.assertIsNone(sector_row_to_feature(invalid_lat))
        self.assertIsNone(sector_row_to_feature(invalid_lon))
        self.assertIsNone(sector_row_to_feature(invalid_azimuth))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run geometry tests to verify RED**

Run:

```bash
python -m unittest backend.tests.test_sector_geometry -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'sector_geometry'`.

- [ ] **Step 3: Implement minimal geometry helper**

Create `backend/sector_geometry.py`:

```python
import math
from typing import Any, Mapping


EARTH_RADIUS_M = 6371000.0
MIN_RENDER_RADIUS_M = 120.0
MAX_RENDER_RADIUS_M = 480.0
FALLBACK_RENDER_RADIUS_M = 180.0
DEFAULT_ARC_STEPS = 16


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric):
        return None
    return numeric


def clamp_render_radius_m(value: Any) -> float:
    numeric = _to_float(value)
    if numeric is None:
        return FALLBACK_RENDER_RADIUS_M
    return min(max(numeric, MIN_RENDER_RADIUS_M), MAX_RENDER_RADIUS_M)


def normalize_bearing(degrees: float) -> float:
    return degrees % 360.0


def destination_point(longitude: float, latitude: float, bearing_degrees: float, distance_m: float) -> tuple[float, float]:
    lat1 = math.radians(latitude)
    lon1 = math.radians(longitude)
    bearing = math.radians(normalize_bearing(bearing_degrees))
    angular_distance = distance_m / EARTH_RADIUS_M

    lat2 = math.asin(
        math.sin(lat1) * math.cos(angular_distance)
        + math.cos(lat1) * math.sin(angular_distance) * math.cos(bearing)
    )
    lon2 = lon1 + math.atan2(
        math.sin(bearing) * math.sin(angular_distance) * math.cos(lat1),
        math.cos(angular_distance) - math.sin(lat1) * math.sin(lat2),
    )

    return (math.degrees(lon2), math.degrees(lat2))


def _row_value(row: Mapping[str, Any], key: str) -> Any:
    if hasattr(row, "get"):
        return row.get(key)
    return row[key]


def sector_row_to_feature(row: Mapping[str, Any], arc_steps: int = DEFAULT_ARC_STEPS) -> dict[str, Any] | None:
    longitude = _to_float(_row_value(row, "longitude_fix"))
    latitude = _to_float(_row_value(row, "latitude_fix"))
    azimuth = _to_float(_row_value(row, "azimuth"))
    beamwidth = _to_float(_row_value(row, "beamwidth")) or 30.0

    if longitude is None or latitude is None or azimuth is None:
        return None
    if longitude < -180 or longitude > 180 or latitude < -90 or latitude > 90:
        return None

    render_radius_m = clamp_render_radius_m(_row_value(row, "radius"))
    half_width = max(min(beamwidth, 360.0), 1.0) / 2.0
    start_bearing = azimuth - half_width
    end_bearing = azimuth + half_width
    step_count = max(int(arc_steps), 2)

    center = [longitude, latitude]
    arc = []
    for index in range(step_count + 1):
        ratio = index / step_count
        bearing = start_bearing + (end_bearing - start_bearing) * ratio
        point_lng, point_lat = destination_point(longitude, latitude, bearing, render_radius_m)
        arc.append([point_lng, point_lat])

    return {
        "type": "Feature",
        "properties": {
            "site_id": _row_value(row, "site_id"),
            "cell_name": _row_value(row, "cell_name"),
            "sector_base": _row_value(row, "sector_base"),
            "band": _row_value(row, "band"),
            "site_type": _row_value(row, "site_type"),
            "azimuth": azimuth,
            "beamwidth": beamwidth,
            "radius": _to_float(_row_value(row, "radius")),
            "render_radius_m": render_radius_m,
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [[center, *arc, center]],
        },
    }
```

- [ ] **Step 4: Run geometry tests to verify GREEN**

Run:

```bash
python -m unittest backend.tests.test_sector_geometry -v
```

Expected: PASS for all tests in `SectorGeometryTest`.

- [ ] **Step 5: Commit backend geometry**

Run:

```bash
git add backend/sector_geometry.py backend/tests/test_sector_geometry.py
git commit -m "feat: add sector polygon geometry helpers"
```

---

### Task 2: Backend Sector Query And Endpoint

**Files:**
- Modify: `backend/queries/sql_queries.py`
- Modify: `backend/routers/map.py`
- Test: `backend/tests/test_sector_query_contract.py`

- [ ] **Step 1: Write failing query and router contract tests**

Create `backend/tests/test_sector_query_contract.py`:

```python
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class SectorQueryContractTest(unittest.TestCase):
    def test_map_sectors_query_reads_required_ransys_fields(self):
        from queries.sql_queries import MAP_SECTORS_QUERY

        normalized = " ".join(MAP_SECTORS_QUERY.split()).lower()

        self.assertIn("from ransys_gabungan", normalized)
        self.assertIn("site_id", normalized)
        self.assertIn("cell_name", normalized)
        self.assertIn("sector_base", normalized)
        self.assertIn("band", normalized)
        self.assertIn("site_type", normalized)
        self.assertIn("azimuth", normalized)
        self.assertIn("beamwidth", normalized)
        self.assertIn("radius", normalized)
        self.assertIn("latitude_fix", normalized)
        self.assertIn("longitude_fix", normalized)
        self.assertIn("{filters}", MAP_SECTORS_QUERY)

    def test_map_router_exposes_sector_endpoint(self):
        router_path = Path(__file__).resolve().parents[1] / "routers" / "map.py"
        source = router_path.read_text(encoding="utf-8")

        self.assertIn('@router.get("/sectors")', source)
        self.assertIn("MAP_SECTORS_QUERY", source)
        self.assertIn("sector_row_to_feature", source)
        self.assertIn('"type": "FeatureCollection"', source)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run query contract tests to verify RED**

Run:

```bash
python -m unittest backend.tests.test_sector_query_contract -v
```

Expected: FAIL because `MAP_SECTORS_QUERY` and `/sectors` do not exist yet.

- [ ] **Step 3: Add sector SQL query**

Append to `backend/queries/sql_queries.py` near the existing map queries:

```python
# Query - Sector antenna polygons
MAP_SECTORS_QUERY = """
SELECT
    site_id,
    cell_name,
    sector_base,
    band,
    site_type,
    latitude_fix,
    longitude_fix,
    azimuth,
    beamwidth,
    radius
FROM ransys_gabungan
WHERE latitude_fix IS NOT NULL
  AND longitude_fix IS NOT NULL
  AND azimuth IS NOT NULL
  AND longitude_fix BETWEEN -180 AND 180
  AND latitude_fix BETWEEN -90 AND 90
{filters}
ORDER BY site_id, sector_base, band, cell_name
"""
```

- [ ] **Step 4: Add `/map/sectors` endpoint**

Modify imports in `backend/routers/map.py`:

```python
from queries.sql_queries import MAP_SITES_QUERY, POPUP_DETAIL_QUERY, MAP_SECTORS_QUERY
from sector_geometry import sector_row_to_feature
```

Add this endpoint before `@router.get("/sites/{site_id}/popup")`:

```python
@router.get("/sectors")
async def get_map_sectors(
    site_id: str = Query(None),
    nop: str = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Get sector antenna direction polygons as GeoJSON."""
    filters = ""
    params = {}
    if site_id:
        filters += " AND site_id = :site_id"
        params["site_id"] = site_id
    if nop:
        filters += " AND nop = :nop"
        params["nop"] = nop

    result = await session.execute(
        text(MAP_SECTORS_QUERY.format(filters=filters)),
        params,
    )
    features = []
    for row in result.mappings().all():
        feature = sector_row_to_feature(row)
        if feature is not None:
            features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
    }
```

- [ ] **Step 5: Run backend sector tests to verify GREEN**

Run:

```bash
python -m unittest backend.tests.test_sector_geometry backend.tests.test_sector_query_contract -v
```

Expected: PASS for geometry and query contract tests.

- [ ] **Step 6: Smoke test endpoint against local backend dependency graph**

Run:

```bash
python -m unittest backend.tests.test_map_query_contract backend.tests.test_sector_query_contract -v
```

Expected: PASS for existing map query contract and sector query contract.

- [ ] **Step 7: Commit backend endpoint**

Run:

```bash
git add backend/queries/sql_queries.py backend/routers/map.py backend/tests/test_sector_query_contract.py
git commit -m "feat: expose sector antenna GeoJSON endpoint"
```

---

### Task 3: Frontend Sector API And Map Layers

**Files:**
- Modify: `frontend/src/services/api.js`
- Modify: `frontend/src/components/MapboxMap.jsx`
- Modify: `frontend/src/pages/DashboardPage.jsx`
- Test: `frontend/src/__tests__/dashboardOptimizationContracts.test.js`

- [ ] **Step 1: Write failing frontend contract test**

Append this test to `frontend/src/__tests__/dashboardOptimizationContracts.test.js`:

```javascript
  it('renders sector antenna polygon layers from backend GeoJSON', () => {
    const api = src('services', 'api.js');
    const map = src('components', 'MapboxMap.jsx');
    const dashboard = src('pages', 'DashboardPage.jsx');

    assert.match(api, /fetchMapSectors/);
    assert.match(api, /\/map\/sectors/);
    assert.match(map, /SECTOR_SOURCE_ID/);
    assert.match(map, /sector-fill/);
    assert.match(map, /sector-selected-fill/);
    assert.match(map, /minzoom:\s*12/);
    assert.match(map, /selectedSiteId/);
    assert.match(map, /setFilter\('sector-selected-fill'/);
    assert.match(dashboard, /nop=\{nop\}/);
  });
```

- [ ] **Step 2: Run frontend contract test to verify RED**

Run:

```bash
cd frontend
node --test src/__tests__/dashboardOptimizationContracts.test.js
```

Expected: FAIL because `fetchMapSectors`, sector constants, and sector layers do not exist yet.

- [ ] **Step 3: Add sector API client**

Modify `frontend/src/services/api.js` after `fetchMapSites`:

```javascript
export async function fetchMapSectors({ nop, siteId } = {}) {
  const { data } = await api.get('/map/sectors', {
    params: {
      nop: nop || undefined,
      site_id: siteId || undefined,
    },
    timeout: 60000,
  });
  return data;
}
```

- [ ] **Step 4: Pass NOP into MapboxMap**

Modify `frontend/src/pages/DashboardPage.jsx` where `<MapboxMap />` is rendered:

```jsx
            <MapboxMap
              sites={sites}
              loading={mapLoading}
              onSiteClick={handleSiteClick}
              selectedSiteId={selectedSiteId}
              selectedSiteFocusKey={selectedSiteFocusKey}
              selectedSiteFallback={selectedSiteFallback}
              error={mapError}
              onRetry={refetchMapData}
              bulan={bulan}
              tahun={tahun}
              nop={nop}
              layoutResizeKey={layoutResizeKey}
            />
```

- [ ] **Step 5: Add sector state and fetch logic to `MapboxMap`**

Modify imports in `frontend/src/components/MapboxMap.jsx`:

```javascript
import { fetchMapSectors, fetchSiteAvailability } from '../services/api';
```

Add constants near existing layer constants:

```javascript
const SECTOR_SOURCE_ID = 'sector-source';
const SECTOR_LAYER_IDS = ['sector-selected-outline', 'sector-selected-fill', 'sector-outline', 'sector-fill'];
const SECTOR_MIN_ZOOM = 12;
const EMPTY_GEOJSON = emptyFeatureCollection();
```

Add `nop` to the props:

```javascript
  nop,
```

Add state after existing `useState` calls:

```javascript
  const [sectorGeoJson, setSectorGeoJson] = useState(EMPTY_GEOJSON);
```

Add fetch effect after `sitesRef` effect:

```javascript
  useEffect(() => {
    let cancelled = false;

    fetchMapSectors({ nop })
      .then((geoJson) => {
        if (!cancelled) setSectorGeoJson(geoJson || EMPTY_GEOJSON);
      })
      .catch((err) => {
        console.error('Failed to load sector polygons:', err);
        if (!cancelled) setSectorGeoJson(EMPTY_GEOJSON);
      });

    return () => {
      cancelled = true;
    };
  }, [nop]);
```

- [ ] **Step 6: Add sector source and layers**

Modify the layer cleanup list in `MapboxMap.jsx`:

```javascript
    [...SITE_LAYER_IDS, ...RADIUS_LAYER_IDS, ...SECTOR_LAYER_IDS, ...LEGACY_LAYER_IDS].forEach(id => {
      if (map.current.getLayer(id)) map.current.removeLayer(id);
    });
    if (map.current.getSource(RADIUS_SOURCE_ID)) map.current.removeSource(RADIUS_SOURCE_ID);
    if (map.current.getSource(SECTOR_SOURCE_ID)) map.current.removeSource(SECTOR_SOURCE_ID);
    if (map.current.getSource('sites-source')) map.current.removeSource('sites-source');
```

Add this source and layers before site pin layers:

```javascript
    map.current.addSource(SECTOR_SOURCE_ID, {
      type: 'geojson',
      data: EMPTY_GEOJSON,
    });

    map.current.addLayer({
      id: 'sector-fill',
      type: 'fill',
      source: SECTOR_SOURCE_ID,
      minzoom: SECTOR_MIN_ZOOM,
      slot: 'top',
      paint: {
        'fill-color': [
          'match',
          ['get', 'band'],
          'L900', '#F59E0B',
          'L1800', '#3B82F6',
          'L2100', '#22D3EE',
          'L2300', '#A78BFA',
          '#64748B',
        ],
        'fill-opacity': 0.2,
      },
    });

    map.current.addLayer({
      id: 'sector-outline',
      type: 'line',
      source: SECTOR_SOURCE_ID,
      minzoom: SECTOR_MIN_ZOOM,
      slot: 'top',
      paint: {
        'line-color': [
          'match',
          ['get', 'band'],
          'L900', '#FBBF24',
          'L1800', '#60A5FA',
          'L2100', '#67E8F9',
          'L2300', '#C4B5FD',
          '#94A3B8',
        ],
        'line-width': 1.2,
        'line-opacity': 0.72,
      },
    });

    map.current.addLayer({
      id: 'sector-selected-fill',
      type: 'fill',
      source: SECTOR_SOURCE_ID,
      slot: 'top',
      filter: ['==', ['get', 'site_id'], selectedSiteId || ''],
      paint: {
        'fill-color': '#F59E0B',
        'fill-opacity': 0.42,
      },
    });

    map.current.addLayer({
      id: 'sector-selected-outline',
      type: 'line',
      source: SECTOR_SOURCE_ID,
      slot: 'top',
      filter: ['==', ['get', 'site_id'], selectedSiteId || ''],
      paint: {
        'line-color': '#FDE68A',
        'line-width': 2.6,
        'line-opacity': 0.95,
      },
    });
```

- [ ] **Step 7: Sync sector data and selected-site filters**

Add this effect after the existing sites source update effect:

```javascript
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const source = map.current.getSource(SECTOR_SOURCE_ID);
    if (source) source.setData(sectorGeoJson);
  }, [sectorGeoJson, mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const filter = ['==', ['get', 'site_id'], selectedSiteId || ''];
    if (map.current.getLayer('sector-selected-fill')) {
      map.current.setFilter('sector-selected-fill', filter);
    }
    if (map.current.getLayer('sector-selected-outline')) {
      map.current.setFilter('sector-selected-outline', filter);
    }
  }, [selectedSiteId, mapLoaded]);
```

- [ ] **Step 8: Run frontend contract test to verify GREEN**

Run:

```bash
cd frontend
node --test src/__tests__/dashboardOptimizationContracts.test.js
```

Expected: PASS for all dashboard optimization contract tests.

- [ ] **Step 9: Commit frontend map layers**

Run:

```bash
git add frontend/src/services/api.js frontend/src/components/MapboxMap.jsx frontend/src/pages/DashboardPage.jsx frontend/src/__tests__/dashboardOptimizationContracts.test.js
git commit -m "feat: render sector antenna polygons on map"
```

---

### Task 4: End-To-End Verification

**Files:**
- Verify only; no planned edits.

- [ ] **Step 1: Run backend test subset**

Run:

```bash
python -m unittest backend.tests.test_sector_geometry backend.tests.test_sector_query_contract backend.tests.test_map_query_contract -v
```

Expected: PASS for all listed tests.

- [ ] **Step 2: Run frontend contract test**

Run:

```bash
cd frontend
node --test src/__tests__/dashboardOptimizationContracts.test.js
```

Expected: PASS for all frontend contract tests.

- [ ] **Step 3: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: build exits with code 0 and creates `frontend/dist`.

- [ ] **Step 4: Optional browser QA**

Run backend and frontend using the repo's normal development commands, then verify:

- Site markers still render.
- Sector polygons appear at zoom 12 and above.
- Clicking a marker focuses that site's sectors.
- Popup and neighbor cards remain usable.
- NOP filter refreshes both site markers and sector polygons.

- [ ] **Step 5: Final status check**

Run:

```bash
git status --short
```

Expected: only unrelated pre-existing dirty files remain, or no output if the workspace was otherwise clean.
