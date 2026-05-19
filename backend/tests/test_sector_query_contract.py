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
