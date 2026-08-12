import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
ROUTER = BACKEND_ROOT / "routers" / "ticketing.py"
MODELS = BACKEND_ROOT / "models" / "ticketing.py"
MAIN = BACKEND_ROOT / "main.py"


class TicketingContractTest(unittest.TestCase):
    def read_router_source(self):
        self.assertTrue(ROUTER.exists(), "ticketing router must exist")
        return ROUTER.read_text(encoding="utf-8")

    def test_ticketing_files_and_router_registration_exist(self):
        self.assertTrue(ROUTER.exists(), "ticketing router must exist")
        self.assertTrue(MODELS.exists(), "ticketing models must exist")

        main_source = MAIN.read_text(encoding="utf-8")
        self.assertIn("ticketing as ticketing_router", main_source)
        self.assertIn("app.include_router(ticketing_router.router", main_source)

    def test_endpoint_contracts_are_present(self):
        source = self.read_router_source()

        for route in [
            '@router.get("/filters"',
            '@router.get("/dashboard"',
            '@router.get("/tickets"',
            '@router.get("/tickets/export"',
            '@router.get("/tickets/{ticket_number_swfm}"',
        ]:
            with self.subTest(route=route):
                self.assertIn(route, source)

        for query_param in [
            "start_date: date | None = Query(None",
            "end_date: date | None = Query(None",
            "tahun: int | None = Query(None",
            "bulan: int | None = Query(None",
            "nop: str | None = Query(None",
            "cluster_to: str | None = Query(None",
            "kategori_tt: str | None = Query(None",
            "takeover: str | None = Query(None",
            "ticket_swfm_status: str | None = Query(None",
            "backup_sukses: str | None = Query(None",
            "rc_category: str | None = Query(None",
            "is_escalate: bool | None = Query(None",
            "period_start: str | None = Query(None",
            "period_end: str | None = Query(None",
        ]:
            with self.subTest(query_param=query_param):
                self.assertIn(query_param, source)

    def test_full_filtered_csv_export_includes_period_coverage_metadata(self):
        source = self.read_router_source()

        for contract in [
            "StreamingResponse",
            "session.stream",
            '"report_period"',
            '"missing_months"',
            "period_meta.period_start",
            "period_meta.period_end",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, source)

    def test_global_filters_and_category_normalization_are_applied(self):
        source = self.read_router_source()
        normalized = " ".join(source.split()).lower()

        for helper_text in [
            "build_filter_clause",
            "t.created_at >= CAST(:start_date AS date)",
            "t.created_at < (CAST(:end_date AS date) + interval '1 day')",
            "t.tahun = :tahun",
            "period_month_sql('t.periode_bulan')} = :bulan",
            "t.nop = :nop",
            "t.cluster_to = :cluster_to",
            "normalize_category_sql",
            "UPPER(TRIM(t.takeover)) = UPPER(TRIM(:takeover))",
            "t.ticket_swfm_status = :ticket_swfm_status",
            "t.backup_sukses = :backup_sukses",
            "coalesce(t.rc_category, 'Unclassified') = :rc_category",
            "t.is_escalate = :is_escalate",
        ]:
            with self.subTest(helper_text=helper_text):
                self.assertIn(helper_text.lower(), normalized)

        self.assertIn("def normalize_category_sql", source)
        self.assertIn("WHEN upper(trim({column})) LIKE 'TS%' THEN 'TS'", source)
        self.assertIn("WHEN upper(trim({column})) = 'BPS' THEN 'BPS'", source)
        self.assertIn("def period_month_sql", source)
        self.assertIn("WHEN 'mei' THEN 5", source)

    def test_dashboard_query_exposes_ticket_category_and_clean_metrics(self):
        source = self.read_router_source()
        dashboard_query = source.split('DASHBOARD_SUMMARY_QUERY = """', 1)[1].split('"""', 1)[0].lower()

        self.assertIn("jsonb_build_object", dashboard_query)
        self.assertIn("'bps'", dashboard_query)
        self.assertIn("'ts'", dashboard_query)
        self.assertIn("ticket_category", dashboard_query)
        self.assertIn("backup_sukses_rate", dashboard_query)
        self.assertIn("visitation_tickets", dashboard_query)
        self.assertIn("visitation_rate", dashboard_query)
        self.assertIn("trim(visitation) = 'visit site'", dashboard_query)
        self.assertIn("extract(epoch from mttr) >= 0", dashboard_query)
        self.assertIn("average_mttr_hours", dashboard_query)
        self.assertIn("avg(extract(epoch from mttr))", dashboard_query)
        self.assertIn("percentile_cont(0.5)", dashboard_query)
        self.assertIn("percentile_cont(0.9)", dashboard_query)

        trend_query = source.split('TREND_QUERY = """', 1)[1].split('"""', 1)[0].lower()
        self.assertIn("date_trunc('{trend_unit}', created_at)", trend_query)
        self.assertIn("'{trend_label_format}'", trend_query)
        self.assertIn("group by 1, 2", trend_query)
        self.assertIn("TREND_BUCKET_SQL", source)
        self.assertIn("resolve_trend_granularity", source)

    def test_location_breakdown_is_always_kabupaten_or_kota(self):
        source = self.read_router_source()

        self.assertIn("LOCATION_BREAKDOWN_QUERY", source)
        self.assertIn("'Kabupaten/Kota Distribution'", source)
        self.assertIn("t.kabupaten_kota", source)
        self.assertNotIn("'NOP Distribution'", source)

        location_query = source.split('LOCATION_BREAKDOWN_QUERY = """', 1)[1].split('"""', 1)[0]
        for metric in [
            "takeover_tickets",
            "visitation_tickets",
            "backup_sukses_tickets",
            "escalated_tickets",
        ]:
            with self.subTest(metric=metric):
                self.assertIn(metric, location_query)
        self.assertNotIn("LIMIT 12", location_query)

    def test_fop_performance_query_uses_filtered_pic_aggregates_and_ranker(self):
        source = self.read_router_source()
        models = MODELS.read_text(encoding="utf-8")

        self.assertIn('FOP_PERFORMANCE_QUERY = """', source)
        fop_query = source.split('FOP_PERFORMANCE_QUERY = """', 1)[1].split('"""', 1)[0]
        for contract in [
            "pic_take_over_ticket",
            "takeover_tickets",
            "visitation_tickets",
            "backup_sukses_tickets",
            "average_response_minutes",
            "{filter_clause}",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, fop_query)

        self.assertIn("rank_fop_performance", source)
        self.assertIn("fop_performance=fop_performance", source)
        self.assertIn("TicketingFopPerformanceItem", models)

    def test_visiting_and_backup_distribution_is_broken_down_by_kabupaten(self):
        source = self.read_router_source()

        self.assertIn("VISITING_BACKUP_BY_KABUPATEN_QUERY", source)
        self.assertIn("visiting_site", source)
        self.assertIn("backup_genset", source)
        self.assertIn("backup_rate", source)
        self.assertIn("TRIM(t.visitation) = 'Visit site'", source)
        self.assertIn("t.backup_sukses = 'BU Genset'", source)
        self.assertIn("coalesce(NULLIF(TRIM(t.kabupaten_kota), ''), 'Unknown')", source)

    def test_type_ticket_distribution_is_filter_aware_and_deterministic(self):
        source = self.read_router_source()
        models = MODELS.read_text(encoding="utf-8")

        self.assertIn(
            "type_ticket_distribution: list[TicketingDistributionItem] = []",
            models,
        )
        self.assertIn('TYPE_TICKET_DISTRIBUTION_QUERY = """', source)

        query = source.split('TYPE_TICKET_DISTRIBUTION_QUERY = """', 1)[1].split('"""', 1)[0]
        normalized = " ".join(query.split()).upper()
        for contract in [
            "UPPER(TRIM(T.TYPE_TICKET))",
            "{FILTER_CLAUSE}",
            "'INCIDENT'",
            "'EVENT'",
            "LEFT JOIN",
            "ORDER BY C.SORT_ORDER",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, normalized)

        self.assertIn("type_ticket_distribution = await rows_to_dicts(", source)
        self.assertIn("TYPE_TICKET_DISTRIBUTION_QUERY.format(filter_clause=filter_clause)", source)
        self.assertIn("type_ticket_distribution=type_ticket_distribution", source)

    def test_ticketing_models_include_dashboard_and_paginated_table_contracts(self):
        models = MODELS.read_text(encoding="utf-8")

        for model_name in [
            "TicketingFilters",
            "TicketingSummary",
            "TicketingDashboard",
            "TicketingTicketResponse",
            "TicketingTicketDetail",
        ]:
            with self.subTest(model_name=model_name):
                self.assertIn(model_name, models)

        self.assertIn("ticket_category: TicketCategorySummary", models)
        self.assertIn("takeovers: list[str]", models)
        self.assertIn("average_mttr_hours: float | None", models)
        self.assertIn("visitation_tickets: int", models)
        self.assertIn("visitation_rate: float", models)
        self.assertIn("day: date", models)
        self.assertIn("TicketingVisitingBackupItem", models)
        self.assertIn("TicketingLocationBreakdownItem", models)
        self.assertIn("TicketingFopPerformanceItem", models)
        self.assertIn('trend_granularity: str = "day"', models)
        self.assertIn("visiting_backup_distribution", models)
        self.assertIn("fop_performance", models)
        self.assertIn("total_pages: int", models)

    def test_filter_contract_exposes_backend_default_latest_month(self):
        source = self.read_router_source()
        models = MODELS.read_text(encoding="utf-8")

        self.assertIn("default_start_date: date | None", models)
        self.assertIn("default_end_date: date | None", models)
        self.assertIn("LATEST_MONTH_DEFAULT_QUERY", source)
        self.assertIn("default_start_date", source)
        self.assertIn("default_end_date", source)

    def test_summary_exposes_total_ticket_mom_metrics(self):
        source = self.read_router_source()
        models = MODELS.read_text(encoding="utf-8")

        for contract in [
            "total_tickets_mom_delta: int | None = None",
            "total_tickets_mom_rate: float | None = None",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, models)

        for contract in [
            "PREVIOUS_MONTH_TICKETS_QUERY",
            "previous_total_tickets",
            "total_tickets_mom_delta",
            "total_tickets_mom_rate",
            "previous_month_bounds",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, source)


if __name__ == "__main__":
    unittest.main()
