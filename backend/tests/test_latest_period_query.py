import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class LatestPeriodQueryTest(unittest.TestCase):
    def test_latest_period_query_returns_newest_period_with_rows(self):
        from queries.sql_queries import LATEST_PERIOD_QUERY

        normalized = " ".join(LATEST_PERIOD_QUERY.split()).upper()

        self.assertIn('"TAHUN"', normalized)
        self.assertIn('"BULAN"', normalized)
        self.assertIn("COUNT(*)", normalized)
        self.assertIn("GROUP BY", normalized)
        self.assertIn('ORDER BY "TAHUN" DESC, "BULAN" DESC', normalized)
        self.assertIn("LIMIT 1", normalized)


if __name__ == "__main__":
    unittest.main()
