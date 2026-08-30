import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from models.site import SiteMapResponse
from site_query import build_site_filters, build_site_order, build_site_search_filter


class SiteExplorerQueryTest(unittest.TestCase):
    def test_filters_and_search_use_requested_alias_and_bound_params(self):
        filters, params = build_site_filters(
            kabupaten="KOTA PASURUAN",
            cluster="PASURUAN",
            kelas="PLATINUM",
            nop="PASURUAN",
            alias="master",
        )
        search, search_params = build_site_search_filter("PSR", alias="master")

        self.assertIn('master."Kabupaten/KOTA" = :kabupaten', filters)
        self.assertIn('master."New Cluster" = :cluster', filters)
        self.assertIn('master."Site Class" = :kelas', filters)
        self.assertIn('master."NOP" = :nop', filters)
        self.assertEqual(
            params,
            {
                "kabupaten": "KOTA PASURUAN",
                "cluster": "PASURUAN",
                "kelas": "PLATINUM",
                "nop": "PASURUAN",
            },
        )
        self.assertIn('master."Siteid" ILIKE :q', search)
        self.assertIn('master."Site Name" ILIKE :q', search)
        self.assertIn('master."Kabupaten/KOTA" ILIKE :q', search)
        self.assertEqual(search_params, {"q": "%PSR%"})

    def test_empty_filters_do_not_emit_sql_or_params(self):
        self.assertEqual(build_site_filters(alias="m"), ("", {}))
        self.assertEqual(build_site_search_filter("  ", alias="m"), ("", {}))

    def test_sorting_is_whitelisted_null_safe_and_deterministic(self):
        self.assertEqual(
            build_site_order("avg_availability", "desc"),
            'agg.avg_availability DESC NULLS LAST, m."Siteid" ASC',
        )
        self.assertEqual(
            build_site_order("site_name", "asc", alias="master", metrics_alias="metrics"),
            'master."Site Name" ASC NULLS LAST, master."Siteid" ASC',
        )
        self.assertEqual(
            build_site_order("not-a-column", "sideways"),
            'm."Siteid" ASC NULLS LAST',
        )

    def test_map_response_keeps_total_separate_from_coordinate_count(self):
        payload = SiteMapResponse(data=[], total=20, with_coordinates=17)

        self.assertEqual(payload.total, 20)
        self.assertEqual(payload.with_coordinates, 17)
        self.assertEqual(payload.data, [])


if __name__ == "__main__":
    unittest.main()
