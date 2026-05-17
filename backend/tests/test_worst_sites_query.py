import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class WorstSitesQueryTest(unittest.TestCase):
    def test_worst_sites_query_exposes_cell_count(self):
        from queries.sql_queries import WORST_SITES_QUERY

        normalized = " ".join(WORST_SITES_QUERY.split()).lower()

        self.assertIn("agg.jumlah_cell", normalized)
        self.assertIn("order by avg_availability asc", normalized)
        self.assertIn("limit :limit_val", normalized)


if __name__ == "__main__":
    unittest.main()
