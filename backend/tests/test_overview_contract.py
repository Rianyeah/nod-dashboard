import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
ROUTER = BACKEND_ROOT / "routers" / "overview.py"
MODELS = BACKEND_ROOT / "models" / "overview.py"
MAIN = BACKEND_ROOT / "main.py"


class OverviewContractTest(unittest.TestCase):
    def test_overview_router_and_models_are_registered(self):
        self.assertTrue(ROUTER.exists(), "overview router must exist")
        self.assertTrue(MODELS.exists(), "overview models must exist")

        main_source = MAIN.read_text(encoding="utf-8")
        self.assertIn("overview as overview_router", main_source)
        self.assertIn("app.include_router(overview_router.router", main_source)

    def test_overview_endpoint_uses_existing_module_contracts(self):
        self.assertTrue(ROUTER.exists(), "overview router must exist")
        self.assertTrue(MODELS.exists(), "overview models must exist")
        source = ROUTER.read_text(encoding="utf-8")

        self.assertIn('@router.get("", response_model=OverviewResponse)', source)
        for helper in [
            "get_latest_period",
            "get_summary",
            "get_worst_sites",
            "get_available_months",
            "get_scorecards",
            "get_revenue_trend",
            "get_impact_service_filters",
            "get_impact_service_summary",
            "get_impact_service_daily_trend",
            "get_impact_service_distributions",
            "get_impact_service_top_sites",
            "get_transport_quality_summary",
            "get_transport_quality_trend",
            "get_transport_quality_priority_sites",
            "get_ticketing_filters",
            "get_ticketing_dashboard",
        ]:
            with self.subTest(helper=helper):
                self.assertIn(helper, source)

        self.assertIn("errors: dict[str, str]", MODELS.read_text(encoding="utf-8"))
        self.assertIn("impact_daily_trend", MODELS.read_text(encoding="utf-8"))
        self.assertIn("worst_revenue_sites", MODELS.read_text(encoding="utf-8"))

    def test_overview_accepts_dashboard_level_filters(self):
        self.assertTrue(ROUTER.exists(), "overview router must exist")
        source = ROUTER.read_text(encoding="utf-8")

        for query_param in [
            "bulan: int | None = Query(None",
            "tahun: int | None = Query(None",
            "nop: str | None = Query(None",
        ]:
            with self.subTest(query_param=query_param):
                self.assertIn(query_param, source)

    def test_overview_normalizes_nop_and_exposes_site_potential(self):
        self.assertTrue(ROUTER.exists(), "overview router must exist")
        self.assertTrue(MODELS.exists(), "overview models must exist")
        source = ROUTER.read_text(encoding="utf-8")
        models = MODELS.read_text(encoding="utf-8")

        for contract in [
            "normalize_nop_value",
            "data_site_master",
            '"Type Battery"',
            '"ENVA STATUS"',
            '"Transport Type"',
            '"Site Class"',
            "load_site_potential",
            "site_potential=site_potential",
            "site_master_nop",
            "module_nop",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, source)

        for model_contract in [
            "class SitePotentialMetric",
            "class SiteClassBreakdown",
            "class SitePotential",
            "site_lithium",
            "site_vrla",
            "enva_validated",
            "radio_ip",
            "class_breakdown",
            "site_potential: SitePotential",
        ]:
            with self.subTest(model_contract=model_contract):
                self.assertIn(model_contract, models)

    def test_overview_exposes_top_10_worst_availability_and_revenue(self):
        self.assertTrue(ROUTER.exists(), "overview router must exist")
        self.assertTrue(MODELS.exists(), "overview models must exist")
        source = ROUTER.read_text(encoding="utf-8")
        models = MODELS.read_text(encoding="utf-8")

        for contract in [
            "class WorstRevenueSite",
            "site_id",
            "site_name",
            "kabupaten",
            "total_revenue",
            "previous_revenue",
            "mom_percentage",
            "worst_revenue_sites: list[WorstRevenueSite]",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, models)

        for contract in [
            "WORST_REVENUE_SITES_QUERY",
            "load_worst_revenue_sites",
            "previous_trx_month",
            "HAVING COALESCE(SUM(t.rev), 0) > 1000000",
            "mom_percentage",
            "ORDER BY total_revenue ASC",
            "LIMIT :limit_val",
            "limit=10",
            "worst_revenue_sites=worst_revenue_sites",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, source)

    def test_overview_parallelizes_module_loaders_for_fast_home_response(self):
        self.assertTrue(ROUTER.exists(), "overview router must exist")
        source = ROUTER.read_text(encoding="utf-8")

        for contract in [
            "import asyncio",
            "async_session",
            "load_module_with_session",
            "asyncio.gather",
            "load_availability_module",
            "load_reporting_module",
            "load_impact_module",
            "load_transport_module",
            "load_ticketing_module",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, source)

    def test_overview_uses_compact_home_specific_loaders(self):
        self.assertTrue(ROUTER.exists(), "overview router must exist")
        source = ROUTER.read_text(encoding="utf-8")

        for contract in [
            "RECENT_REVENUE_TREND_QUERY",
            "COUNT(DISTINCT t.site_id) AS total_sites",
            "load_reporting_overview_metrics",
            "ReportingScorecard(",
            "load_recent_revenue_trend",
            "generate_series",
            "INTERVAL '5 months'",
            "site_month_metrics smm",
            "ensure_site_month_metrics",
            "AVAILABILITY_SUMMARY_QUERY",
            "AVAILABILITY_WORST_SITES_QUERY",
            "load_ticketing_overview_dashboard",
            "TicketingDashboard(",
            "sla_distribution=[]",
            "rc_category_pareto=[]",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, source)

    def test_overview_applies_selected_month_to_cross_module_data(self):
        source = ROUTER.read_text(encoding="utf-8")

        for contract in [
            "month_start, month_end = month_bounds(selected_tahun, selected_bulan)",
            "resolve_transport_date_for_period",
            "tahun=selected_tahun",
            "bulan=selected_bulan",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, source)

    def test_overview_impact_service_uses_latest_alarm_window_not_selected_month(self):
        source = ROUTER.read_text(encoding="utf-8")

        for contract in [
            "load_latest_impact_module",
            "get_impact_service_latest_window",
            "latest_impact_start_date",
            "latest_impact_end_date",
            "get_impact_service_last_7_days_trend",
            "impact_daily_trend=impact_daily_trend",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, source)

        if "async def load_latest_impact_module" in source:
            impact_section = source.split("async def load_latest_impact_module", 1)[1].split("async def load_transport_module", 1)[0]
            self.assertNotIn("month_start", impact_section)
            self.assertNotIn("month_end", impact_section)


if __name__ == "__main__":
    unittest.main()
