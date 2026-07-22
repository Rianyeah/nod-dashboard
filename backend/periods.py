"""Canonical month-range parsing shared by dashboard routers."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import re

from fastapi import HTTPException

from models.period import MonthPeriodMeta


MONTH_PATTERN = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")
MAX_PERIOD_MONTHS = 12
CONTEXT_MONTHS = 6


def _parse_month(value: str) -> date:
    match = MONTH_PATTERN.fullmatch(value or "")
    if not match:
        raise HTTPException(status_code=422, detail="Periode harus berformat YYYY-MM.")
    return date(int(match.group(1)), int(match.group(2)), 1)


def _month_index(value: date) -> int:
    return value.year * 12 + value.month - 1


def _month_from_index(value: int) -> date:
    year, zero_based_month = divmod(value, 12)
    return date(year, zero_based_month + 1, 1)


def _format_month(value: date) -> str:
    return value.strftime("%Y-%m")


@dataclass(frozen=True)
class MonthPeriod:
    period_start: str
    period_end: str
    start_date: date
    end_date_exclusive: date
    active_months: tuple[str, ...]
    comparison_start: str
    comparison_end: str
    context_start: str

    @property
    def month_count(self) -> int:
        return len(self.active_months)


def resolve_month_period(
    *,
    period_start: str | None = None,
    period_end: str | None = None,
    legacy_month: str | None = None,
) -> MonthPeriod:
    """Resolve a canonical contiguous month range and its comparison window."""
    has_canonical = period_start is not None or period_end is not None
    if has_canonical and legacy_month is not None:
        raise HTTPException(
            status_code=422,
            detail="Gunakan period_start/period_end atau parameter bulan lama, bukan keduanya.",
        )
    if (period_start is None) != (period_end is None):
        raise HTTPException(status_code=422, detail="period_start dan period_end wajib diisi bersama.")

    if legacy_month is not None:
        period_start = legacy_month
        period_end = legacy_month
    if period_start is None or period_end is None:
        raise HTTPException(status_code=422, detail="Periode belum dipilih.")

    start = _parse_month(period_start)
    end = _parse_month(period_end)
    start_index = _month_index(start)
    end_index = _month_index(end)
    month_count = end_index - start_index + 1
    if month_count <= 0:
        raise HTTPException(status_code=422, detail="Rentang bulan harus berurutan.")
    if month_count > MAX_PERIOD_MONTHS:
        raise HTTPException(status_code=422, detail="Rentang maksimal 12 bulan.")

    active_months = tuple(
        _format_month(_month_from_index(month_index))
        for month_index in range(start_index, end_index + 1)
    )
    comparison_start_index = start_index - month_count
    comparison_end_index = start_index - 1
    context_start_index = start_index - CONTEXT_MONTHS

    return MonthPeriod(
        period_start=active_months[0],
        period_end=active_months[-1],
        start_date=start,
        end_date_exclusive=_month_from_index(end_index + 1),
        active_months=active_months,
        comparison_start=_format_month(_month_from_index(comparison_start_index)),
        comparison_end=_format_month(_month_from_index(comparison_end_index)),
        context_start=_format_month(_month_from_index(context_start_index)),
    )


def build_period_meta(
    period: MonthPeriod,
    available_months_by_source: dict[str, list[str] | tuple[str, ...]],
) -> MonthPeriodMeta:
    active = list(period.active_months)
    missing: dict[str, list[str]] = {}
    for source, available_months in available_months_by_source.items():
        available = set(available_months)
        source_missing = [month for month in active if month not in available]
        if source_missing:
            missing[source] = source_missing
    return MonthPeriodMeta(
        period_start=period.period_start,
        period_end=period.period_end,
        comparison_start=period.comparison_start,
        comparison_end=period.comparison_end,
        active_months=active,
        missing_months_by_source=missing,
    )
