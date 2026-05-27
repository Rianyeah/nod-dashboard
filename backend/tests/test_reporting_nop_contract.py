import unittest
from pathlib import Path


REPORTING_ROUTER = Path(__file__).resolve().parents[1] / "routers" / "reporting.py"


class ReportingNopContractTest(unittest.TestCase):
    def setUp(self):
        self.source = REPORTING_ROUTER.read_text(encoding="utf-8")
        self.normalized = " ".join(self.source.split()).lower()

    def test_reporting_endpoints_accept_optional_nop_filter(self):
        for endpoint in [
            "get_scorecards",
            "get_revenue_by_kabupaten",
            "get_site_class_by_kabupaten",
            "get_battery_by_kabupaten",
            "get_revenue_trend",
        ]:
            self.assertRegex(
                self.source,
                rf"async def {endpoint}\([\s\S]*?nop:\s*str\s*=\s*Query\(None",
            )

    def test_reporting_queries_apply_nop_filter_at_source(self):
        for query_name in [
            "SCORECARDS_QUERY",
            "AVAILABILITY_SCORECARD_QUERY",
            "REVENUE_BY_KABUPATEN_QUERY",
            "SITE_CLASS_BY_KABUPATEN_QUERY",
            "BATTERY_BY_KABUPATEN_QUERY",
            "REVENUE_TREND_QUERY",
        ]:
            self.assertRegex(
                self.source,
                rf"{query_name}\s*=\s*\"\"\"[\s\S]*?\{{nop_filter\}}",
                f"{query_name} must include the shared NOP filter placeholder",
            )

        self.assertIn('d."nop" = :nop', self.normalized)
        self.assertIn('d2."nop" = :nop', self.normalized)

    def test_reporting_trend_availability_uses_monthly_cache_with_log_fallback(self):
        self.assertIn("site_month_metrics", self.normalized)
        self.assertIn("availability_logs_jatim a", self.normalized)
        self.assertIn("coalesce(c.avg_availability, l.avg_availability)", self.normalized)
        self.assertIn('a."site id" = d."siteid"', self.normalized)

    def test_reporting_scorecard_and_table_availability_use_log_fallback(self):
        scorecard_query = self.source.split('AVAILABILITY_SCORECARD_QUERY = """', 1)[1].split('"""', 1)[0].lower()
        revenue_query = self.source.split('REVENUE_BY_KABUPATEN_QUERY = """', 1)[1].split('"""', 1)[0].lower()

        self.assertIn("availability_logs_jatim", scorecard_query)
        self.assertIn("coalesce(c.avg_availability, l.avg_availability)", scorecard_query)
        self.assertIn("availability_logs_jatim", revenue_query)
        self.assertIn("coalesce(c.avg_availability, l.avg_availability)", revenue_query)
        self.assertIn('a."site id" = d2."siteid"', revenue_query)

    def test_reporting_endpoints_pass_nop_params_to_sql(self):
        self.assertIn("build_nop_filter", self.source)
        self.assertGreaterEqual(self.source.count('"nop": nop'), 5)


if __name__ == "__main__":
    unittest.main()
