from importlib.util import find_spec
from datetime import date, datetime

import pytest
from fastapi import HTTPException

from models.ticket_toti import (
    TicketTotiDashboard,
    TicketTotiDistributionItem,
    TicketTotiSummary,
    TicketTotiTicketResponse,
    TicketTotiTopItem,
)
from routers import ticket_toti
from routers.ticket_toti import (
    build_filter_clause,
    normalize_category_label,
    normalized_nop_sql,
    previous_period_bounds,
    safe_timestamp_sql,
    shared_query_params,
)


def test_ticket_toti_backend_modules_exist():
    assert find_spec("models.ticket_toti") is not None
    assert find_spec("routers.ticket_toti") is not None


def test_normalize_category_label_translates_vandalism_and_blanks():
    assert normalize_category_label(" VANDALISM ") == "Vandalisme"
    assert normalize_category_label(" POWER ") == "POWER"
    assert normalize_category_label("  ") == "Unknown"
    assert normalize_category_label(None) == "Unknown"


def test_nop_sql_canonicalizes_nsa_and_blank_values():
    expression = normalized_nop_sql("t.nop")

    assert "regexp_replace" in expression
    assert "^NSA" in expression
    assert "NOP " in expression
    assert "Unknown" in expression


def test_safe_timestamp_sql_checks_format_and_postgres_validity_before_cast():
    expression = safe_timestamp_sql("t.tgl_request")

    assert "pg_input_is_valid" in expression
    assert "YYYY-MM-DD HH24:MI:SS" not in expression
    assert "::timestamp" in expression
    assert "ELSE NULL" in expression


def test_previous_custom_period_has_equal_day_count():
    assert previous_period_bounds(date(2026, 7, 10), date(2026, 7, 19)) == (
        date(2026, 6, 30),
        date(2026, 7, 9),
    )


def test_month_period_becomes_inclusive_request_date_filter():
    params = shared_query_params(period_start="2026-05", period_end="2026-07")

    assert params["start_date"] == date(2026, 5, 1)
    assert params["end_date"] == date(2026, 7, 31)
    assert params["_period"].active_months == ("2026-05", "2026-06", "2026-07")


@pytest.mark.parametrize(
    "overrides",
    [
        {
            "period_start": "2026-07",
            "period_end": "2026-07",
            "start_date": date(2026, 7, 1),
            "end_date": date(2026, 7, 31),
        },
        {
            "period_start": "2026-07",
            "period_end": "2026-07",
            "cluster": "MALANG",
            "mitra": "MITRATEL",
        },
    ],
)
def test_period_modes_reject_only_mixed_period_inputs(overrides):
    if "start_date" in overrides:
        with pytest.raises(HTTPException) as exc_info:
            shared_query_params(**overrides)
        assert exc_info.value.status_code == 422
    else:
        params = shared_query_params(**overrides)
        assert params["cluster"] == "MALANG"
        assert params["mitra"] == "MITRATEL"


def test_filter_clause_uses_parsed_request_time_and_normalized_values():
    params = shared_query_params(
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 31),
        nop="NOP MALANG",
        cluster="MALANG",
        mitra="MITRATEL",
        kategori="Vandalisme",
        status="OPEN",
    )

    clause = build_filter_clause(params)

    assert "t.requested_at >= CAST(:start_date AS date)" in clause
    assert "t.requested_at < (CAST(:end_date AS date) + interval '1 day')" in clause
    assert "UPPER(t.normalized_nop) = UPPER(:nop)" in clause
    assert "UPPER(TRIM(t.cluster)) = UPPER(TRIM(:cluster))" in clause
    assert "UPPER(TRIM(t.mitra)) = UPPER(TRIM(:mitra))" in clause
    assert "UPPER(TRIM(t.kategori)) = 'VANDALISM'" in clause
    assert "UPPER(TRIM(t.status)) = UPPER(TRIM(:status))" in clause


def test_dashboard_and_ticket_models_expose_the_approved_contract():
    summary = TicketTotiSummary(
        total_tickets=173,
        total_tickets_period_delta=21,
        total_tickets_period_rate=13.82,
        top_mitra=TicketTotiTopItem(label="MITRATEL", tickets=92, share=53.18),
        top_category=TicketTotiTopItem(label="CME", tickets=50, share=28.9),
        vandalism_tickets=14,
        vandalism_rate=8.09,
        last_updated_at=datetime(2026, 8, 12, 8, 30),
    )
    dashboard = TicketTotiDashboard(
        summary=summary,
        trend_granularity="day",
        trend=[],
        cluster_distribution=[
            TicketTotiDistributionItem(label="MALANG", tickets=40, share=23.12)
        ],
        mitra_distribution=[],
    )
    tickets = TicketTotiTicketResponse(items=[], total=0, page=1, limit=15, total_pages=0)

    assert dashboard.summary.top_mitra.label == "MITRATEL"
    assert dashboard.model_dump()["cluster_distribution"][0] == {
        "label": "MALANG",
        "tickets": 40,
        "share": 23.12,
    }
    assert tickets.model_dump() == {
        "items": [],
        "total": 0,
        "page": 1,
        "limit": 15,
        "total_pages": 0,
        "period_meta": None,
    }


class FakeResult:
    def __init__(self, *, rows=None, mapping=None, scalar_value=None):
        self.rows = rows or []
        self.mapping = mapping
        self.scalar_value = scalar_value

    def mappings(self):
        return self

    def first(self):
        if self.mapping is not None:
            return self.mapping
        return self.rows[0] if self.rows else None

    def all(self):
        return self.rows

    def fetchall(self):
        return self.rows

    def scalar(self):
        return self.scalar_value


class FakeTotiSession:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    async def execute(self, statement, params=None):
        sql = str(statement)
        marker = next((name for name in self.responses if f"ticket_toti:{name}" in sql), None)
        if marker is None:
            raise AssertionError(f"Unexpected Ticket TOTI query: {sql[:180]}")
        self.calls.append((marker, sql, dict(params or {})))
        return self.responses[marker]


def test_compact_distribution_keeps_top_ten_and_sums_the_remainder():
    rows = [{"label": f"Cluster {index:02d}", "tickets": 20 - index} for index in range(12)]

    result = ticket_toti.compact_distribution(rows, total_tickets=174)

    assert len(result) == 11
    assert result[0] == {"label": "Cluster 00", "tickets": 20, "share": 11.49}
    assert result[9]["label"] == "Cluster 09"
    assert result[10] == {"label": "Lainnya", "tickets": 19, "share": 10.92}


@pytest.mark.asyncio
async def test_filters_return_canonical_sorted_options_and_latest_month():
    session = FakeTotiSession(
        {
            "filters": FakeResult(
                mapping={
                    "min_date": date(2025, 1, 1),
                    "max_date": date(2026, 7, 30),
                    "default_start_date": date(2026, 7, 1),
                    "default_end_date": date(2026, 7, 31),
                    "available_months": ["2026-07", "2026-06"],
                    "nops": ["NOP MALANG", "NOP SIDOARJO"],
                    "clusters": ["MALANG", "SIDOARJO"],
                    "mitras": ["MITRATEL", "PROTELINDO"],
                    "categories": ["CME", "Vandalisme"],
                    "statuses": ["CLOSE", "OPEN"],
                }
            )
        }
    )

    payload = await ticket_toti.get_ticket_toti_filters(session=session, response=None)

    assert payload.default_start_date == date(2026, 7, 1)
    assert payload.nops == ["NOP MALANG", "NOP SIDOARJO"]
    assert payload.categories == ["CME", "Vandalisme"]
    assert "^NSA" in session.calls[0][1]


@pytest.mark.asyncio
async def test_dashboard_maps_aggregates_trend_distributions_and_equal_previous_period():
    cluster_rows = [
        {"label": f"Cluster {index:02d}", "tickets": 20 - index}
        for index in range(12)
    ]
    session = FakeTotiSession(
        {
            "summary": FakeResult(
                mapping={
                    "total_tickets": 173,
                    "last_updated_at": datetime(2026, 8, 12, 8, 30),
                }
            ),
            "previous_total": FakeResult(scalar_value=152),
            "top_mitra": FakeResult(mapping={"label": "MITRATEL", "tickets": 92}),
            "top_category": FakeResult(mapping={"label": "VANDALISM", "tickets": 50}),
            "vandalism": FakeResult(scalar_value=14),
            "trend": FakeResult(
                rows=[
                    {
                        "period": date(2026, 7, 1),
                        "label": "01 Jul",
                        "total": 7,
                        "vandalism": 2,
                    }
                ]
            ),
            "cluster_distribution": FakeResult(rows=cluster_rows),
            "mitra_distribution": FakeResult(rows=[{"label": "MITRATEL", "tickets": 92}]),
            "available_months": FakeResult(rows=[("2026-07",)]),
        }
    )
    params = shared_query_params(
        period_start="2026-07",
        period_end="2026-07",
        nop="NOP MALANG",
    )

    payload = await ticket_toti.get_ticket_toti_dashboard(params=params, session=session)

    assert payload.summary.total_tickets == 173
    assert payload.summary.total_tickets_period_delta == 21
    assert payload.summary.total_tickets_period_rate == 13.82
    assert payload.summary.top_mitra.model_dump() == {
        "label": "MITRATEL",
        "tickets": 92,
        "share": 53.18,
    }
    assert payload.summary.top_category.label == "Vandalisme"
    assert payload.summary.vandalism_rate == 8.09
    assert payload.trend_granularity == "day"
    assert payload.trend[0].vandalism == 2
    assert payload.cluster_distribution[-1].label == "Lainnya"
    assert payload.period_meta.active_months == ["2026-07"]
    assert [call[0] for call in session.calls] == [
        "summary",
        "previous_total",
        "top_mitra",
        "top_category",
        "vandalism",
        "trend",
        "cluster_distribution",
        "mitra_distribution",
        "available_months",
    ]
    for marker, _sql, sql_params in session.calls[:-1]:
        assert sql_params.get("nop") == "NOP MALANG", marker


@pytest.mark.asyncio
async def test_ticket_list_searches_four_fields_orders_and_paginates_with_duration():
    session = FakeTotiSession(
        {
            "tickets_count": FakeResult(scalar_value=16),
            "tickets_list": FakeResult(
                rows=[
                    {
                        "siteid": "MLG001",
                        "sitename": "SITE MALANG",
                        "id": "TOTI-002",
                        "kategori": "Vandalisme",
                        "sub_kategori": "Pagar",
                        "permasalahan": "Pagar rusak",
                        "kondisi_site": "Aman",
                        "requested_at": datetime(2026, 7, 2, 8),
                        "closed_at": datetime(2026, 7, 2, 9),
                        "duration_seconds": 3600,
                    },
                    {
                        "siteid": "MLG002",
                        "sitename": "SITE OPEN",
                        "id": "TOTI-001",
                        "kategori": "POWER",
                        "sub_kategori": None,
                        "permasalahan": "Rectifier",
                        "kondisi_site": None,
                        "requested_at": datetime(2026, 7, 1, 8),
                        "closed_at": None,
                        "duration_seconds": None,
                    },
                ]
            ),
        }
    )
    params = shared_query_params(start_date=date(2026, 7, 1), end_date=date(2026, 7, 31))

    payload = await ticket_toti.list_ticket_toti_tickets(
        params=params,
        q="MLG",
        page=2,
        limit=15,
        session=session,
    )

    assert payload.total == 16
    assert payload.total_pages == 2
    assert payload.items[0].duration_seconds == 3600
    assert payload.items[1].closed_at is None
    count_call, list_call = session.calls
    assert count_call[2]["search"] == "%MLG%"
    assert list_call[2]["limit"] == 15
    assert list_call[2]["offset"] == 15
    assert "t.id ILIKE :search" in list_call[1]
    assert "t.siteid ILIKE :search" in list_call[1]
    assert "t.sitename ILIKE :search" in list_call[1]
    assert "t.permasalahan ILIKE :search" in list_call[1]
    assert "ORDER BY t.requested_at DESC, t.id DESC" in list_call[1]
    assert "EXTRACT(EPOCH FROM" in list_call[1]
