"""Server-paginated Kabupaten-to-site analysis for Network Reporting."""

from __future__ import annotations

from sqlalchemy import text

from models.reporting import ReportingSitePage, ReportingSiteQuery, ReportingSiteRow
from queries.reporting_foundation import (
    UNMAPPED_AREA_KEY,
    UNMAPPED_AREA_LABEL,
    canonical_nop,
)
from services.reporting_availability import AVAILABILITY_FACTS_CTES
from services.reporting_overview import (
    AVAILABILITY_SLA,
    _delta_pct,
    availability_sla_status,
    weighted_availability,
)


SORT_EXPRESSIONS = {
    "site_id": "site_key",
    "revenue": "revenue",
    "payload": "payload",
    "availability": "avg_availability",
    "revenue_mom": "revenue_mom_pct",
    "payload_mom": "payload_mom_pct",
}


def build_site_order(query: ReportingSiteQuery) -> str:
    field = query.rank_metric if query.rank != "all" else query.sort_by
    expression = SORT_EXPRESSIONS[field]
    if query.rank == "top":
        direction = "DESC"
    elif query.rank == "bottom":
        direction = "ASC"
    else:
        direction = query.sort_dir.upper()
    return f"{expression} {direction} NULLS LAST, site_key ASC"


def matches_sla(availability: float | None, requested: str) -> bool:
    if requested == "all":
        return True
    if requested == "unavailable":
        return availability is None
    if availability is None:
        return False
    if requested == "met":
        return availability >= AVAILABILITY_SLA
    return availability < AVAILABILITY_SLA


SITE_FACTS_CTE = """
WITH master AS (
    SELECT DISTINCT ON (UPPER(TRIM(d."Siteid")))
        UPPER(TRIM(d."Siteid")) AS site_key,
        d."Siteid" AS site_id,
        d."Site Name" AS site_name,
        d."NOP" AS nop,
        REGEXP_REPLACE(UPPER(TRIM(d."NOP")), '^NOP[[:space:]]+', '') AS nop_key,
        d."Kabupaten/KOTA" AS kabupaten,
        d."Status Site" AS status_site,
        d."Site Class" AS site_class,
        d."Transport Type" AS transport_type
    FROM public.data_site_master d
    WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
    ORDER BY UPPER(TRIM(d."Siteid")), d.row_number DESC NULLS LAST
),
active AS (
    SELECT
        UPPER(TRIM(t.site_id)) AS site_key,
        MIN(t.site_id) AS source_site_id,
        SUM(COALESCE(t.rev, 0))::bigint AS revenue,
        SUM(COALESCE(t.payload, 0))::bigint AS payload
    FROM public.traktor_data t
    WHERE t.trx_month BETWEEN :period_start AND :period_end
      AND NULLIF(TRIM(t.site_id), '') IS NOT NULL
    GROUP BY 1
),
previous AS (
    SELECT
        UPPER(TRIM(t.site_id)) AS site_key,
        SUM(COALESCE(t.rev, 0))::bigint AS previous_revenue,
        SUM(COALESCE(t.payload, 0))::bigint AS previous_payload
    FROM public.traktor_data t
    WHERE t.trx_month BETWEEN :comparison_start AND :comparison_end
      AND NULLIF(TRIM(t.site_id), '') IS NOT NULL
    GROUP BY 1
),
{availability_facts_ctes},
availability AS (
    SELECT
        s.site_key,
        SUM(COALESCE(s.total_time_minutes, 0))::double precision AS total_time_minutes,
        SUM(COALESCE(s.outage_minutes, 0))::double precision AS outage_minutes
    FROM availability_facts s
    WHERE s.period BETWEEN :period_start AND :period_end
    GROUP BY 1
),
site_facts AS (
    SELECT
        a.site_key,
        COALESCE(m.site_id, a.source_site_id) AS site_id,
        m.site_name,
        m.nop,
        m.nop_key,
        m.site_key IS NOT NULL AS is_mapped,
        m.kabupaten,
        m.status_site,
        m.site_class,
        m.transport_type,
        a.revenue,
        COALESCE(p.previous_revenue, 0)::bigint AS previous_revenue,
        CASE WHEN COALESCE(p.previous_revenue, 0) <> 0
             THEN 100.0 * (a.revenue - p.previous_revenue) / p.previous_revenue END::double precision AS revenue_mom_pct,
        a.payload,
        COALESCE(p.previous_payload, 0)::bigint AS previous_payload,
        CASE WHEN COALESCE(p.previous_payload, 0) <> 0
             THEN 100.0 * (a.payload - p.previous_payload) / p.previous_payload END::double precision AS payload_mom_pct,
        COALESCE(v.total_time_minutes, 0)::double precision AS total_time_minutes,
        COALESCE(v.outage_minutes, 0)::double precision AS outage_minutes,
        CASE WHEN COALESCE(v.total_time_minutes, 0) > 0
             THEN 100.0 * (v.total_time_minutes - v.outage_minutes) / v.total_time_minutes END::double precision AS avg_availability
    FROM active a
    LEFT JOIN master m ON m.site_key = a.site_key
    LEFT JOIN previous p ON p.site_key = a.site_key
    LEFT JOIN availability v ON v.site_key = a.site_key
),
filtered AS (
    SELECT *
    FROM site_facts
    WHERE (CAST(:nop_key AS text) IS NULL OR nop_key = :nop_key)
      AND (
        (:area_key = :unmapped_key AND NOT is_mapped)
        OR (:area_key <> :unmapped_key AND UPPER(TRIM(kabupaten)) = :area_key)
      )
      AND (CAST(:site_class AS text) IS NULL OR UPPER(TRIM(site_class)) = UPPER(TRIM(:site_class)))
      AND (CAST(:search AS text) IS NULL OR site_key LIKE :search OR UPPER(COALESCE(site_name, '')) LIKE :search)
      {sla_filter}
)
""".format(availability_facts_ctes=AVAILABILITY_FACTS_CTES, sla_filter="{sla_filter}")


def _sla_sql_filter(requested: str) -> str:
    return {
        "all": "",
        "met": f"AND avg_availability >= {AVAILABILITY_SLA}",
        "missed": f"AND avg_availability < {AVAILABILITY_SLA}",
        "unavailable": "AND avg_availability IS NULL",
    }[requested]


async def load_reporting_sites(
    session,
    *,
    period,
    nop: str | None,
    area_key: str,
    query: ReportingSiteQuery,
) -> ReportingSitePage:
    normalized_area = (
        UNMAPPED_AREA_KEY if area_key.strip().lower() in {"unmapped", UNMAPPED_AREA_KEY.lower()} else area_key.strip().upper()
    )
    effective_page = 1 if query.rank != "all" else query.page
    effective_page_size = min(query.page_size, query.rank_limit) if query.rank != "all" else query.page_size
    params = {
        "period_start": period.period_start,
        "period_end": period.period_end,
        "comparison_start": period.comparison_start,
        "comparison_end": period.comparison_end,
        "availability_start": period.period_start,
        "availability_end": period.period_end,
        "nop_key": canonical_nop(nop),
        "area_key": normalized_area,
        "unmapped_key": UNMAPPED_AREA_KEY,
        "site_class": query.site_class.strip() if query.site_class else None,
        "search": f"%{query.q.strip().upper()}%" if query.q and query.q.strip() else None,
        "limit": effective_page_size,
        "offset": (effective_page - 1) * effective_page_size,
    }
    cte = SITE_FACTS_CTE.format(sla_filter=_sla_sql_filter(query.sla))
    rows_query = text(
        cte
        + f"""
        /* reporting_site_rows */
        SELECT *, COUNT(*) OVER ()::bigint AS total_count
        FROM filtered
        ORDER BY {build_site_order(query)}
        LIMIT :limit OFFSET :offset
        """
    )
    facet_query = text(
        cte
        + """
        /* reporting_site_facets */
        SELECT
            COALESCE(ARRAY_AGG(DISTINCT site_class ORDER BY site_class)
                     FILTER (WHERE site_class IS NOT NULL), ARRAY[]::text[]) AS site_classes,
            COUNT(*)::bigint AS total_sites
        FROM filtered
        """
    )
    row_values = [dict(row) for row in (await session.execute(rows_query, params)).mappings().all()]
    facet_values = [dict(row) for row in (await session.execute(facet_query, params)).mappings().all()]
    facet = facet_values[0] if facet_values else {"site_classes": [], "total_sites": 0}
    total = int(row_values[0].get("total_count") or 0) if row_values else int(facet.get("total_sites") or 0)
    if query.rank != "all":
        total = min(total, query.rank_limit)

    items: list[ReportingSiteRow] = []
    for row in row_values:
        availability = weighted_availability(row.get("total_time_minutes"), row.get("outage_minutes"))
        items.append(
            ReportingSiteRow(
                site_id=str(row.get("site_id") or row["site_key"]),
                site_name=row.get("site_name"),
                nop=row.get("nop"),
                kabupaten=row.get("kabupaten"),
                status_site=row.get("status_site"),
                site_class=row.get("site_class"),
                transport_type=row.get("transport_type"),
                revenue=int(row.get("revenue") or 0),
                previous_revenue=int(row.get("previous_revenue") or 0),
                revenue_mom_pct=_delta_pct(row.get("revenue"), row.get("previous_revenue")),
                payload=int(row.get("payload") or 0),
                previous_payload=int(row.get("previous_payload") or 0),
                payload_mom_pct=_delta_pct(row.get("payload"), row.get("previous_payload")),
                avg_availability=availability,
                outage_minutes=float(row.get("outage_minutes") or 0),
                sla_status=availability_sla_status(availability),
            )
        )

    return ReportingSitePage(
        area_key=normalized_area,
        kabupaten=UNMAPPED_AREA_LABEL if normalized_area == UNMAPPED_AREA_KEY else normalized_area,
        total=total,
        page=effective_page,
        page_size=effective_page_size,
        items=items,
        site_classes=[str(value) for value in (facet.get("site_classes") or [])],
        rank=query.rank,
        rank_metric=query.rank_metric,
    )
