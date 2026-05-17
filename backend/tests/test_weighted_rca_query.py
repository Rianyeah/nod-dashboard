import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class WeightedRcaQueryTest(unittest.TestCase):
    def test_site_month_uses_weighted_rca_not_mode(self):
        from queries.sql_queries import SITE_MONTH_AGG_CTE

        normalized = " ".join(SITE_MONTH_AGG_CTE.split()).lower()

        self.assertNotIn("mode() within group", normalized)
        self.assertIn("rca_weights", normalized)
        self.assertIn("row_number() over", normalized)
        self.assertIn("rca_weight", normalized)
        self.assertIn("not (sr.total_outage_menit > 0 and rw.rca_label = 'safe')", normalized)


if __name__ == "__main__":
    unittest.main()
