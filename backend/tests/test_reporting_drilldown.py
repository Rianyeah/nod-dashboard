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


def test_site_order_is_allowlisted_and_uses_site_id_as_tie_breaker():
    from models.reporting import ReportingSiteQuery
    from services.reporting_drilldown import build_site_order

    query = ReportingSiteQuery(sort_by="availability", sort_dir="desc")

    assert build_site_order(query) == "avg_availability DESC NULLS LAST, site_key ASC"


def test_unmapped_area_is_based_on_missing_master_row_not_blank_nop():
    from services.reporting_drilldown import SITE_FACTS_CTE

    normalized = " ".join(SITE_FACTS_CTE.lower().split())
    assert "m.site_key is not null as is_mapped" in normalized
    assert ":area_key = :unmapped_key and not is_mapped" in normalized


@pytest.mark.parametrize(
    ("availability", "expected"),
    [(99.5, True), (99.49, False), (None, False)],
)
def test_sla_filter_uses_exact_approved_threshold(availability, expected):
    from services.reporting_drilldown import matches_sla

    assert matches_sla(availability, "met") is expected


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
                        "total_count": 1,
                    }
                ]
            )
        if "reporting_site_facets" in sql:
            return _Result([{"site_classes": [], "total_sites": 1}])
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
    assert result.items[0].sla_status == "missed"
