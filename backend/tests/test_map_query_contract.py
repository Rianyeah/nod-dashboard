import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class MapQueryContractTest(unittest.TestCase):
    def test_map_sites_query_only_returns_sites_with_monthly_data_and_coordinates(self):
        from queries.sql_queries import MAP_SITES_QUERY

        normalized = " ".join(MAP_SITES_QUERY.split()).lower()

        self.assertIn('join site_month_metrics agg', normalized)
        self.assertIn('agg.site_id = m."siteid"', normalized)
        self.assertNotIn('left join site_month agg on agg."site id" = m."siteid"', normalized)
        self.assertIn("{filters}", normalized)
        self.assertIn('nullif(nullif(m."latitude"', normalized)
        self.assertIn('nullif(nullif(m."longitude"', normalized)

    def test_sites_list_query_exposes_coordinates_for_table_click_fallback(self):
        from queries.sql_queries import SITES_LIST_QUERY
        from models.site import SiteListItem

        normalized = " ".join(SITES_LIST_QUERY.split()).lower()

        self.assertIn("as latitude", normalized)
        self.assertIn("as longitude", normalized)
        self.assertIn("latitude", SiteListItem.model_fields)
        self.assertIn("longitude", SiteListItem.model_fields)


if __name__ == "__main__":
    unittest.main()
