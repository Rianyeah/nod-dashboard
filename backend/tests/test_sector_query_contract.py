import unittest
import importlib
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
        router_path = Path(__file__).resolve().parents[1] / "routers" / "map.py"
        source = router_path.read_text(encoding="utf-8")

        self.assertIn('@router.get("/sectors")', source)
        self.assertIn("MAP_SECTORS_QUERY", source)
        self.assertIn("sector_row_to_feature", source)
        self.assertIn('"type": "FeatureCollection"', source)
        self.assertIn(":site_id", source)
        self.assertIn(":nop", source)


class SectorRouterBehaviorTest(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        database_stub = types.ModuleType("database")
        database_stub.get_session = lambda: None
        with patch.dict(sys.modules, {"database": database_stub}):
            cls.get_map_sectors = staticmethod(
                importlib.import_module("routers.map").get_map_sectors
            )

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


if __name__ == "__main__":
    unittest.main()
