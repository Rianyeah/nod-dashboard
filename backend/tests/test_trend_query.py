import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class TrendQueryTest(unittest.TestCase):
    def test_trend_query_uses_selected_month_as_rightmost_period(self):
        from queries.sql_queries import TREND_AVAILABILITY_QUERY

        normalized = " ".join(TREND_AVAILABILITY_QUERY.split()).lower()

        self.assertIn('("tahun"::int < :tahun or ("tahun"::int = :tahun and "bulan"::int <= :bulan))', normalized)
        self.assertIn('order by "tahun"::int desc, "bulan"::int desc limit 12', normalized)
        self.assertIn('order by "tahun" asc, "bulan" asc', normalized)


if __name__ == "__main__":
    unittest.main()
