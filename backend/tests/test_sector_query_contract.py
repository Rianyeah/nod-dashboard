import unittest
import importlib
import math
import re
import types
from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class FakeMappings:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return FakeMappings(self._rows)


class FakeSession:
    def __init__(self, rows):
        self._rows = rows
        self.executed_sql = None
        self.executed_params = None

    async def execute(self, statement, params):
        self.executed_sql = str(statement)
        self.executed_params = params
        return FakeResult(self._rows)


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
        self.assertIn("azimuth is not null", normalized)
        self.assertIn("longitude_fix between -180 and 180", normalized)
        self.assertIn("latitude_fix between -90 and 90", normalized)
        self.assertIn("{filters}", MAP_SECTORS_QUERY)

    def test_map_router_exposes_sector_endpoint(self):
        backend_root = Path(__file__).resolve().parents[1]
        router_path = backend_root / "routers" / "map.py"
        source = router_path.read_text(encoding="utf-8")
        loader_source = (backend_root / "map_sectors.py").read_text(encoding="utf-8")

        self.assertRegex(source, r'@router\.get\(\s*"/sectors"')
        self.assertIn("load_sector_feature_collection", source)
        self.assertIn("MAP_SECTORS_QUERY", loader_source)
        self.assertIn("sector_row_to_feature", loader_source)
        self.assertIn('"type": "FeatureCollection"', loader_source)
        self.assertIn(":site_id", loader_source)
        self.assertIn(":nop", loader_source)

    def test_viewport_queries_are_spatially_bounded_and_budgeted(self):
        from queries.sql_queries import (
            MAP_SECTORS_VIEWPORT_FULL_QUERY,
            MAP_SECTORS_VIEWPORT_GROUPED_QUERY,
        )

        for query in (MAP_SECTORS_VIEWPORT_GROUPED_QUERY, MAP_SECTORS_VIEWPORT_FULL_QUERY):
            normalized = " ".join(query.split()).lower()
            self.assertIn("geom && st_makeenvelope(:west, :south, :east, :north, 4326)", normalized)
            self.assertIn("limit :row_limit", normalized)
            self.assertIn("{filters}", query)

        grouped = " ".join(MAP_SECTORS_VIEWPORT_GROUPED_QUERY.split()).lower()
        self.assertIn("round(azimuth::numeric, 1)", grouped)
        self.assertIn("array_agg(distinct", grouped)
        self.assertIn("count(*)", grouped)

    def test_map_sectors_endpoint_matches_public_map_route_contract(self):
        backend_root = Path(__file__).resolve().parents[1]
        map_source = (backend_root / "routers" / "map.py").read_text(encoding="utf-8")

        sector_route = re.search(
            r"@router\.get\(\s*[\"']/sectors[\"'](?P<args>.*?)\)\s*async def get_map_sectors",
            map_source,
            re.DOTALL,
        )
        self.assertIsNotNone(sector_route)
        self.assertNotIn("verify_dashboard_token", sector_route.group("args"))
        self.assertNotIn("dependencies=", sector_route.group("args"))

        site_route = re.search(
            r"@router\.get\(\s*[\"']/sites[\"'](?P<args>.*?)\)\s*async def get_map_sites",
            map_source,
            re.DOTALL,
        )
        self.assertIsNotNone(site_route)
        self.assertNotIn("verify_dashboard_token", site_route.group("args"))


class SectorRouterBehaviorTest(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        database_stub = types.ModuleType("database")
        database_stub.get_session = lambda: None
        with patch.dict(sys.modules, {"database": database_stub}):
            cls.get_map_sectors = staticmethod(
                importlib.import_module("routers.map").get_map_sectors
            )
            cls.get_map_sector_viewport = staticmethod(
                importlib.import_module("routers.map").get_map_sector_viewport
            )

    def test_parse_viewport_bbox_accepts_valid_bounds(self):
        from map_sectors import parse_viewport_bbox

        self.assertEqual(
            parse_viewport_bbox("112,-8,114,-6"),
            (112.0, -8.0, 114.0, -6.0),
        )

    def test_parse_viewport_bbox_rejects_malformed_or_unbounded_values(self):
        from map_sectors import parse_viewport_bbox

        invalid_values = [
            "112,-8,114",
            "west,-8,114,-6",
            "114,-8,112,-6",
            "112,-6,114,-8",
            "-181,-8,114,-6",
            "112,-91,114,-6",
            "nan,-8,114,-6",
            f"112,-8,{math.inf},-6",
        ]
        for value in invalid_values:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    parse_viewport_bbox(value)

    async def test_dashboard_sector_endpoint_rejects_unbounded_request(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as raised:
            await self.get_map_sectors(
                site_id=None,
                nop=None,
                session=FakeSession([]),
            )

        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("site_id", raised.exception.detail)

    async def test_get_map_sectors_filters_params_and_omits_invalid_features(self):
        valid_row = {
            "site_id": "BGL001",
            "cell_name": "BGL001_1",
            "sector_base": "1",
            "band": "L1800",
            "site_type": "MACRO",
            "latitude_fix": -7.445,
            "longitude_fix": 112.718,
            "azimuth": 90,
            "beamwidth": 65,
            "radius": 220,
        }
        invalid_row = {
            "site_id": "BGL001",
            "cell_name": "BGL001_INVALID",
            "sector_base": "2",
            "band": "L1800",
            "site_type": "MACRO",
            "latitude_fix": -7.445,
            "longitude_fix": 112.718,
            "azimuth": None,
            "beamwidth": 65,
            "radius": 220,
        }
        fake_session = FakeSession([valid_row, invalid_row])

        payload = await self.get_map_sectors(
            site_id="BGL001",
            nop="SIDOARJO",
            session=fake_session,
        )

        self.assertIn("AND site_id = :site_id", fake_session.executed_sql)
        self.assertIn("AND nop = :nop", fake_session.executed_sql)
        self.assertEqual(fake_session.executed_sql.count("AND site_id = :site_id"), 1)
        self.assertEqual(fake_session.executed_sql.count("AND nop = :nop"), 1)
        self.assertEqual(
            set(re.findall(r":\w+", fake_session.executed_sql)),
            {":site_id", ":nop"},
        )
        self.assertEqual(
            fake_session.executed_params,
            {"site_id": "BGL001", "nop": "SIDOARJO"},
        )
        self.assertEqual(payload["type"], "FeatureCollection")
        self.assertEqual(len(payload["features"]), 1)
        self.assertEqual(payload["features"][0]["type"], "Feature")
        self.assertEqual(payload["features"][0]["properties"]["cell_name"], "BGL001_1")

    async def test_viewport_endpoint_returns_lite_metadata_and_bound_sql(self):
        fake_session = FakeSession([
            {
                "site_id": "PST001",
                "latitude_fix": -7.645,
                "longitude_fix": 112.908,
                "azimuth": 30,
                "beamwidth": 65,
                "radius": 1200,
                "bands": ["L900", "L1800", "L2100"],
                "sector_count": 3,
            }
        ])

        payload = await self.get_map_sector_viewport(
            bbox="112,-8,114,-6",
            zoom=10.5,
            nop="PASURUAN",
            session=fake_session,
        )

        self.assertEqual(payload["metadata"], {
            "lod": "lite",
            "zoom": 10.5,
            "feature_count": 1,
            "feature_limit": 2500,
            "limit_exceeded": False,
            "zoom_required": False,
        })
        self.assertEqual(payload["features"][0]["properties"]["bands"], ["L900", "L1800", "L2100"])
        self.assertIn("AND nop = :nop", fake_session.executed_sql)
        self.assertEqual(fake_session.executed_params, {
            "west": 112.0,
            "south": -8.0,
            "east": 114.0,
            "north": -6.0,
            "nop": "PASURUAN",
            "row_limit": 2501,
        })

    async def test_viewport_loader_does_not_execute_below_minimum_zoom(self):
        fake_session = FakeSession([])

        payload = await self.get_map_sector_viewport(
            bbox="112,-8,114,-6",
            zoom=8.5,
            nop=None,
            session=fake_session,
        )

        self.assertIsNone(fake_session.executed_sql)
        self.assertEqual(payload["features"], [])
        self.assertTrue(payload["metadata"]["zoom_required"])
        self.assertEqual(payload["metadata"]["lod"], "none")

    async def test_viewport_loader_returns_no_partial_geometry_when_limit_exceeded(self):
        row = {
            "site_id": "PST001",
            "latitude_fix": -7.645,
            "longitude_fix": 112.908,
            "azimuth": 30,
            "beamwidth": 65,
            "radius": 1200,
            "bands": ["L900"],
            "sector_count": 1,
        }
        fake_session = FakeSession([row] * 2501)

        payload = await self.get_map_sector_viewport(
            bbox="112,-8,114,-6",
            zoom=10,
            nop=None,
            session=fake_session,
        )

        self.assertEqual(payload["features"], [])
        self.assertEqual(payload["metadata"]["feature_count"], 0)
        self.assertTrue(payload["metadata"]["limit_exceeded"])
        self.assertTrue(payload["metadata"]["zoom_required"])


if __name__ == "__main__":
    unittest.main()
