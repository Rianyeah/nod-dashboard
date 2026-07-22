from datetime import date
from pathlib import Path
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from periods import build_period_meta, resolve_month_period


def test_resolves_single_month_and_previous_month():
    period = resolve_month_period(period_start="2026-06", period_end="2026-06")

    assert period.active_months == ("2026-06",)
    assert period.start_date == date(2026, 6, 1)
    assert period.end_date_exclusive == date(2026, 7, 1)
    assert period.comparison_start == "2026-05"
    assert period.comparison_end == "2026-05"


def test_resolves_cross_year_range_and_equal_previous_period():
    period = resolve_month_period(period_start="2025-11", period_end="2026-02")

    assert period.active_months == ("2025-11", "2025-12", "2026-01", "2026-02")
    assert period.comparison_start == "2025-07"
    assert period.comparison_end == "2025-10"
    assert period.context_start == "2025-05"


def test_accepts_exactly_twelve_months():
    period = resolve_month_period(period_start="2025-07", period_end="2026-06")
    assert len(period.active_months) == 12


@pytest.mark.parametrize(
    ("period_start", "period_end"),
    [
        ("2025-06", "2026-06"),
        ("2026-07", "2026-06"),
        ("2026-13", "2026-13"),
        ("2026/01", "2026-02"),
        ("2026-01", None),
    ],
)
def test_rejects_invalid_or_incomplete_ranges(period_start, period_end):
    with pytest.raises(HTTPException) as exc_info:
        resolve_month_period(period_start=period_start, period_end=period_end)

    assert exc_info.value.status_code == 422


def test_rejects_mixed_legacy_and_canonical_periods():
    with pytest.raises(HTTPException) as exc_info:
        resolve_month_period(
            period_start="2026-01",
            period_end="2026-06",
            legacy_month="2026-06",
        )

    assert exc_info.value.status_code == 422


def test_resolves_legacy_month_for_backwards_compatibility():
    period = resolve_month_period(legacy_month="2026-06")
    assert period.period_start == "2026-06"
    assert period.period_end == "2026-06"


def test_builds_source_specific_missing_month_metadata():
    period = resolve_month_period(period_start="2026-01", period_end="2026-03")
    meta = build_period_meta(
        period,
        {
            "reporting": ["2026-01", "2026-03"],
            "ticketing": ["2026-01", "2026-02", "2026-03"],
        },
    )

    assert meta.active_months == ["2026-01", "2026-02", "2026-03"]
    assert meta.missing_months_by_source == {"reporting": ["2026-02"]}
