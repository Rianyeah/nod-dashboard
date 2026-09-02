from pathlib import Path
import sys

import pytest
from pydantic import ValidationError


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_site_query_rejects_unknown_sort_and_oversized_page():
    from models.reporting import ReportingSiteQuery

    with pytest.raises(ValidationError):
        ReportingSiteQuery(sort_by="drop table reporting", page_size=20)
    with pytest.raises(ValidationError):
        ReportingSiteQuery(sort_by="revenue", page_size=101)


def test_site_query_validates_revenue_band_filter():
    from models.reporting import ReportingSiteQuery

    assert ReportingSiteQuery(revenue_band="u30").revenue_band == "u30"
    assert ReportingSiteQuery(revenue_band="achieved").revenue_band == "achieved"
    with pytest.raises(ValidationError):
        ReportingSiteQuery(revenue_band="active")


def test_site_order_is_allowlisted_and_uses_site_id_as_tie_breaker():
    from models.reporting import ReportingSiteQuery
    from services.reporting_drilldown import build_site_order

    query = ReportingSiteQuery(sort_by="availability", sort_dir="desc")

    assert build_site_order(query) == "avg_availability DESC NULLS LAST, site_key ASC"


@pytest.mark.parametrize(
    ("sort_by", "expression"),
    [
        ("site_id", "site_key"),
        ("site_class", "site_class"),
        ("status_site", "status_site"),
        (
            "revenue_band",
            "CASE revenue_band WHEN 'u30' THEN 1 WHEN 'u60' THEN 2 WHEN 'achieved' THEN 3 ELSE 4 END",
        ),
        ("transport_type", "transport_type"),
        ("revenue", "revenue"),
        ("revenue_mom", "revenue_mom_pct"),
        ("payload", "payload"),
        ("payload_mom", "payload_mom_pct"),
        ("availability", "avg_availability"),
    ],
)
def test_every_visible_site_header_has_an_allowlisted_server_sort(sort_by, expression):
    from models.reporting import ReportingSiteQuery
    from services.reporting_drilldown import build_site_order

    query = ReportingSiteQuery(sort_by=sort_by, sort_dir="asc")

    assert build_site_order(query) == f"{expression} ASC NULLS LAST, site_key ASC"


def test_unmapped_area_is_based_on_missing_master_row_not_blank_nop():
    from services.reporting_drilldown import SITE_FACTS_CTE

    normalized = " ".join(SITE_FACTS_CTE.lower().split())
    assert "m.site_key is not null as is_mapped" in normalized
    assert ":area_key = :unmapped_key and not is_mapped" in normalized


def test_target_filter_is_evaluated_inside_filtered_cte_before_pagination():
    from services.reporting_drilldown import SITE_FACTS_CTE, _target_sql_filter

    normalized = " ".join(SITE_FACTS_CTE.lower().split())
    assert "monthly_facts" in normalized
    assert "overall_target_status" in normalized
    assert "{target_status_filter}" in SITE_FACTS_CTE
    assert _target_sql_filter("achieved") == "AND overall_target_status = 'achieved'"
    assert _target_sql_filter("not_achieved") == "AND overall_target_status = 'not_achieved'"
    assert _target_sql_filter("unavailable") == "AND overall_target_status = 'unavailable'"


def test_revenue_band_filter_is_independent_and_applied_before_pagination():
    from services.reporting_drilldown import SITE_FACTS_CTE, _revenue_band_sql_filter

    assert "{revenue_band_filter}" in SITE_FACTS_CTE
    assert _revenue_band_sql_filter("all") == ""
    assert _revenue_band_sql_filter("u30") == "AND revenue_band = 'u30'"
    assert _revenue_band_sql_filter("u60") == "AND revenue_band = 'u60'"
    assert _revenue_band_sql_filter("achieved") == "AND revenue_band = 'achieved'"
    assert _revenue_band_sql_filter("unavailable") == "AND revenue_band = 'unavailable'"


def test_period_row_displays_latest_effective_target_but_keeps_monthly_statuses():
    from services.reporting_drilldown import SITE_FACTS_CTE

    normalized = " ".join(SITE_FACTS_CTE.lower().split())
    assert "array_agg(availability_target order by trx_month desc)" in normalized
    assert "array_agg(payload_target_tb order by trx_month desc)" in normalized
    assert "bool_and(overall_target_status = 'achieved')" in normalized


def test_every_selected_month_is_evaluated_and_missing_performance_is_unavailable():
    from services.reporting_drilldown import SITE_FACTS_CTE

    normalized = " ".join(SITE_FACTS_CTE.lower().split())
    assert "generate_series(" in normalized
    assert "from active_sites s cross join active_months m" in normalized
    assert "when revenue is null" in normalized
    assert "when payload is null" in normalized


class _Rows:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return _Rows(self.rows)


class FakeSiteSession:
    async def execute(self, query, params):
        sql = str(query)
        if "reporting_site_rows" in sql:
            assert params["area_key"] == "__UNMAPPED__"
            return _Result(
                [
                    {
                        "site_key": "ZZZ001",
                        "site_id": "ZZZ001",
                        "site_name": None,
                        "nop": None,
                        "kabupaten": None,
                        "status_site": None,
                        "site_class": None,
                        "transport_type": None,
                        "revenue": 100,
                        "previous_revenue": 80,
                        "payload": 10,
                        "previous_payload": 8,
                        "total_time_minutes": 1000,
                        "outage_minutes": 30,
                        "previous_total_time_minutes": 1000,
                        "previous_outage_minutes": 20,
                        "availability_target": None,
                        "availability_target_status": "unavailable",
                        "revenue_band": "u30",
                        "revenue_target_status": "not_achieved",
                        "payload_target_tb": 15,
                        "payload_target_status": "not_achieved",
                        "overall_target_status": "unavailable",
                        "total_count": 1,
                    }
                ]
            )
        if "reporting_site_facets" in sql:
            return _Result(
                [
                    {
                        "site_classes": [],
                        "total_sites": 1,
                        "revenue": 100,
                        "previous_revenue": 80,
                        "payload": 10,
                        "previous_payload": 8,
                        "total_time_minutes": 1000,
                        "outage_minutes": 30,
                        "previous_total_time_minutes": 1000,
                        "previous_outage_minutes": 20,
                    }
                ]
            )
        raise AssertionError(f"Unexpected query: {sql[:100]}")


@pytest.mark.asyncio
async def test_unmapped_drilldown_returns_performance_site_without_master_fields():
    from models.reporting import ReportingSiteQuery
    from periods import resolve_month_period
    from services.reporting_drilldown import load_reporting_sites

    result = await load_reporting_sites(
        FakeSiteSession(),
        period=resolve_month_period(period_start="2026-07", period_end="2026-07"),
        nop=None,
        area_key="unmapped",
        query=ReportingSiteQuery(),
    )

    assert result.total == 1
    assert result.area_key == "__UNMAPPED__"
    assert result.kabupaten == "Belum Terpetakan"
    assert result.items[0].site_id == "ZZZ001"
    assert result.items[0].site_class is None
    assert result.items[0].avg_availability == pytest.approx(97.0)
    assert result.items[0].previous_availability == pytest.approx(98.0)
    assert result.items[0].availability_delta_pct == pytest.approx(-1.0)
    assert result.items[0].availability_target_status == "unavailable"
    assert result.items[0].revenue_band == "u30"
    assert result.items[0].payload_target_status == "not_achieved"
    assert result.items[0].overall_target_status == "unavailable"
    assert result.grand_total.total_sites == 1
    assert result.grand_total.revenue == 100
    assert result.grand_total.revenue_mom_pct == pytest.approx(25.0)
    assert result.grand_total.avg_availability == pytest.approx(97.0)
    assert result.grand_total.previous_avg_availability == pytest.approx(98.0)
    assert result.grand_total.availability_delta_pct == pytest.approx(-1.0)


def test_site_facet_query_aggregates_the_full_filtered_universe_without_page_controls():
    from services.reporting_drilldown import SITE_FACETS_QUERY_SUFFIX

    normalized = " ".join(SITE_FACETS_QUERY_SUFFIX.lower().split())
    assert "reporting_site_facets" in normalized
    assert "sum(previous_total_time_minutes)" in normalized
    assert "from filtered" in normalized
    after_filtered = normalized.split("from filtered", 1)[1]
    assert " limit " not in f" {after_filtered} "
    assert " offset " not in f" {after_filtered} "
    assert " order by " not in f" {after_filtered} "
