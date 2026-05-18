import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class MetricsCacheContractTest(unittest.TestCase):
    def test_dashboard_queries_read_precomputed_site_month_metrics(self):
        from queries.sql_queries import (
            MAP_SITES_QUERY,
            SUMMARY_CARD_QUERY,
            WORST_SITES_QUERY,
            SITES_LIST_QUERY,
        )

        for query in [MAP_SITES_QUERY, SUMMARY_CARD_QUERY, WORST_SITES_QUERY, SITES_LIST_QUERY]:
            normalized = " ".join(query.split()).lower()
            self.assertIn("site_month_metrics", normalized)
            self.assertNotIn("with site_raw as", normalized)
            self.assertNotIn("from availability_logs_jatim", normalized)

    def test_sites_count_query_counts_only_monthly_metric_rows(self):
        from queries.sql_queries import SITES_COUNT_QUERY

        normalized = " ".join(SITES_COUNT_QUERY.split()).lower()

        self.assertIn("site_month_metrics", normalized)
        self.assertIn("metrics.tahun = :tahun", normalized)
        self.assertIn("metrics.bulan = :bulan", normalized)

    def test_refresh_query_rebuilds_month_and_preserves_weighted_rca_rule(self):
        from queries.metrics_cache import REFRESH_SITE_MONTH_INSERT_QUERY, REFRESH_SITE_MONTH_DELETE_QUERY

        insert_normalized = " ".join(REFRESH_SITE_MONTH_INSERT_QUERY.split()).lower()
        delete_normalized = " ".join(REFRESH_SITE_MONTH_DELETE_QUERY.split()).lower()

        self.assertIn("delete from site_month_metrics", delete_normalized)
        self.assertIn("insert into site_month_metrics", insert_normalized)
        self.assertIn("rca_weights", insert_normalized)
        self.assertIn("row_number() over", insert_normalized)
        self.assertIn("not (sr.total_outage_menit > 0 and rw.rca_label = 'safe')", insert_normalized)

    def test_bootstrap_sql_defines_table_and_indexes(self):
        bootstrap_path = Path(__file__).resolve().parents[1] / "sql" / "site_month_metrics.sql"
        sql = bootstrap_path.read_text(encoding="utf-8").lower()

        self.assertIn("create table if not exists site_month_metrics", sql)
        self.assertIn("primary key (tahun, bulan, site_id)", sql)
        self.assertIn('availability_logs_jatim ("tahun", "bulan", "site id")', sql)
        self.assertIn('data_site_master ("siteid")', sql)


if __name__ == "__main__":
    unittest.main()
