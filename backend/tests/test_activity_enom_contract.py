import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
ROUTER = BACKEND_ROOT / "routers" / "activity_enom.py"
MODELS = BACKEND_ROOT / "models" / "activity_enom.py"
MAIN = BACKEND_ROOT / "main.py"


class ActivityEnomContractTest(unittest.TestCase):
    def read_router_source(self):
        self.assertTrue(ROUTER.exists(), "activity enom router must exist")
        return ROUTER.read_text(encoding="utf-8")

    def test_activity_enom_files_and_router_registration_exist(self):
        self.assertTrue(ROUTER.exists(), "activity enom router must exist")
        self.assertTrue(MODELS.exists(), "activity enom models must exist")

        main_source = MAIN.read_text(encoding="utf-8")
        self.assertIn("activity_enom as activity_enom_router", main_source)
        self.assertIn("app.include_router(activity_enom_router.router", main_source)

    def test_endpoint_contracts_are_present(self):
        source = self.read_router_source()

        for route in [
            '@router.get("/filters"',
            '@router.get("/summary"',
            '@router.get("/trend"',
            '@router.get("/breakdowns"',
            '@router.get("/top-activities"',
            '@router.get("/activities"',
            '@router.get("/activities/{activity_id}"',
        ]:
            with self.subTest(route=route):
                self.assertIn(route, source)

        for query_param in [
            "month_date: date = Query(",
            "nop: str | None = Query(None",
            "category: str | None = Query(None",
        ]:
            with self.subTest(query_param=query_param):
                self.assertIn(query_param, source)

    def test_global_filters_and_kabupaten_breakdown_contract(self):
        source = self.read_router_source()

        for contract in [
            "TABLE_NAME = \"public.proker_enom_jatim_2026\"",
            "build_filter_clause",
            "CAST(:month_date AS date) AS month_date",
            "a.create_date = :month_date",
            "a.nop = :nop",
            "a.part = :category",
            "COALESCE(NULLIF(TRIM(a.kabupaten), ''), 'Unknown')",
            "selected_nop_breakdown = bool(params.get(\"nop\"))",
            "breakdown_title=\"Kabupaten Contribution\"",
            "breakdown_title=\"NOP Contribution\"",
            "ranking_title=\"Ranking Kabupaten\"",
            "ranking_title=\"Ranking NOP\"",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, source)

    def test_ranking_contract_uses_completion_rate(self):
        source = self.read_router_source()
        models = MODELS.read_text(encoding="utf-8")

        for contract in [
            "RANKING_QUERY",
            "ROUND(",
            "100.0 * COUNT(*) FILTER (WHERE UPPER(a.status) = 'CLOSE') / NULLIF(COUNT(*), 0)",
            "ORDER BY completion_rate DESC, close DESC, total DESC, label",
            "ranking_title",
            "ranking",
            "completion_rate",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, source + models)

    def test_category_distribution_does_not_duplicate_top_activity(self):
        source = self.read_router_source()
        models = MODELS.read_text(encoding="utf-8")

        for contract in [
            "CATEGORY_DISTRIBUTION_QUERY",
            "ActivityEnomBreakdowns",
            "by_category",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, source + models)

        self.assertNotIn("ACTIVITY_BY_CATEGORY_QUERY", source)
        self.assertNotIn("activity_category", source)
        self.assertNotIn("by_activity", models)

    def test_activity_table_sorting_is_whitelisted(self):
        source = self.read_router_source()

        for contract in [
            "sort_by: str = Query(\"create_date\")",
            "sort_dir: str = Query(\"desc\")",
            "sort_map = {",
            "\"create_date\": \"a.create_date\"",
            "\"site_id\": \"a.site_id\"",
            "\"site_name\": \"a.site_name\"",
            "\"nop\": \"a.nop\"",
            "\"kabupaten\": \"a.kabupaten\"",
            "\"part\": \"a.part\"",
            "\"activity\": \"a.activity\"",
            "\"status\": \"a.status\"",
            "\"week_done\": \"a.week_done\"",
            "\"date_done\": \"a.date_done\"",
            "ORDER BY {sort_column} {sort_direction}, a.id DESC",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, source)

    def test_models_expose_dashboard_and_table_shapes(self):
        models = MODELS.read_text(encoding="utf-8")

        for contract in [
            "class ActivityEnomFilters",
            "class ActivityEnomMonthOption",
            "class ActivityEnomSummary",
            "class ActivityEnomDistributionItem",
            "class ActivityEnomBreakdowns",
            "class ActivityEnomTopActivity",
            "class ActivityEnomActivityRow",
            "class ActivityEnomActivityResponse",
            "class ActivityEnomActivityDetail",
            "completion_rate",
            "kabupaten",
            "source_row_number",
            "total_pages",
        ]:
            with self.subTest(contract=contract):
                self.assertIn(contract, models)


if __name__ == "__main__":
    unittest.main()
