import unittest
from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routers.data_potensi import (
    READINESS_BY_KABUPATEN_QUERY,
    TRANSPORT_CONFIGURATION_QUERY,
    rows_to_readiness,
    rows_to_transport_matrix,
)


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
        self.assertIn("#ref!", source.lower())

    def test_readiness_rows_calculate_each_status_percentage(self):
        items = rows_to_readiness([
            {
                "kabupaten": "SIDOARJO",
                "total_sites": 10,
                "enva_ready": 9,
                "dual_eas_ready": 2,
                "bblti_software_ready": 3,
            }
        ])

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].kabupaten, "SIDOARJO")
        self.assertEqual(items[0].enva_ready_pct, 90.0)
        self.assertEqual(items[0].dual_eas_ready_pct, 20.0)
        self.assertEqual(items[0].bblti_software_ready_pct, 30.0)

    def test_transport_rows_preserve_dimensions_and_filtered_share(self):
        items = rows_to_transport_matrix([
            {
                "transport_type": "FO_TELKOM",
                "modem_transport": "ONT",
                "jumper_modem": "UTP",
                "site_count": 8,
                "filtered_total": 10,
            }
        ])

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].transport_type, "FO_TELKOM")
        self.assertEqual(items[0].modem_transport, "ONT")
        self.assertEqual(items[0].jumper_modem, "UTP")
        self.assertEqual(items[0].percentage, 80.0)

    def test_new_matrix_queries_share_dashboard_filters(self):
        for query in [READINESS_BY_KABUPATEN_QUERY, TRANSPORT_CONFIGURATION_QUERY]:
            with self.subTest(query=query[:40]):
                self.assertIn("{nop_filter}", query)
                self.assertIn("{status_filter}", query)
                self.assertIn("{advanced_filter}", query)

    def test_readiness_query_uses_approved_exact_business_rules(self):
        normalized = " ".join(READINESS_BY_KABUPATEN_QUERY.upper().split())

        self.assertIn('D."ENVA STATUS"', normalized)
        self.assertIn("= 'COMPLETED'", normalized)
        self.assertIn('D."DUAL_EAS"', normalized)
        self.assertIn('D."BBLTI_SOFTWARE"', normalized)
        self.assertIn("LIKE 'YES%'", normalized)

    def test_dashboard_response_and_cache_are_versioned_for_new_arrays(self):
        source = self.read_router_source()
        models_source = MODELS.read_text(encoding="utf-8")

        self.assertIn("readiness_by_kabupaten", models_source)
        self.assertIn("transport_configuration_matrix", models_source)
        self.assertIn('"dashboard-v2"', source)


if __name__ == "__main__":
    unittest.main()
