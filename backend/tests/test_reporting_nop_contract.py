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

    def test_total_site_scorecard_uses_active_master_sites(self):
        for contract in [
            "ACTIVE_MASTER_SITE_BREAKDOWN_QUERY",
            'd."Status Site" = \'Active\'',
            "FROM data_site_master d",
            "site_result",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, self.source)

    def test_performance_table_includes_ticket_and_proker_breakdowns(self):
        model_source = (REPORTING_ROUTER.parents[1] / "models" / "reporting.py").read_text(encoding="utf-8")

        for model_contract in [
            "ticket_swfm_bps: int = 0",
            "ticket_swfm_ts: int = 0",
            "proker_open: int = 0",
            "proker_closed: int = 0",
        ]:
            with self.subTest(model_contract=model_contract):
                self.assertIn(model_contract, model_source)

        for query_contract in [
            "ticket_aggregate AS",
            "proker_aggregate AS",
            "public.ticketing_fault_center",
            "public.proker_enom_jatim_2026",
            "ticket_swfm_bps",
            "ticket_swfm_ts",
            "proker_open",
            "proker_closed",
        ]:
            with self.subTest(query_contract=query_contract):
                self.assertIn(query_contract, self.source)

    def test_reporting_scorecard_exposes_site_composition_and_ytd(self):
        model_source = (REPORTING_ROUTER.parents[1] / "models" / "reporting.py").read_text(encoding="utf-8")

        for field in [
            "epm_sites: int = 0",
            "non_epm_sites: int = 0",
            "revenue_ytd: int = 0",
            "payload_ytd: int = 0",
        ]:
            with self.subTest(field=field):
                self.assertIn(field, model_source)

        for contract in [
            "ACTIVE_MASTER_SITE_BREAKDOWN_QUERY",
            "UPPER(TRIM(d.\"Siteid\")) LIKE 'EPM%'",
            "UPPER(TRIM(d.\"Siteid\")) NOT LIKE 'EPM%'",
            "YTD_SCORECARDS_QUERY",
            "CAST(SPLIT_PART(t.trx_month, '-', 1) AS INTEGER) = :tahun",
            "CAST(SPLIT_PART(t.trx_month, '-', 2) AS INTEGER) <= :bulan",
            "revenue_ytd",
            "payload_ytd",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, self.source)


if __name__ == "__main__":
    unittest.main()
