import unittest
from pathlib import Path
import sys
import asyncio

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class _FakeResult:
    def __init__(self, mapping=None, scalar_values=None):
        self._mapping = mapping
        self._scalar_values = scalar_values or []

    def mappings(self):
        return self

    def first(self):
        return self._mapping

    def scalars(self):
        return self

    def all(self):
        return self._scalar_values


class _FakeMetricsSession:
    def __init__(self, raw_sites, cached_sites, refreshed_sites=()):
        self.raw_sites = raw_sites
        self.cached_sites = cached_sites
        self.refreshed_sites = list(refreshed_sites)
        self.statements = []
        self.commits = 0
        self.rollbacks = 0

    async def execute(self, statement, params=None):
        sql = " ".join(str(statement).split()).lower()
        self.statements.append(sql)

        if "pg_advisory_xact_lock" in sql:
            return _FakeResult()
        if "raw_sites" in sql and "cached_sites" in sql:
            return _FakeResult({
                "raw_sites": self.raw_sites,
                "cached_sites": self.cached_sites,
            })
        if "insert into site_month_metrics" in sql:
            return _FakeResult(scalar_values=self.refreshed_sites)
        return _FakeResult()

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1


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

    def test_ensure_site_month_metrics_refreshes_missing_or_incomplete_cache(self):
        from queries.metrics_cache import ensure_site_month_metrics

        session = _FakeMetricsSession(
            raw_sites=6746,
            cached_sites=0,
            refreshed_sites=["BGL001", "BGL002"],
        )

        refreshed = asyncio.run(ensure_site_month_metrics(session, bulan=2, tahun=2026))

        self.assertEqual(refreshed, 2)
        joined = "\n".join(session.statements)
        self.assertIn("pg_advisory_xact_lock", joined)
        self.assertIn("delete from site_month_metrics", joined)
        self.assertIn("insert into site_month_metrics", joined)
        self.assertEqual(session.commits, 1)
        self.assertEqual(session.rollbacks, 0)

    def test_ensure_site_month_metrics_skips_complete_cache(self):
        from queries.metrics_cache import ensure_site_month_metrics

        session = _FakeMetricsSession(raw_sites=6746, cached_sites=6746)

        refreshed = asyncio.run(ensure_site_month_metrics(session, bulan=4, tahun=2026))

        self.assertEqual(refreshed, 0)
        joined = "\n".join(session.statements)
        self.assertIn("pg_advisory_xact_lock", joined)
        self.assertNotIn("delete from site_month_metrics", joined)
        self.assertNotIn("insert into site_month_metrics", joined)
        self.assertEqual(session.commits, 1)
        self.assertEqual(session.rollbacks, 0)

    def test_cache_backed_dashboard_routes_ensure_requested_period_cache(self):
        route_expectations = {
            "map.py": ["get_map_sites"],
            "sites.py": ["list_sites"],
            "availability.py": ["get_summary", "get_worst_sites"],
        }

        router_dir = Path(__file__).resolve().parents[1] / "routers"
        for filename, functions in route_expectations.items():
            source = (router_dir / filename).read_text(encoding="utf-8")
            self.assertIn("ensure_site_month_metrics", source)
            for function_name in functions:
                self.assertRegex(
                    source,
                    rf"async def {function_name}\([\s\S]*?await ensure_site_month_metrics\(session, bulan, tahun\)",
                    f"{filename}.{function_name} must refresh/validate the requested cache period before reading it",
                )


if __name__ == "__main__":
    unittest.main()
