import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
ROUTER = BACKEND_ROOT / "routers" / "data_potensi.py"
MODELS = BACKEND_ROOT / "models" / "data_potensi.py"
MAIN = BACKEND_ROOT / "main.py"


class DataPotensiContractTest(unittest.TestCase):
    def read_router_source(self):
        self.assertTrue(ROUTER.exists(), "Data Potensi router must exist")
        return ROUTER.read_text(encoding="utf-8")

    def test_router_and_models_are_registered(self):
        self.assertTrue(MODELS.exists(), "Data Potensi models must exist")
        main_source = MAIN.read_text(encoding="utf-8")
        self.assertIn("data_potensi as data_potensi_router", main_source)
        self.assertIn("app.include_router(data_potensi_router.router", main_source)

    def test_dashboard_and_site_queries_share_every_advanced_filter(self):
        source = self.read_router_source()

        self.assertIn("DATA_POTENSI_FILTER_COLUMNS", source)
        self.assertIn("def build_data_potensi_filters", source)
        for filter_name in [
            "cluster",
            "kabupaten",
            "site_class",
            "type_site",
            "transport_type",
            "type_battery",
            "tp",
        ]:
            with self.subTest(filter_name=filter_name):
                self.assertRegex(source, rf'"{filter_name}"\s*:')

        for query_name in [
            "SCORECARD_QUERY",
            "CLUSTER_BREAKDOWN_QUERY",
            "TRANSPORT_TYPE_BREAKDOWN_QUERY",
            "SITE_CLASS_BREAKDOWN_QUERY",
            "_STACKED_BAR_TEMPLATE",
            "TP_DISTRIBUTION_QUERY",
            "SITES_QUERY",
            "SITES_COUNT_QUERY",
        ]:
            with self.subTest(query=query_name):
                query = source.split(f'{query_name} = """', 1)[1].split('"""', 1)[0]
                self.assertIn("{advanced_filter}", query)

        dashboard_endpoint = source.split(
            "async def get_data_potensi_dashboard",
            1,
        )[1].split('@router.get("/sites"', 1)[0]
        sites_endpoint = source.split(
            "async def get_data_potensi_sites",
            1,
        )[1]
        for filter_name in [
            "cluster",
            "kabupaten",
            "site_class",
            "type_site",
            "transport_type",
            "type_battery",
            "tp",
        ]:
            with self.subTest(endpoint_filter=filter_name):
                self.assertIn(f"{filter_name}: str | None = Query(None)", dashboard_endpoint)
                self.assertIn(f"{filter_name}: str | None = Query(None)", sites_endpoint)

    def test_filter_options_endpoint_exposes_all_table_dimensions(self):
        source = self.read_router_source()
        models_source = MODELS.read_text(encoding="utf-8")

        self.assertIn("class DataPotensiFilterOptions", models_source)
        for field_name in [
            "clusters",
            "kabupaten",
            "site_classes",
            "type_sites",
            "transport_types",
            "battery_types",
            "tower_providers",
        ]:
            with self.subTest(field_name=field_name):
                self.assertRegex(models_source, rf"{field_name}:\s*list\[str\]")

        self.assertIn('@router.get("/filter-options"', source)
        endpoint = source.split("async def get_data_potensi_filter_options", 1)[1].split(
            '@router.get("/dashboard"',
            1,
        )[0]
        self.assertIn("nop: str | None = Query(None)", endpoint)
        self.assertIn("status_site: str | None = Query(None)", endpoint)
        self.assertIn("FILTER_OPTION_COLUMNS", source)

    def test_site_list_uses_whitelisted_server_side_sorting(self):
        source = self.read_router_source()
        endpoint = source.split("async def get_data_potensi_sites", 1)[1]

        self.assertIn("DATA_POTENSI_SORT_EXPRESSIONS", source)
        for sort_key in [
            "site_id",
            "site_name",
            "cluster",
            "kabupaten",
            "site_class",
            "type_site",
            "transport_type",
            "type_battery",
            "jenis_rectifier",
            "tp",
            "status_site",
        ]:
            with self.subTest(sort_key=sort_key):
                self.assertRegex(source, rf'"{sort_key}"\s*:')

        self.assertIn("def build_data_potensi_order_by", source)
        self.assertIn("sort_by:", endpoint)
        self.assertIn("sort_dir:", endpoint)
        self.assertIn("order_by=build_data_potensi_order_by(sort_by, sort_dir)", endpoint)
        sites_query = source.split('SITES_QUERY = """', 1)[1].split('"""', 1)[0]
        self.assertIn("{order_by}", sites_query)

    def test_missing_categories_are_normalized_consistently(self):
        source = self.read_router_source()

        self.assertIn("def normalized_category_expression", source)
        self.assertIn("'Tidak ada'", source)
        self.assertIn("'tidak ada'", source.lower())
        self.assertIn("#n/a", source.lower())


if __name__ == "__main__":
    unittest.main()
