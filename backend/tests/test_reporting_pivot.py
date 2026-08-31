from pathlib import Path
import json
import sys

import pytest
from fastapi import HTTPException
from pydantic import ValidationError


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_pivot_rejects_dimension_from_another_dataset():
    from models.reporting import ReportingPivotRequest

    with pytest.raises(ValidationError):
        ReportingPivotRequest(
            dataset="performance",
            period_start="2026-07",
            period_end="2026-07",
            rows=["ticket_category"],
            columns=[],
            values=[{"field": "revenue", "aggregation": "sum"}],
        )


def test_pivot_limits_rows_columns_values_and_period_range():
    from models.reporting import ReportingPivotRequest

    with pytest.raises(ValidationError):
        ReportingPivotRequest(
            dataset="performance",
            period_start="2025-01",
            period_end="2026-07",
            rows=["nop", "kabupaten", "site_id"],
            columns=["period", "site_class"],
            values=[{"field": "revenue", "aggregation": "sum"}],
        )


def test_ratio_of_sums_handles_zero_denominator():
    from services.reporting_pivot import ratio_of_sums

    assert ratio_of_sums(3, 6) == pytest.approx(50.0)
    assert ratio_of_sums(0, 0) is None


def test_cardinality_guard_rejects_more_than_one_thousand_cells():
    from services.reporting_pivot import enforce_cell_limit

    with pytest.raises(HTTPException) as error:
        enforce_cell_limit(row_count=101, column_count=10, value_count=1)

    assert error.value.status_code == 422
    assert error.value.detail == {
        "code": "pivot_too_large",
        "estimated_cells": 1010,
        "limit": 1000,
    }


def test_normalized_spec_is_stable_for_filter_and_value_order():
    from models.reporting import ReportingPivotRequest
    from services.reporting_pivot import normalize_pivot_spec

    first = ReportingPivotRequest(
        dataset="performance",
        period_start="2026-07",
        period_end="2026-07",
        rows=["kabupaten"],
        columns=["period"],
        values=[
            {"field": "payload", "aggregation": "sum"},
            {"field": "revenue", "aggregation": "sum"},
        ],
        filters=[
            {"field": "site_class", "values": ["Gold", "Diamond"]},
            {"field": "mapping_status", "values": ["Mapped"]},
        ],
    )
    second = ReportingPivotRequest(
        dataset="performance",
        period_start="2026-07",
        period_end="2026-07",
        rows=["kabupaten"],
        columns=["period"],
        values=[
            {"field": "revenue", "aggregation": "sum"},
            {"field": "payload", "aggregation": "sum"},
        ],
        filters=list(reversed(first.model_dump()["filters"])),
    )

    assert json.loads(normalize_pivot_spec(first)) == json.loads(normalize_pivot_spec(second))


class _Rows:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows

    def one(self):
        return self.rows[0]


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return _Rows(self.rows)


class FakePivotSession:
    async def execute(self, query, params):
        sql = str(query)
        if "reporting_pivot_cardinality" in sql:
            return _Result([{"row_count": 2, "column_count": 1}])
        if "reporting_pivot_values" in sql:
            return _Result(
                [
                    {"d_0": "SIDOARJO", "d_1": "2026-07", "v_0": 300, "v_1": 98.5},
                    {"d_0": "Belum Terpetakan", "d_1": "2026-07", "v_0": 100, "v_1": 97.0},
                ]
            )
        raise AssertionError(f"Unexpected query: {sql[:100]}")


@pytest.mark.asyncio
async def test_execute_pivot_returns_only_compact_aggregated_rows():
    from models.reporting import ReportingPivotRequest
    from services.reporting_pivot import execute_reporting_pivot

    request = ReportingPivotRequest(
        dataset="performance",
        period_start="2026-07",
        period_end="2026-07",
        rows=["kabupaten"],
        columns=["period"],
        values=[
            {"field": "revenue", "aggregation": "sum"},
            {"field": "availability", "aggregation": "weighted_avg"},
        ],
    )

    response = await execute_reporting_pivot(FakePivotSession(), request)

    assert response.estimated_cells == 4
    assert response.rows[0].dimensions == {"kabupaten": "SIDOARJO", "period": "2026-07"}
    assert response.rows[0].values == {"revenue": 300, "availability": 98.5}
