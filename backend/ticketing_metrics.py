"""Pure metric helpers for the Ticketing dashboard."""

from __future__ import annotations

from datetime import date
import math
from typing import Literal


TrendGranularity = Literal["day", "week", "month"]

COUNT_METRIC_WEIGHTS = {
    "takeover_tickets": 0.50,
    "visitation_tickets": 0.30,
    "backup_sukses_tickets": 0.10,
}
RESPONSE_WEIGHT = 0.10


def resolve_trend_granularity(
    *,
    month_count: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> TrendGranularity:
    """Choose a stable trend bucket for a canonical month or custom date range."""
    if month_count is not None:
        if month_count <= 1:
            return "day"
        if month_count <= 3:
            return "week"
        return "month"

    if start_date is None or end_date is None:
        # An unbounded or partially legacy request can span many months/years.
        # Monthly buckets keep those supported compatibility paths bounded.
        return "month"

    inclusive_days = (end_date - start_date).days + 1
    if inclusive_days <= 31:
        return "day"
    if inclusive_days <= 93:
        return "week"
    return "month"


def _nonnegative_number(value) -> float:
    try:
        number = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    return number if math.isfinite(number) and number >= 0 else 0.0


def _normalized_count_scores(rows: list[dict], key: str) -> list[float]:
    values = [_nonnegative_number(row.get(key)) for row in rows]
    if not values:
        return []
    minimum = min(values)
    maximum = max(values)
    if maximum == minimum:
        fill = 100.0 if maximum > 0 else 0.0
        return [fill for _ in values]
    return [100.0 * (value - minimum) / (maximum - minimum) for value in values]


def _valid_response(value) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and number >= 0 else None


def _response_speed_scores(rows: list[dict]) -> list[float]:
    values = [_valid_response(row.get("average_response_minutes")) for row in rows]
    valid_values = [value for value in values if value is not None]
    if not valid_values:
        return [0.0 for _ in values]

    minimum = min(valid_values)
    maximum = max(valid_values)
    if maximum == minimum:
        return [100.0 if value is not None else 0.0 for value in values]

    return [
        0.0 if value is None else 100.0 * (maximum - value) / (maximum - minimum)
        for value in values
    ]


def rank_fop_performance(rows: list[dict]) -> list[dict]:
    """Normalize filtered FOP aggregates and rank them using confirmed weights."""
    if not rows:
        return []

    normalized_counts = {
        key: _normalized_count_scores(rows, key)
        for key in COUNT_METRIC_WEIGHTS
    }
    response_scores = _response_speed_scores(rows)

    scored_rows = []
    for index, source in enumerate(rows):
        row = dict(source)
        score = sum(
            normalized_counts[key][index] * weight
            for key, weight in COUNT_METRIC_WEIGHTS.items()
        )
        score += response_scores[index] * RESPONSE_WEIGHT
        row["performance_score"] = round(score, 2)
        scored_rows.append(row)

    def sort_key(row: dict):
        response = _valid_response(row.get("average_response_minutes"))
        return (
            -row["performance_score"],
            -_nonnegative_number(row.get("takeover_tickets")),
            -_nonnegative_number(row.get("visitation_tickets")),
            -_nonnegative_number(row.get("backup_sukses_tickets")),
            response is None,
            response if response is not None else math.inf,
            str(row.get("pic") or "").casefold(),
        )

    scored_rows.sort(key=sort_key)
    for rank, row in enumerate(scored_rows, start=1):
        row["rank"] = rank
    return scored_rows
