import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class SearchAndSummaryQueryTest(unittest.TestCase):
    def test_site_search_includes_kabupaten(self):
        from queries.sql_queries import SITES_SEARCH_QUERY

        normalized = " ".join(SITES_SEARCH_QUERY.split()).lower()

        self.assertIn('m."siteid" ilike :q', normalized)
        self.assertIn('m."site name" ilike :q', normalized)
        self.assertIn('m."kabupaten/kota" ilike :q', normalized)

    def test_summary_exposes_total_cell(self):
        from queries.sql_queries import SUMMARY_CARD_QUERY

        normalized = " ".join(SUMMARY_CARD_QUERY.split()).lower()

        self.assertIn("sum(agg.jumlah_cell)", normalized)
        self.assertIn("total_cell", normalized)


if __name__ == "__main__":
    unittest.main()
