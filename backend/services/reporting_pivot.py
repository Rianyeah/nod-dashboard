"""Allowlisted, server-aggregated dynamic Pivot support."""

from __future__ import annotations

import json
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import text

from models.reporting import (
    ReportingPivotRequest,
    ReportingPivotResponse,
    ReportingPivotRow,
)
from periods import resolve_month_period
from queries.reporting_foundation import canonical_nop
from services.reporting_availability import AVAILABILITY_FACTS_CTES


PIVOT_CELL_LIMIT = 1_000


@dataclass(frozen=True)
class PivotDataset:
    cte: str
    dimensions: dict[str, str]
    measures: dict[str, str]


PERFORMANCE_CTE = """
WITH master AS (
    SELECT DISTINCT ON (UPPER(TRIM(d."Siteid")))
        UPPER(TRIM(d."Siteid")) AS site_key,
        REGEXP_REPLACE(UPPER(TRIM(d."NOP")), '^NOP[[:space:]]+', '') AS nop,
        NULLIF(TRIM(d."Kabupaten/KOTA"), '') AS kabupaten,
        NULLIF(TRIM(d."Site Class"), '') AS site_class,
        NULLIF(TRIM(d."Transport Type"), '') AS transport_type
    FROM public.data_site_master d
    WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
    ORDER BY UPPER(TRIM(d."Siteid")), d.row_number DESC NULLS LAST
),
performance AS (
    SELECT
        t.trx_month AS period,
        UPPER(TRIM(t.site_id)) AS site_key,
        SUM(COALESCE(t.rev, 0))::bigint AS revenue,
        SUM(COALESCE(t.payload, 0))::bigint AS payload,
        SUM(COALESCE(t.traffic, 0))::bigint AS traffic
    FROM public.traktor_data t
    WHERE t.trx_month BETWEEN :period_start AND :period_end
      AND NULLIF(TRIM(t.site_id), '') IS NOT NULL
    GROUP BY 1, 2
),
{availability_facts_ctes},
availability AS (
    SELECT
        s.period,
        s.site_key,
        SUM(COALESCE(s.total_time_minutes, 0))::double precision AS total_time_minutes,
        SUM(COALESCE(s.outage_minutes, 0))::double precision AS outage_minutes
    FROM availability_facts s
    WHERE s.period BETWEEN :period_start AND :period_end
    GROUP BY 1, 2
),
facts AS (
    SELECT
        p.period,
        p.site_key,
        m.nop,
        COALESCE(m.kabupaten, 'Belum Terpetakan') AS kabupaten,
        m.site_class,
        m.transport_type,
        CASE WHEN m.site_key IS NULL THEN 'Belum Terpetakan' ELSE 'Mapped' END AS mapping_status,
        p.revenue,
        p.payload,
        p.traffic,
        COALESCE(a.total_time_minutes, 0) AS total_time_minutes,
        COALESCE(a.outage_minutes, 0) AS outage_minutes
    FROM performance p
    LEFT JOIN master m ON m.site_key = p.site_key
    LEFT JOIN availability a ON a.period = p.period AND a.site_key = p.site_key
)
""".format(availability_facts_ctes=AVAILABILITY_FACTS_CTES)


TICKETING_CTE = """
WITH master AS (
    SELECT DISTINCT ON (UPPER(TRIM(d."Siteid")))
        UPPER(TRIM(d."Siteid")) AS site_key,
        REGEXP_REPLACE(UPPER(TRIM(d."NOP")), '^NOP[[:space:]]+', '') AS master_nop,
        NULLIF(TRIM(d."Kabupaten/KOTA"), '') AS master_kabupaten
    FROM public.data_site_master d
    WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
    ORDER BY UPPER(TRIM(d."Siteid")), d.row_number DESC NULLS LAST
),
facts AS (
    SELECT
        TO_CHAR(t.created_at, 'YYYY-MM') AS period,
        UPPER(TRIM(t.site_id)) AS site_key,
        COALESCE(m.master_nop, REGEXP_REPLACE(UPPER(TRIM(t.nop)), '^NOP[[:space:]]+', '')) AS nop,
        COALESCE(m.master_kabupaten, NULLIF(TRIM(t.kabupaten_kota), ''), 'Belum Terpetakan') AS kabupaten,
        COALESCE(NULLIF(TRIM(t.kategori_tt), ''), 'Tidak Diketahui') AS ticket_category,
        COALESCE(NULLIF(TRIM(t.backup_sukses), ''), 'Tidak Diketahui') AS backup_result,
        CASE WHEN m.site_key IS NULL THEN 'Belum Terpetakan' ELSE 'Mapped' END AS mapping_status,
        CASE WHEN UPPER(TRIM(t.kategori_tt)) = 'BPS' THEN 1 ELSE 0 END AS is_bps,
        CASE WHEN UPPER(TRIM(t.kategori_tt)) LIKE 'TS%' THEN 1 ELSE 0 END AS is_ts,
        CASE WHEN UPPER(TRIM(t.kategori_tt)) = 'BPS' AND UPPER(TRIM(t.backup_sukses)) = 'BU GENSET' THEN 1 ELSE 0 END AS is_backup_success
    FROM public.ticketing_fault_center t
    LEFT JOIN master m ON m.site_key = UPPER(TRIM(t.site_id))
    WHERE t.created_at >= CAST(:start_date AS date)
      AND t.created_at < CAST(:end_date_exclusive AS date)
)
"""


PROKER_CTE = """
WITH master AS (
    SELECT DISTINCT ON (UPPER(TRIM(d."Siteid")))
        UPPER(TRIM(d."Siteid")) AS site_key,
        REGEXP_REPLACE(UPPER(TRIM(d."NOP")), '^NOP[[:space:]]+', '') AS master_nop,
        NULLIF(TRIM(d."Kabupaten/KOTA"), '') AS master_kabupaten
    FROM public.data_site_master d
    WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
    ORDER BY UPPER(TRIM(d."Siteid")), d.row_number DESC NULLS LAST
),
facts AS (
    SELECT
        TO_CHAR(p.create_date, 'YYYY-MM') AS period,
        UPPER(TRIM(p.site_id)) AS site_key,
        COALESCE(m.master_nop, REGEXP_REPLACE(UPPER(TRIM(p.nop)), '^NOP[[:space:]]+', '')) AS nop,
        COALESCE(m.master_kabupaten, NULLIF(TRIM(p.kabupaten), ''), 'Belum Terpetakan') AS kabupaten,
        COALESCE(NULLIF(TRIM(p.status), ''), 'Tidak Diketahui') AS status,
        CASE WHEN m.site_key IS NULL THEN 'Belum Terpetakan' ELSE 'Mapped' END AS mapping_status,
        CASE WHEN UPPER(TRIM(p.status)) = 'OPEN' THEN 1 ELSE 0 END AS is_open,
        CASE WHEN UPPER(TRIM(p.status)) IN ('CLOSE', 'CLOSED') THEN 1 ELSE 0 END AS is_closed
    FROM public.proker_enom_jatim_2026 p
    LEFT JOIN master m ON m.site_key = UPPER(TRIM(p.site_id))
    WHERE p.create_date >= CAST(:start_date AS date)
      AND p.create_date < CAST(:end_date_exclusive AS date)
)
"""


COMMON_DIMENSIONS = {
    "period": "facts.period",
    "nop": "COALESCE(facts.nop, 'Belum Terpetakan')",
    "kabupaten": "COALESCE(facts.kabupaten, 'Belum Terpetakan')",
    "site_id": "facts.site_key",
    "mapping_status": "facts.mapping_status",
}


DATASETS = {
    "performance": PivotDataset(
        cte=PERFORMANCE_CTE,
        dimensions={
            **COMMON_DIMENSIONS,
            "site_class": "COALESCE(facts.site_class, 'Tidak Diketahui')",
            "transport_type": "COALESCE(facts.transport_type, 'Tidak Diketahui')",
        },
        measures={
            "sites": "COUNT(DISTINCT facts.site_key)::bigint",
            "revenue": "COALESCE(SUM(facts.revenue), 0)::bigint",
            "revenue_per_site": "SUM(facts.revenue)::double precision / NULLIF(COUNT(DISTINCT facts.site_key), 0)",
            "payload": "COALESCE(SUM(facts.payload), 0)::bigint",
            "payload_per_site": "SUM(facts.payload)::double precision / NULLIF(COUNT(DISTINCT facts.site_key), 0)",
            "traffic": "COALESCE(SUM(facts.traffic), 0)::bigint",
            "availability": "100.0 * (SUM(facts.total_time_minutes) - SUM(facts.outage_minutes)) / NULLIF(SUM(facts.total_time_minutes), 0)",
            "outage_minutes": "COALESCE(SUM(facts.outage_minutes), 0)::double precision",
        },
    ),
    "ticketing": PivotDataset(
        cte=TICKETING_CTE,
        dimensions={
            **COMMON_DIMENSIONS,
            "ticket_category": "facts.ticket_category",
            "backup_result": "facts.backup_result",
        },
        measures={
            "tickets": "COUNT(*)::bigint",
            "bps_tickets": "COALESCE(SUM(facts.is_bps), 0)::bigint",
            "ts_tickets": "COALESCE(SUM(facts.is_ts), 0)::bigint",
            "backup_success": "COALESCE(SUM(facts.is_backup_success), 0)::bigint",
            "backup_success_rate": "100.0 * SUM(facts.is_backup_success) / NULLIF(SUM(facts.is_bps), 0)",
        },
    ),
    "proker": PivotDataset(
        cte=PROKER_CTE,
        dimensions={**COMMON_DIMENSIONS, "status": "facts.status"},
        measures={
            "activities": "COUNT(*)::bigint",
            "open_activities": "COALESCE(SUM(facts.is_open), 0)::bigint",
            "closed_activities": "COALESCE(SUM(facts.is_closed), 0)::bigint",
        },
    ),
}


def ratio_of_sums(numerator: int | float | None, denominator: int | float | None) -> float | None:
    if numerator is None or denominator is None or float(denominator) == 0:
        return None
    return float(numerator) / float(denominator) * 100.0


def enforce_cell_limit(*, row_count: int, column_count: int, value_count: int) -> int:
    estimated = max(1, int(row_count)) * max(1, int(column_count)) * max(1, int(value_count))
    if estimated > PIVOT_CELL_LIMIT:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "pivot_too_large",
                "estimated_cells": estimated,
                "limit": PIVOT_CELL_LIMIT,
            },
        )
    return estimated


def normalize_pivot_spec(request: ReportingPivotRequest) -> str:
    payload = request.model_dump()
    payload["nop"] = (payload.get("nop") or "").strip().upper()
    payload["values"] = sorted(
        payload["values"], key=lambda item: (item["field"], item["aggregation"])
    )
    payload["filters"] = sorted(
        (
            {"field": item["field"], "values": sorted(set(item["values"]))}
            for item in payload["filters"]
        ),
        key=lambda item: item["field"],
    )
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _distinct_count(expressions: list[str]) -> str:
    if not expressions:
        return "1::bigint"
    if len(expressions) == 1:
        return f"COUNT(DISTINCT {expressions[0]})::bigint"
    return f"COUNT(DISTINCT ({', '.join(expressions)}))::bigint"


def _where_clause(dataset: PivotDataset, request: ReportingPivotRequest, params: dict) -> str:
    clauses = ["(CAST(:nop_key AS text) IS NULL OR facts.nop = :nop_key)"]
    for index, item in enumerate(request.filters):
        parameter = f"filter_{index}"
        params[parameter] = item.values
        clauses.append(f"{dataset.dimensions[item.field]} = ANY(:{parameter})")
    return " AND ".join(clauses)


async def execute_reporting_pivot(session, request: ReportingPivotRequest) -> ReportingPivotResponse:
    """Estimate and execute one compact aggregate from the explicit registry."""
    dataset = DATASETS[request.dataset]
    period = resolve_month_period(
        period_start=request.period_start,
        period_end=request.period_end,
    )
    params = {
        "period_start": period.period_start,
        "period_end": period.period_end,
        "start_date": period.start_date,
        "end_date_exclusive": period.end_date_exclusive,
        "availability_start": period.period_start,
        "availability_end": period.period_end,
        "nop_key": canonical_nop(request.nop),
    }
    where_clause = _where_clause(dataset, request, params)
    row_expressions = [dataset.dimensions[field] for field in request.rows]
    column_expressions = [dataset.dimensions[field] for field in request.columns]
    cardinality_query = text(
        dataset.cte
        + f"""
        /* reporting_pivot_cardinality */
        SELECT
            {_distinct_count(row_expressions)} AS row_count,
            {_distinct_count(column_expressions)} AS column_count
        FROM facts
        WHERE {where_clause}
        """
    )
    cardinality = dict((await session.execute(cardinality_query, params)).mappings().one())
    estimated_cells = enforce_cell_limit(
        row_count=int(cardinality.get("row_count") or 0),
        column_count=int(cardinality.get("column_count") or 0),
        value_count=len(request.values),
    )

    dimensions = request.rows + request.columns
    dimension_selects = [
        f"{dataset.dimensions[field]} AS d_{index}"
        for index, field in enumerate(dimensions)
    ]
    value_selects = [
        f"{dataset.measures[item.field]} AS v_{index}"
        for index, item in enumerate(request.values)
    ]
    group_by = ", ".join(str(index) for index in range(1, len(dimensions) + 1))
    order_by = group_by
    value_query = text(
        dataset.cte
        + f"""
        /* reporting_pivot_values */
        SELECT {', '.join(dimension_selects + value_selects)}
        FROM facts
        WHERE {where_clause}
        GROUP BY {group_by}
        ORDER BY {order_by}
        """
    )
    raw_rows = [dict(row) for row in (await session.execute(value_query, params)).mappings().all()]
    rows = [
        ReportingPivotRow(
            dimensions={
                field: raw.get(f"d_{index}")
                for index, field in enumerate(dimensions)
            },
            values={
                item.field: raw.get(f"v_{index}")
                for index, item in enumerate(request.values)
            },
        )
        for raw in raw_rows
    ]
    return ReportingPivotResponse(
        dataset=request.dataset,
        row_dimensions=request.rows,
        column_dimensions=request.columns,
        value_fields=[item.field for item in request.values],
        estimated_cells=estimated_cells,
        rows=rows,
    )
