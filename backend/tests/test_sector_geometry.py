import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sector_geometry import (
    clamp_render_radius_m,
    destination_point,
    normalize_bearing,
    sector_row_to_feature,
)


class SectorGeometryTest(unittest.TestCase):
    def test_radius_clamp_uses_min_max_and_fallback(self):
        # Without band, falls back to FALLBACK_RENDER_RADIUS_M = 600.0
        self.assertEqual(clamp_render_radius_m(None), 600.0)
        self.assertEqual(clamp_render_radius_m("bad"), 600.0)
        # Value below MIN_RENDER_RADIUS_M (350) falls back to band default
        self.assertEqual(clamp_render_radius_m(10), 600.0)
        # Per-band defaults when value is below minimum
        self.assertEqual(clamp_render_radius_m(100, band="L900"), 1200.0)
        self.assertEqual(clamp_render_radius_m(100, band="L1800"), 800.0)
        self.assertEqual(clamp_render_radius_m(100, band="L2300"), 450.0)
        # Value within range is kept
        self.assertEqual(clamp_render_radius_m(500), 500.0)
        # Value above MAX_RENDER_RADIUS_M (1500) is clamped
        self.assertEqual(clamp_render_radius_m(2000), 1500.0)

    def test_destination_point_moves_north_from_center(self):
        longitude, latitude = destination_point(113.0, -7.0, 0, 1000)

        self.assertAlmostEqual(longitude, 113.0, places=3)
        self.assertGreater(latitude, -7.0)

    def test_destination_point_normalizes_antimeridian_longitude(self):
        longitude, latitude = destination_point(179.999, 0.0, 90, 1000)

        self.assertGreaterEqual(longitude, -180.0)
        self.assertLessEqual(longitude, 180.0)
        self.assertLess(longitude, -179.0)
        self.assertAlmostEqual(latitude, 0.0, places=3)

    def test_normalize_bearing_wraps_degrees_to_compass_range(self):
        self.assertEqual(normalize_bearing(0), 0.0)
        self.assertEqual(normalize_bearing(360), 0.0)
        self.assertEqual(normalize_bearing(390), 30.0)
        self.assertEqual(normalize_bearing(-30), 330.0)

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
        # L900 band with radius=120 (below MIN_RENDER_RADIUS_M 350) → uses band default 1200.0
        self.assertEqual(feature["properties"]["render_radius_m"], 1200.0)

        ring = feature["geometry"]["coordinates"][0]
        self.assertEqual(ring[0], [113.043529, -7.747718])
        self.assertEqual(ring[-1], [113.043529, -7.747718])
        self.assertEqual(len(ring), 7)
        self.assertNotEqual(ring[1], ring[0])

        middle_arc_point = ring[3]
        expected_lng, expected_lat = destination_point(
            113.043529,
            -7.747718,
            30,
            1200.0,
        )
        self.assertAlmostEqual(middle_arc_point[0], expected_lng, places=6)
        self.assertAlmostEqual(middle_arc_point[1], expected_lat, places=6)

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
