from pathlib import Path
import sys

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class _Rows:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows

    def one(self):
        return self.rows[0]


class _QueryResult:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return _Rows(self.rows)


class FakeOverviewSession:
    async def execute(self, query, params=None):
        sql = str(query)
        if "SELECT DISTINCT ON (metric, threshold_key, site_class)" in sql:
            return _QueryResult(
                [
                    {"metric": "availability", "threshold_key": "target", "site_class": "DIAMOND", "threshold_value": 99.87, "effective_month": "2026-01", "updated_by": "admin", "updated_at": "2026-01-01T00:00:00+00:00"},
                    {"metric": "availability", "threshold_key": "target", "site_class": "PLATINUM", "threshold_value": 99.73, "effective_month": "2026-01", "updated_by": "admin", "updated_at": "2026-01-01T00:00:00+00:00"},
                    {"metric": "availability", "threshold_key": "target", "site_class": "GOLD", "threshold_value": 99.68, "effective_month": "2026-01", "updated_by": "admin", "updated_at": "2026-01-01T00:00:00+00:00"},
                    {"metric": "availability", "threshold_key": "target", "site_class": "SILVER", "threshold_value": 99.67, "effective_month": "2026-01", "updated_by": "admin", "updated_at": "2026-01-01T00:00:00+00:00"},
                    {"metric": "availability", "threshold_key": "target", "site_class": "BRONZE", "threshold_value": 99.73, "effective_month": "2026-01", "updated_by": "admin", "updated_at": "2026-01-01T00:00:00+00:00"},
                    {"metric": "revenue", "threshold_key": "u30_upper", "site_class": "*", "threshold_value": 30_000_000, "effective_month": "2026-01", "updated_by": "admin", "updated_at": "2026-01-01T00:00:00+00:00"},
                    {"metric": "revenue", "threshold_key": "u60_upper", "site_class": "*", "threshold_value": 60_000_000, "effective_month": "2026-01", "updated_by": "admin", "updated_at": "2026-01-01T00:00:00+00:00"},
                    {"metric": "payload", "threshold_key": "target", "site_class": "*", "threshold_value": 15, "effective_month": "2026-01", "updated_by": "admin", "updated_at": "2026-01-01T00:00:00+00:00"},
                ]
            )
        if "reporting_scope_aggregates" in sql:
            return _QueryResult(
                [
                    {"scope": "regional", "total_sites": 3, "epm_sites": 1, "non_epm_sites": 2, "revenue": 400, "payload": 40, "total_time_minutes": 3000, "outage_minutes": 60},
                    {"scope": "selected", "total_sites": 2, "epm_sites": 1, "non_epm_sites": 1, "revenue": 300, "payload": 30, "total_time_minutes": 2000, "outage_minutes": 30},
                    {"scope": "previous", "total_sites": 2, "epm_sites": 1, "non_epm_sites": 1, "revenue": 250, "payload": 25, "total_time_minutes": 2000, "outage_minutes": 20},
                ]
            )
        if "reporting_ytd_aggregates" in sql:
            return _QueryResult([{"revenue_ytd": 900, "payload_ytd": 90}])
        if "reporting_site_driver_candidates" in sql:
            return _QueryResult(
                [
                    {
                        "site_id": "AAA001",
                        "site_name": "Alpha",
                        "revenue": 140,
                        "previous_revenue": 100,
                        "payload": 20,
                        "previous_payload": 10,
                        "availability": 99.8,
                        "previous_availability": 99.7,
                        "outage_minutes": 2,
                        "previous_outage_minutes": 3,
                    },
                    {
                        "site_id": "BBB001",
                        "site_name": "Beta",
                        "revenue": 160,
                        "previous_revenue": 150,
                        "payload": 10,
                        "previous_payload": 15,
                        "availability": 98.0,
                        "previous_availability": 99.0,
                        "outage_minutes": 28,
                        "previous_outage_minutes": 17,
                    },
                ]
            )
        if "reporting_trend" in sql:
            return _QueryResult(
                [
                    {
                        "trx_month": "2026-07",
                        "total_revenue": 300,
                        "total_payload": 30,
                        "total_traffic": 12,
                        "avg_availability": 98.5,
                        "u30_sites": 1,
                        "u60_sites": 1,
                        "achieved_sites": 0,
                        "unavailable_sites": 0,
                    }
                ]
            )
        if "reporting_coverage" in sql:
            return _QueryResult(
                [
                    {"source_key": "traktor_data", "latest_data_period": "2026-07", "record_count": 3, "mapped_sites": 2, "total_sites": 3, "last_refreshed_at": None},
                    {"source_key": "site_month_metrics", "latest_data_period": "2026-07", "record_count": 3, "mapped_sites": 2, "total_sites": 3, "last_refreshed_at": None},
                    {"source_key": "reporting_metric_thresholds", "latest_data_period": "2026-01", "record_count": 8, "mapped_sites": None, "total_sites": None, "available_periods": ["2026-07"], "last_refreshed_at": None},
                ]
            )
        if "reporting_revenue_targets" in sql:
            return _QueryResult(
                [{"trx_month": "2026-07", "target_revenue": 300, "updated_at": "2026-08-31T00:00:00+00:00"}]
            )
        raise AssertionError(f"Unexpected query: {sql[:120]}")


class FakeAreaSession:
    async def execute(self, query, params=None):
        assert "reporting_area_aggregates" in str(query)
        assert params["nop_key"] is None
        return _QueryResult(
            [
                {
                    "area_key": "SIDOARJO",
                    "kabupaten": "SIDOARJO",
                    "is_unmapped": False,
                    "total_sites": 2,
                    "revenue": 300,
                    "previous_revenue": 250,
                    "payload": 30,
                    "previous_payload": 25,
                    "traffic": 12,
                    "total_time_minutes": 2000,
                    "outage_minutes": 30,
                    "previous_total_time_minutes": 2000,
                    "previous_outage_minutes": 20,
                    "ticket_swfm_bps": 2,
                    "ticket_swfm_ts": 1,
                    "backup_sukses_bps": 1,
                    "proker_open": 1,
                    "proker_closed": 2,
                },
                {
                    "area_key": "__UNMAPPED__",
                    "kabupaten": "Belum Terpetakan",
                    "is_unmapped": True,
                    "total_sites": 1,
                    "revenue": 100,
                    "previous_revenue": 80,
                    "payload": 10,
                    "previous_payload": 8,
                    "traffic": 4,
                    "total_time_minutes": 1000,
                    "outage_minutes": 30,
                    "previous_total_time_minutes": 1000,
                    "previous_outage_minutes": 40,
                    "ticket_swfm_bps": 0,
                    "ticket_swfm_ts": 0,
                    "backup_sukses_bps": 0,
                    "proker_open": 0,
                    "proker_closed": 0,
                },
            ]
        )


def test_weighted_availability_uses_ratio_of_summed_minutes():
    from services.reporting_overview import weighted_availability

    assert weighted_availability(2_000, 20) == pytest.approx(99.0)
    assert weighted_availability(3_000, 60) == pytest.approx(98.0)
    assert weighted_availability(0, 20) is None


def test_reporting_queries_fall_back_to_raw_availability_for_missing_cache_rows():
    from services.reporting_availability import AVAILABILITY_FACTS_CTES
    from services.reporting_overview import AREA_AGGREGATES_QUERY, COVERAGE_QUERY, SCOPE_AGGREGATES_QUERY, TREND_QUERY

    normalized = AVAILABILITY_FACTS_CTES.lower()
    assert "availability_logs_jatim" in normalized
    assert "not exists" in normalized
    assert '"outgage (menit)"' in normalized
    for query in (SCOPE_AGGREGATES_QUERY, TREND_QUERY, AREA_AGGREGATES_QUERY, COVERAGE_QUERY):
        assert "availability_facts" in query


def test_trend_query_classifies_each_month_with_its_effective_threshold_version():
    from services.reporting_overview import TREND_QUERY

    normalized = " ".join(TREND_QUERY.lower().split())
    assert "generate_series" in normalized
    assert "threshold.effective_month <= sm.trx_month" in normalized
    assert "threshold_key = 'u30_upper'" in normalized
    assert "threshold_key = 'u60_upper'" in normalized
    assert "order by threshold.effective_month desc" in normalized
    assert "unavailable_sites" in normalized


def test_threshold_coverage_generates_scalar_month_values():
    from services.reporting_overview import COVERAGE_QUERY

    assert "AS month_series(month_value)" in COVERAGE_QUERY


def test_safe_share_returns_none_for_missing_or_zero_regional_value():
    from services.reporting_overview import safe_share

    assert safe_share(25, 100) == pytest.approx(25.0)
    assert safe_share(5, 0) is None
    assert safe_share(None, 100) is None


def test_availability_contribution_uses_outage_share_and_percentage_point_difference():
    from services.reporting_overview import build_availability_contribution

    contribution = build_availability_contribution(
        selected_availability=98.5,
        regional_availability=98.0,
        selected_outage_minutes=30,
        regional_outage_minutes=60,
    )

    assert contribution.regional_value == pytest.approx(98.0)
    assert contribution.difference_pp == pytest.approx(0.5)
    assert contribution.contribution_pct == pytest.approx(50.0)


def test_availability_insight_severity_uses_trend_not_retired_global_sla():
    from services.reporting_overview import availability_insight_severity

    assert availability_insight_severity(98.5, []) == "success"
    assert availability_insight_severity(
        99.7,
        [
            {"avg_availability": 99.9},
            {"avg_availability": 99.8},
            {"avg_availability": 99.7},
        ],
    ) == "warning"
    assert availability_insight_severity(None, []) == "unavailable"


@pytest.mark.parametrize(
    ("availability", "expected"),
    [(99.5, "met"), (99.4999, "missed"), (None, "unavailable")],
)
def test_sla_status_has_only_approved_states(availability, expected):
    from services.reporting_overview import availability_sla_status

    assert availability_sla_status(availability) == expected


def test_area_rows_reconcile_to_the_same_site_universe_as_scorecard():
    from models.reporting import ReportingAreaRow

    rows = [
        ReportingAreaRow(
            area_key="SIDOARJO",
            kabupaten="SIDOARJO",
            total_sites=2,
            revenue=300,
            payload=30,
            sla_status="met",
        ),
        ReportingAreaRow(
            area_key="__UNMAPPED__",
            kabupaten="Belum Terpetakan",
            is_unmapped=True,
            total_sites=1,
            revenue=100,
            payload=10,
            sla_status="unavailable",
        ),
    ]

    assert sum(row.total_sites for row in rows) == 3
    assert sum(row.revenue for row in rows) == 400
    assert sum(row.payload for row in rows) == 40


def test_overview_builder_uses_regional_baseline_and_complete_monthly_target():
    from periods import build_period_meta, resolve_month_period
    from queries.reporting_foundation import RevenueTargetResult
    from services.reporting_overview import build_reporting_overview

    period = resolve_month_period(period_start="2026-07", period_end="2026-07")
    overview = build_reporting_overview(
        selected={
            "total_sites": 2,
            "epm_sites": 1,
            "non_epm_sites": 1,
            "revenue": 300,
            "payload": 30,
            "total_time_minutes": 2_000,
            "outage_minutes": 30,
        },
        regional={
            "total_sites": 3,
            "revenue": 400,
            "payload": 40,
            "total_time_minutes": 3_000,
            "outage_minutes": 60,
        },
        previous={
            "total_sites": 2,
            "revenue": 250,
            "payload": 25,
            "total_time_minutes": 2_000,
            "outage_minutes": 20,
        },
        target=RevenueTargetResult(
            target_revenue=300,
            selected_months=1,
            configured_months=1,
            missing_months=[],
            version="1:2026-08-31",
        ),
        scope_label="SIDOARJO",
        period_meta=build_period_meta(period, {"performance": ["2026-07"]}),
        coverage=[],
        trend=[],
        ytd={"revenue_ytd": 900, "payload_ytd": 90},
    )

    assert overview.scorecards.total_sites == 2
    assert overview.scorecards.epm_sites == 1
    assert overview.scorecards.non_epm_sites == 1
    assert overview.scorecards.revenue_ytd == 900
    assert overview.scorecards.payload_ytd == 90
    assert overview.revenue.value == 300
    assert overview.revenue.contribution.contribution_pct == pytest.approx(75.0)
    assert overview.revenue.delta_pct == pytest.approx(20.0)
    assert overview.revenue.target.complete is True
    assert overview.revenue.target.gap == 0
    assert overview.revenue.severity == "success"
    assert overview.payload.contribution.contribution_pct == pytest.approx(75.0)
    assert overview.availability.value == pytest.approx(98.5)
    assert overview.availability.contribution.difference_pp == pytest.approx(0.5)
    assert overview.availability.contribution.contribution_pct == pytest.approx(50.0)
    assert overview.availability.severity == "success"


@pytest.mark.asyncio
async def test_overview_loader_returns_typed_numeric_contract_from_one_scope_query():
    from periods import resolve_month_period
    from services.reporting_overview import load_reporting_overview

    overview = await load_reporting_overview(
        FakeOverviewSession(),
        resolve_month_period(period_start="2026-07", period_end="2026-07"),
        "NOP SIDOARJO",
    )

    assert overview.scope_label == "SIDOARJO"
    assert overview.scorecards.total_sites == 2
    assert overview.scorecards.epm_sites == 1
    assert overview.scorecards.non_epm_sites == 1
    assert overview.scorecards.revenue_ytd == 900
    assert overview.scorecards.payload_ytd == 90
    assert overview.thresholds.complete is True
    assert overview.thresholds.availability["DIAMOND"] == pytest.approx(99.87)
    assert overview.revenue.contribution.contribution_pct == pytest.approx(75.0)
    assert overview.availability.value == pytest.approx(98.5)
    assert overview.revenue.driver.site_id == "AAA001"
    assert overview.revenue.driver.delta_value == pytest.approx(40)
    assert overview.payload.driver.site_id == "AAA001"
    assert overview.availability.driver.site_id == "BBB001"
    assert overview.revenue.recommendation
    assert overview.trend[0].u30_sites == 1
    assert overview.trend[0].u60_sites == 1
    assert overview.coverage[0].status == "complete"
    assert overview.coverage[0].latest_data_period == "2026-07"


def test_overview_queries_keep_scorecard_breakdown_and_ytd_in_the_same_scope():
    from services.reporting_overview import OVERVIEW_YTD_QUERY, SCOPE_AGGREGATES_QUERY

    assert "LIKE 'EPM%'" in SCOPE_AGGREGATES_QUERY
    assert "epm_sites" in SCOPE_AGGREGATES_QUERY
    assert "non_epm_sites" in SCOPE_AGGREGATES_QUERY
    assert "reporting_ytd_aggregates" in OVERVIEW_YTD_QUERY
    assert ":year_start" in OVERVIEW_YTD_QUERY
    assert ":period_end" in OVERVIEW_YTD_QUERY


@pytest.mark.asyncio
async def test_area_loader_keeps_unmapped_sites_and_computes_ratio_metrics():
    from periods import resolve_month_period
    from services.reporting_overview import load_reporting_areas

    rows = await load_reporting_areas(
        FakeAreaSession(),
        resolve_month_period(period_start="2026-07", period_end="2026-07"),
        None,
    )

    assert [row.kabupaten for row in rows] == ["SIDOARJO", "Belum Terpetakan"]
    assert sum(row.total_sites for row in rows) == 3
    assert sum(row.revenue for row in rows) == 400
    assert rows[0].avg_availability == pytest.approx(98.5)
    assert rows[0].previous_availability == pytest.approx(99.0)
    assert rows[0].availability_delta_pct == pytest.approx(-0.5)
    assert rows[0].backup_sukses_rate == pytest.approx(50.0)
    assert rows[0].sla_status == "missed"
    assert rows[1].is_unmapped is True
    assert rows[1].availability_delta_pct == pytest.approx(1.0)
