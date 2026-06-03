import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
ROUTER = BACKEND_ROOT / "routers" / "impact_service.py"
MODELS = BACKEND_ROOT / "models" / "impact_service.py"
MAIN = BACKEND_ROOT / "main.py"


class ImpactServiceContractTest(unittest.TestCase):
    def read_router_source(self):
        self.assertTrue(ROUTER.exists(), "impact service router must exist")
        return ROUTER.read_text(encoding="utf-8")

    def test_impact_service_files_and_router_registration_exist(self):
        self.assertTrue(ROUTER.exists(), "impact service router must exist")
        self.assertTrue(MODELS.exists(), "impact service models must exist")

        main_source = MAIN.read_text(encoding="utf-8")
        self.assertIn("impact_service as impact_service_router", main_source)
        self.assertIn("app.include_router(impact_service_router.router", main_source)

    def test_every_query_uses_global_date_range_and_nop_filter(self):
        source = self.read_router_source()
        normalized = " ".join(source.split()).lower()

        for query_name in [
            "SUMMARY_QUERY",
            "DAILY_TREND_QUERY",
            "SEVERITY_DISTRIBUTION_QUERY",
            "CATEGORY_DISTRIBUTION_QUERY",
            "AGING_RANGE_DISTRIBUTION_QUERY",
            "SOW_DISTRIBUTION_QUERY",
            "NOP_DISTRIBUTION_QUERY",
            "TOP_ALARMS_QUERY",
            "TOP_SITES_QUERY",
            "ALARMS_COUNT_QUERY",
            "ALARMS_LIST_QUERY",
            "ALARM_DETAIL_QUERY",
        ]:
            with self.subTest(query=query_name):
                self.assertRegex(
                    source,
                    rf"{query_name}\s*=\s*\"\"\"[\s\S]*?tanggal\s+between\s+:start_date\s+and\s+:end_date",
                )
                self.assertRegex(
                    source,
                    rf"{query_name}\s*=\s*\"\"\"[\s\S]*?\{{nop_filter\}}",
                )

        self.assertIn("def build_nop_filter", source)
        self.assertIn("nop = :nop", normalized)

    def test_summary_scorecards_match_prd_formulas(self):
        source = self.read_router_source()
        summary_query = source.split('SUMMARY_QUERY = """', 1)[1].split('"""', 1)[0].lower()

        self.assertIn("count(*) as total_alarms", summary_query)
        self.assertIn("count(distinct site_id) as impacted_sites", summary_query)
        self.assertIn("upper(status) = 'open'", summary_query)
        self.assertIn("upper(status) = 'clear'", summary_query)
        self.assertIn("upper(sow) = 'tsel'", summary_query)

    def test_filter_nops_are_loaded_from_nop_column(self):
        source = self.read_router_source()
        nop_query = source.split('FILTER_NOPS_QUERY = """', 1)[1].split('"""', 1)[0].lower()

        self.assertIn("trim(nop) as nop", nop_query)
        self.assertIn("from alarm_impact_service", nop_query)
        self.assertIn("where nop is not null", nop_query)

    def test_filters_expose_today_aware_default_date(self):
        source = self.read_router_source()
        models_source = MODELS.read_text(encoding="utf-8").lower()
        filters_query = source.split('FILTERS_QUERY = """', 1)[1].split('"""', 1)[0].lower()

        self.assertIn("cast(:today as date) as today", filters_query)
        self.assertIn("has_today_data", filters_query)
        self.assertIn("default_date", filters_query)
        self.assertIn("where tanggal = cast(:today as date)", filters_query)
        self.assertIn("then cast(:today as date)", filters_query)
        self.assertIn("else max(tanggal)", filters_query)
        self.assertIn("get_jakarta_today", source)
        self.assertIn('"today": get_jakarta_today()', source)

        self.assertIn("today: optional[date]", models_source)
        self.assertIn("default_date: optional[date]", models_source)
        self.assertIn("has_today_data: bool", models_source)

    def test_endpoint_contracts_are_present(self):
        source = self.read_router_source()

        for route in [
            '@router.get("/filters"',
            '@router.get("/summary"',
            '@router.get("/daily-trend"',
            '@router.get("/distributions"',
            '@router.get("/top-alarms"',
            '@router.get("/top-sites"',
            '@router.get("/alarms"',
            '@router.get("/alarms/{alarm_id}"',
        ]:
            with self.subTest(route=route):
                self.assertIn(route, source)

        self.assertRegex(source, r"start_date:\s*date\s*=\s*Query\(")
        self.assertRegex(source, r"end_date:\s*date\s*=\s*Query\(")
        self.assertRegex(source, r"nop:\s*str\s*\|\s*None\s*=\s*Query\(None")

    def test_spa_fallback_does_not_mask_missing_api_routes(self):
        main_source = MAIN.read_text(encoding="utf-8")

        self.assertIn("api_prefix_path = API_PREFIX.strip", main_source)
        self.assertIn("full_path.startswith(f\"{api_prefix_path}/\")", main_source)
        self.assertIn("raise HTTPException(status_code=404", main_source)


if __name__ == "__main__":
    unittest.main()
