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
