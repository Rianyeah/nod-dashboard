import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
ROUTER = BACKEND_ROOT / "routers" / "transport_quality.py"
MODELS = BACKEND_ROOT / "models" / "transport_quality.py"
MAIN = BACKEND_ROOT / "main.py"


class TransportQualityContractTest(unittest.TestCase):
    def read_router_source(self):
        self.assertTrue(ROUTER.exists(), "transport quality router must exist")
        return ROUTER.read_text(encoding="utf-8")

    def test_transport_quality_files_and_router_registration_exist(self):
        self.assertTrue(ROUTER.exists(), "transport quality router must exist")
        self.assertTrue(MODELS.exists(), "transport quality models must exist")

        main_source = MAIN.read_text(encoding="utf-8")
        self.assertIn("transport_quality as transport_quality_router", main_source)
        self.assertIn("app.include_router(transport_quality_router.router", main_source)

    def test_endpoint_contracts_are_present(self):
        source = self.read_router_source()

        for route in [
            '@router.get("/filters"',
            '@router.get("/summary"',
            '@router.get("/trend"',
            '@router.get("/distributions"',
            '@router.get("/breakdowns"',
            '@router.get("/priority-sites"',
        ]:
            with self.subTest(route=route):
                self.assertIn(route, source)

        for query_param in [
            "date_filter: date | None = Query(None",
            "nop: str | None = Query(None",
            "kabupaten: str | None = Query(None",
            "transport_type: str | None = Query(None",
            "thi_status: str | None = Query(None",
            "distribution_pl: str | None = Query(None",
            "pl_status_0_1_pct: str | None = Query(None",
            "distribution_lat: str | None = Query(None",
            "jitter_status: str | None = Query(None",
        ]:
            with self.subTest(query_param=query_param):
                self.assertIn(query_param, source)

    def test_threshold_and_priority_formulas_match_prd(self):
        source = self.read_router_source().lower()

        self.assertIn("avg_packet_loss > 1", source)
        self.assertIn("latency > 5", source)
        self.assertIn("upper(coalesce(flag_pl_status", source)
        self.assertIn("upper(coalesce(thi_status", source)
        self.assertIn("= 'fail'", source)
        self.assertIn("then 'p1'", source)
        self.assertIn("then 'p2'", source)

    def test_global_filters_are_applied_to_data_queries(self):
        source = self.read_router_source()

        for helper_text in [
            "build_filter_clause",
            "p.date = :date_filter",
            "p.nop = :nop",
            "p.kabupaten = :kabupaten",
            "p.transport_type = :transport_type",
            "p.thi_status = :thi_status",
            "p.distribution_pl = :distribution_pl",
            "p.pl_status_0_1_pct = :pl_status_0_1_pct",
            "p.distribution_lat = :distribution_lat",
            "p.jitter_status = :jitter_status",
        ]:
            with self.subTest(helper_text=helper_text):
                self.assertIn(helper_text, source)

        for query_name in [
            "SUMMARY_QUERY",
            "TREND_QUERY",
            "PL_DISTRIBUTION_QUERY",
            "LATENCY_DISTRIBUTION_QUERY",
            "BREAKDOWN_QUERY",
            "PRIORITY_COUNT_QUERY",
            "PRIORITY_LIST_QUERY",
        ]:
            with self.subTest(query=query_name):
                self.assertRegex(
                    source,
                    rf"{query_name}\s*=\s*\"\"\"[\s\S]*?\{{filter_clause\}}",
                )

    def test_filters_endpoint_exposes_date_week_periods_and_options(self):
        source = self.read_router_source().lower()
        models = MODELS.read_text(encoding="utf-8")

        self.assertIn("filter_periods_query", source)
        self.assertIn("filter_options_query", source)
        self.assertIn("to_char(date, '\"w\"iw - yyyy-mm-dd')", source)
        self.assertIn("nullif(trim", source)
        self.assertIn("TransportQualityFilters", models)
        self.assertIn("periods: list[TransportQualityPeriod]", models)

    def test_priority_sites_are_paginated(self):
        source = self.read_router_source()
        models = MODELS.read_text(encoding="utf-8")

        self.assertIn("LIMIT :limit OFFSET :offset", source)
        self.assertIn("TransportQualityPrioritySiteResponse", models)
        self.assertIn("total_pages", models)


if __name__ == "__main__":
    unittest.main()
