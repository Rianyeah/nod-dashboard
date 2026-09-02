"""Canonical metrics for the compact Network Reporting experience."""

from __future__ import annotations

import asyncio

from sqlalchemy import text

from models.reporting import (
    ReportingContribution,
    ReportingAreaRow,
    ReportingMetricFact,
    ReportingOverview,
    ReportingOverviewScorecards,
    ReportingRevenueFact,
    ReportingSourceCoverage,
    ReportingTarget,
    RevenueTrendItem,
)
from periods import build_period_meta
from queries.reporting_foundation import (
    RevenueTargetResult,
    UNMAPPED_AREA_KEY,
    UNMAPPED_AREA_LABEL,
    canonical_nop,
    load_revenue_target,
)
from services.reporting_availability import AVAILABILITY_FACTS_CTES
from services.reporting_insights import (
    build_metric_recommendation,
    metric_direction,
    select_additive_driver,
    select_availability_driver,
)
from services.reporting_thresholds import resolve_threshold_snapshot


AVAILABILITY_SLA = 99.5


SCOPE_AGGREGATES_QUERY = """
/* reporting_scope_aggregates */
WITH master AS (
    SELECT DISTINCT ON (UPPER(TRIM(d."Siteid")))
        UPPER(TRIM(d."Siteid")) AS site_key,
        REGEXP_REPLACE(UPPER(TRIM(d."NOP")), '^NOP[[:space:]]+', '') AS nop_key
    FROM public.data_site_master d
    WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
    ORDER BY UPPER(TRIM(d."Siteid")), d.row_number DESC NULLS LAST
),
active_performance AS (
    SELECT
        UPPER(TRIM(t.site_id)) AS site_key,
        SUM(COALESCE(t.rev, 0)) AS revenue,
        SUM(COALESCE(t.payload, 0)) AS payload
    FROM public.traktor_data t
    WHERE t.trx_month BETWEEN :period_start AND :period_end
      AND NULLIF(TRIM(t.site_id), '') IS NOT NULL
    GROUP BY 1
),
previous_performance AS (
    SELECT
        UPPER(TRIM(t.site_id)) AS site_key,
        SUM(COALESCE(t.rev, 0)) AS revenue,
        SUM(COALESCE(t.payload, 0)) AS payload
    FROM public.traktor_data t
    WHERE t.trx_month BETWEEN :comparison_start AND :comparison_end
      AND NULLIF(TRIM(t.site_id), '') IS NOT NULL
    GROUP BY 1
),
band_months AS (
    SELECT
        'selected'::text AS window_key,
        TO_CHAR(month_value, 'YYYY-MM') AS trx_month
    FROM GENERATE_SERIES(
        TO_DATE(:period_start, 'YYYY-MM'),
        TO_DATE(:period_end, 'YYYY-MM'),
        INTERVAL '1 month'
    ) AS selected_months(month_value)
    UNION ALL
    SELECT
        'previous'::text AS window_key,
        TO_CHAR(month_value, 'YYYY-MM') AS trx_month
    FROM GENERATE_SERIES(
        TO_DATE(:comparison_start, 'YYYY-MM'),
        TO_DATE(:comparison_end, 'YYYY-MM'),
        INTERVAL '1 month'
    ) AS previous_months(month_value)
),
band_performance AS (
    SELECT
        t.trx_month,
        UPPER(TRIM(t.site_id)) AS site_key,
        SUM(t.rev)::bigint AS revenue
    FROM public.traktor_data t
    WHERE t.trx_month BETWEEN :comparison_start AND :period_end
      AND NULLIF(TRIM(t.site_id), '') IS NOT NULL
    GROUP BY 1, 2
),
band_window_sites AS (
    SELECT DISTINCT months.window_key, performance.site_key
    FROM band_months months
    JOIN band_performance performance ON performance.trx_month = months.trx_month
),
band_monthly AS (
    SELECT
        sites.window_key,
        months.trx_month,
        sites.site_key,
        performance.revenue,
        revenue_u30.threshold_value::double precision AS u30_upper,
        revenue_u60.threshold_value::double precision AS u60_upper
    FROM band_window_sites sites
    JOIN band_months months ON months.window_key = sites.window_key
    LEFT JOIN band_performance performance
      ON performance.site_key = sites.site_key
     AND performance.trx_month = months.trx_month
    LEFT JOIN LATERAL (
        SELECT threshold.threshold_value
        FROM public.reporting_metric_thresholds threshold
        WHERE threshold.metric = 'revenue'
          AND threshold.threshold_key = 'u30_upper'
          AND threshold.site_class = '*'
          AND threshold.effective_month <= months.trx_month
        ORDER BY threshold.effective_month DESC, threshold.updated_at DESC
        LIMIT 1
    ) revenue_u30 ON TRUE
    LEFT JOIN LATERAL (
        SELECT threshold.threshold_value
        FROM public.reporting_metric_thresholds threshold
        WHERE threshold.metric = 'revenue'
          AND threshold.threshold_key = 'u60_upper'
          AND threshold.site_class = '*'
          AND threshold.effective_month <= months.trx_month
        ORDER BY threshold.effective_month DESC, threshold.updated_at DESC
        LIMIT 1
    ) revenue_u60 ON TRUE
),
band_monthly_status AS (
    SELECT
        *,
        CASE
            WHEN revenue IS NULL OR u30_upper IS NULL OR u60_upper IS NULL THEN 'unavailable'
            WHEN revenue < u30_upper THEN 'u30'
            WHEN revenue < u60_upper THEN 'u60'
            ELSE 'achieved'
        END AS revenue_band
    FROM band_monthly
),
band_site_status AS (
    SELECT
        window_key,
        site_key,
        CASE
            WHEN BOOL_OR(revenue_band = 'unavailable') THEN 'unavailable'
            WHEN BOOL_OR(revenue_band = 'u30') THEN 'u30'
            WHEN BOOL_OR(revenue_band = 'u60') THEN 'u60'
            ELSE 'achieved'
        END AS revenue_band
    FROM band_monthly_status
    GROUP BY 1, 2
),
band_area AS (
    SELECT
        COALESCE(UPPER(TRIM(master.kabupaten)), :unmapped_key) AS area_key,
        COUNT(*) FILTER (
            WHERE status.window_key = 'selected' AND status.revenue_band = 'u30'
        )::bigint AS u30_sites,
        COUNT(*) FILTER (
            WHERE status.window_key = 'previous' AND status.revenue_band = 'u30'
        )::bigint AS previous_u30_sites,
        COUNT(*) FILTER (
            WHERE status.window_key = 'selected' AND status.revenue_band = 'u60'
        )::bigint AS u60_sites,
        COUNT(*) FILTER (
            WHERE status.window_key = 'previous' AND status.revenue_band = 'u60'
        )::bigint AS previous_u60_sites
    FROM band_site_status status
    LEFT JOIN master ON master.site_key = status.site_key
    WHERE CAST(:nop_key AS text) IS NULL OR master.nop_key = :nop_key
    GROUP BY 1
),
{availability_facts_ctes},
active_availability AS (
    SELECT
        smm.site_key,
        SUM(COALESCE(smm.total_time_minutes, 0)) AS total_time_minutes,
        SUM(COALESCE(smm.outage_minutes, 0)) AS outage_minutes
    FROM availability_facts smm
    WHERE smm.period BETWEEN :period_start AND :period_end
    GROUP BY 1
),
previous_availability AS (
    SELECT
        smm.site_key,
        SUM(COALESCE(smm.total_time_minutes, 0)) AS total_time_minutes,
        SUM(COALESCE(smm.outage_minutes, 0)) AS outage_minutes
    FROM availability_facts smm
    WHERE smm.period BETWEEN :comparison_start AND :comparison_end
    GROUP BY 1
),
active_facts AS (
    SELECT
        p.site_key,
        m.nop_key,
        p.revenue,
        p.payload,
        COALESCE(a.total_time_minutes, 0) AS total_time_minutes,
        COALESCE(a.outage_minutes, 0) AS outage_minutes
    FROM active_performance p
    LEFT JOIN master m ON m.site_key = p.site_key
    LEFT JOIN active_availability a ON a.site_key = p.site_key
),
previous_facts AS (
    SELECT
        p.site_key,
        m.nop_key,
        p.revenue,
        p.payload,
        COALESCE(a.total_time_minutes, 0) AS total_time_minutes,
        COALESCE(a.outage_minutes, 0) AS outage_minutes
    FROM previous_performance p
    LEFT JOIN master m ON m.site_key = p.site_key
    LEFT JOIN previous_availability a ON a.site_key = p.site_key
)
SELECT
    'regional' AS scope,
    COUNT(DISTINCT site_key)::bigint AS total_sites,
    COUNT(DISTINCT site_key) FILTER (WHERE site_key LIKE 'EPM%')::bigint AS epm_sites,
    COUNT(DISTINCT site_key) FILTER (WHERE site_key NOT LIKE 'EPM%')::bigint AS non_epm_sites,
    COALESCE(SUM(revenue), 0)::bigint AS revenue,
    COALESCE(SUM(payload), 0)::bigint AS payload,
    COALESCE(SUM(total_time_minutes), 0)::double precision AS total_time_minutes,
    COALESCE(SUM(outage_minutes), 0)::double precision AS outage_minutes
FROM active_facts
UNION ALL
SELECT
    'selected',
    COUNT(DISTINCT site_key)::bigint,
    COUNT(DISTINCT site_key) FILTER (WHERE site_key LIKE 'EPM%')::bigint,
    COUNT(DISTINCT site_key) FILTER (WHERE site_key NOT LIKE 'EPM%')::bigint,
    COALESCE(SUM(revenue), 0)::bigint,
    COALESCE(SUM(payload), 0)::bigint,
    COALESCE(SUM(total_time_minutes), 0)::double precision,
    COALESCE(SUM(outage_minutes), 0)::double precision
FROM active_facts
WHERE CAST(:nop_key AS text) IS NULL OR nop_key = :nop_key
UNION ALL
SELECT
    'previous',
    COUNT(DISTINCT site_key)::bigint,
    COUNT(DISTINCT site_key) FILTER (WHERE site_key LIKE 'EPM%')::bigint,
    COUNT(DISTINCT site_key) FILTER (WHERE site_key NOT LIKE 'EPM%')::bigint,
    COALESCE(SUM(revenue), 0)::bigint,
    COALESCE(SUM(payload), 0)::bigint,
    COALESCE(SUM(total_time_minutes), 0)::double precision,
    COALESCE(SUM(outage_minutes), 0)::double precision
FROM previous_facts
WHERE CAST(:nop_key AS text) IS NULL OR nop_key = :nop_key
""".format(availability_facts_ctes=AVAILABILITY_FACTS_CTES)


OVERVIEW_YTD_QUERY = """
/* reporting_ytd_aggregates */
WITH master AS (
    SELECT DISTINCT ON (UPPER(TRIM(d."Siteid")))
        UPPER(TRIM(d."Siteid")) AS site_key,
        REGEXP_REPLACE(UPPER(TRIM(d."NOP")), '^NOP[[:space:]]+', '') AS nop_key
    FROM public.data_site_master d
    WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
    ORDER BY UPPER(TRIM(d."Siteid")), d.row_number DESC NULLS LAST
), ytd AS (
    SELECT
        UPPER(TRIM(t.site_id)) AS site_key,
        SUM(COALESCE(t.rev, 0)) AS revenue,
        SUM(COALESCE(t.payload, 0)) AS payload
    FROM public.traktor_data t
    WHERE t.trx_month BETWEEN :year_start AND :period_end
      AND NULLIF(TRIM(t.site_id), '') IS NOT NULL
    GROUP BY 1
)
SELECT
    COALESCE(SUM(y.revenue), 0)::bigint AS revenue_ytd,
    COALESCE(SUM(y.payload), 0)::bigint AS payload_ytd
FROM ytd y
LEFT JOIN master m ON m.site_key = y.site_key
WHERE CAST(:nop_key AS text) IS NULL OR m.nop_key = :nop_key
"""


SITE_DRIVER_CANDIDATES_QUERY = """
/* reporting_site_driver_candidates */
WITH master AS (
    SELECT DISTINCT ON (UPPER(TRIM(d."Siteid")))
        UPPER(TRIM(d."Siteid")) AS site_key,
        d."Siteid" AS site_id,
        d."Site Name" AS site_name,
        REGEXP_REPLACE(UPPER(TRIM(d."NOP")), '^NOP[[:space:]]+', '') AS nop_key
    FROM public.data_site_master d
    WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
    ORDER BY UPPER(TRIM(d."Siteid")), d.row_number DESC NULLS LAST
),
active_performance AS (
    SELECT
        UPPER(TRIM(t.site_id)) AS site_key,
        SUM(COALESCE(t.rev, 0))::bigint AS revenue,
        SUM(COALESCE(t.payload, 0))::bigint AS payload
    FROM public.traktor_data t
    WHERE t.trx_month BETWEEN :period_start AND :period_end
      AND NULLIF(TRIM(t.site_id), '') IS NOT NULL
    GROUP BY 1
),
previous_performance AS (
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
active_availability AS (
    SELECT
        a.site_key,
        SUM(COALESCE(a.total_time_minutes, 0))::double precision AS total_time_minutes,
        SUM(COALESCE(a.outage_minutes, 0))::double precision AS outage_minutes
    FROM availability_facts a
    WHERE a.period BETWEEN :period_start AND :period_end
    GROUP BY 1
),
previous_availability AS (
    SELECT
        a.site_key,
        SUM(COALESCE(a.total_time_minutes, 0))::double precision AS previous_total_time_minutes,
        SUM(COALESCE(a.outage_minutes, 0))::double precision AS previous_outage_minutes
    FROM availability_facts a
    WHERE a.period BETWEEN :comparison_start AND :comparison_end
    GROUP BY 1
),
active AS (
    SELECT
        COALESCE(p.site_key, a.site_key) AS site_key,
        p.revenue,
        p.payload,
        a.total_time_minutes,
        a.outage_minutes
    FROM active_performance p
    FULL OUTER JOIN active_availability a ON a.site_key = p.site_key
),
previous AS (
    SELECT
        COALESCE(p.site_key, a.site_key) AS site_key,
        p.previous_revenue,
        p.previous_payload,
        a.previous_total_time_minutes,
        a.previous_outage_minutes
    FROM previous_performance p
    FULL OUTER JOIN previous_availability a ON a.site_key = p.site_key
)
SELECT
    COALESCE(active.site_key, previous.site_key) AS site_key,
    COALESCE(master.site_id, active.site_key, previous.site_key) AS site_id,
    master.site_name,
    active.revenue,
    previous.previous_revenue,
    active.payload,
    previous.previous_payload,
    active.total_time_minutes,
    active.outage_minutes,
    previous.previous_total_time_minutes,
    previous.previous_outage_minutes,
    CASE WHEN active.total_time_minutes > 0 THEN
        100.0 * (active.total_time_minutes - active.outage_minutes) / active.total_time_minutes
    END::double precision AS availability,
    CASE WHEN previous.previous_total_time_minutes > 0 THEN
        100.0 * (previous.previous_total_time_minutes - previous.previous_outage_minutes)
        / previous.previous_total_time_minutes
    END::double precision AS previous_availability
FROM active
FULL OUTER JOIN previous ON previous.site_key = active.site_key
LEFT JOIN master ON master.site_key = COALESCE(active.site_key, previous.site_key)
WHERE CAST(:nop_key AS text) IS NULL OR master.nop_key = :nop_key
""".format(availability_facts_ctes=AVAILABILITY_FACTS_CTES)


TREND_QUERY = """
/* reporting_trend */
WITH context_months AS (
    SELECT TO_CHAR(month_value, 'YYYY-MM') AS trx_month
    FROM GENERATE_SERIES(
        TO_DATE(:context_start, 'YYYY-MM'),
        TO_DATE(:period_end, 'YYYY-MM'),
        INTERVAL '1 month'
    ) AS month_series(month_value)
),
master AS (
    SELECT DISTINCT ON (UPPER(TRIM(d."Siteid")))
        UPPER(TRIM(d."Siteid")) AS site_key,
        REGEXP_REPLACE(UPPER(TRIM(d."NOP")), '^NOP[[:space:]]+', '') AS nop_key
    FROM public.data_site_master d
    WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
    ORDER BY UPPER(TRIM(d."Siteid")), d.row_number DESC NULLS LAST
),
performance AS (
    SELECT
        t.trx_month,
        UPPER(TRIM(t.site_id)) AS site_key,
        SUM(t.rev)::bigint AS revenue,
        SUM(COALESCE(t.payload, 0))::bigint AS payload,
        SUM(COALESCE(t.traffic, 0))::bigint AS traffic
    FROM public.traktor_data t
    WHERE t.trx_month BETWEEN :context_start AND :period_end
      AND NULLIF(TRIM(t.site_id), '') IS NOT NULL
    GROUP BY 1, 2
),
context_sites AS (
    SELECT DISTINCT p.site_key
    FROM performance p
    LEFT JOIN master m ON m.site_key = p.site_key
    WHERE CAST(:nop_key AS text) IS NULL OR m.nop_key = :nop_key
),
site_months AS (
    SELECT month.trx_month, site.site_key
    FROM context_months month
    CROSS JOIN context_sites site
),
{availability_facts_ctes},
availability AS (
    SELECT
        smm.period AS trx_month,
        smm.site_key,
        SUM(COALESCE(smm.total_time_minutes, 0)) AS total_time_minutes,
        SUM(COALESCE(smm.outage_minutes, 0)) AS outage_minutes
    FROM availability_facts smm
    WHERE smm.period BETWEEN :context_start AND :period_end
    GROUP BY 1, 2
),
classified AS (
    SELECT
        sm.trx_month,
        sm.site_key,
        p.revenue,
        p.payload,
        p.traffic,
        a.total_time_minutes,
        a.outage_minutes,
        u30.revenue_u30_upper,
        u60.revenue_u60_upper
    FROM site_months sm
    LEFT JOIN performance p
      ON p.site_key = sm.site_key AND p.trx_month = sm.trx_month
    LEFT JOIN availability a
      ON a.site_key = sm.site_key AND a.trx_month = sm.trx_month
    LEFT JOIN LATERAL (
        SELECT threshold.threshold_value AS revenue_u30_upper
        FROM public.reporting_metric_thresholds threshold
        WHERE threshold.metric = 'revenue'
          AND threshold.threshold_key = 'u30_upper'
          AND threshold.site_class = '*'
          AND threshold.effective_month <= sm.trx_month
        ORDER BY threshold.effective_month DESC, threshold.updated_at DESC
        LIMIT 1
    ) u30 ON TRUE
    LEFT JOIN LATERAL (
        SELECT threshold.threshold_value AS revenue_u60_upper
        FROM public.reporting_metric_thresholds threshold
        WHERE threshold.metric = 'revenue'
          AND threshold.threshold_key = 'u60_upper'
          AND threshold.site_class = '*'
          AND threshold.effective_month <= sm.trx_month
        ORDER BY threshold.effective_month DESC, threshold.updated_at DESC
        LIMIT 1
    ) u60 ON TRUE
)
SELECT
    c.trx_month,
    COALESCE(SUM(c.revenue), 0)::bigint AS total_revenue,
    COALESCE(SUM(c.payload), 0)::bigint AS total_payload,
    COALESCE(SUM(c.traffic), 0)::bigint AS total_traffic,
    CASE WHEN SUM(COALESCE(c.total_time_minutes, 0)) > 0 THEN
        100.0 * (
            SUM(COALESCE(c.total_time_minutes, 0)) - SUM(COALESCE(c.outage_minutes, 0))
        ) / SUM(COALESCE(c.total_time_minutes, 0))
    END::double precision AS avg_availability,
    CASE WHEN MAX(c.revenue_u30_upper) IS NULL OR MAX(c.revenue_u60_upper) IS NULL
         THEN NULL
         ELSE COUNT(*) FILTER (
             WHERE c.revenue IS NOT NULL AND c.revenue < c.revenue_u30_upper
         )
    END::bigint AS u30_sites,
    CASE WHEN MAX(c.revenue_u30_upper) IS NULL OR MAX(c.revenue_u60_upper) IS NULL
         THEN NULL
         ELSE COUNT(*) FILTER (
             WHERE c.revenue IS NOT NULL
               AND c.revenue >= c.revenue_u30_upper
               AND c.revenue < c.revenue_u60_upper
         )
    END::bigint AS u60_sites,
    CASE WHEN MAX(c.revenue_u60_upper) IS NULL
         THEN NULL
         ELSE COUNT(*) FILTER (
             WHERE c.revenue IS NOT NULL AND c.revenue >= c.revenue_u60_upper
         )
    END::bigint AS achieved_sites,
    COUNT(*) FILTER (
        WHERE c.revenue IS NULL
           OR c.revenue_u30_upper IS NULL
           OR c.revenue_u60_upper IS NULL
    )::bigint AS unavailable_sites
FROM classified c
GROUP BY c.trx_month
ORDER BY c.trx_month
""".format(availability_facts_ctes=AVAILABILITY_FACTS_CTES)


COVERAGE_QUERY = """
/* reporting_coverage */
WITH master AS (
    SELECT DISTINCT UPPER(TRIM(d."Siteid")) AS site_key
    FROM public.data_site_master d
    WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
),
performance AS (
    SELECT
        t.trx_month,
        UPPER(TRIM(t.site_id)) AS site_key
    FROM public.traktor_data t
    WHERE t.trx_month BETWEEN :period_start AND :period_end
),
refresh AS (
    SELECT source_key, last_refreshed_at
    FROM public.reporting_source_refresh
),
{availability_facts_ctes}
SELECT
    'traktor_data' AS source_key,
    MAX(p.trx_month) AS latest_data_period,
    COUNT(*)::bigint AS record_count,
    COUNT(DISTINCT p.site_key) FILTER (WHERE m.site_key IS NOT NULL)::bigint AS mapped_sites,
    COUNT(DISTINCT p.site_key)::bigint AS total_sites,
    ARRAY_AGG(DISTINCT p.trx_month ORDER BY p.trx_month) AS available_periods,
    MAX(r.last_refreshed_at) AS last_refreshed_at
FROM performance p
LEFT JOIN master m ON m.site_key = p.site_key
LEFT JOIN refresh r ON r.source_key = 'traktor_data'
UNION ALL
SELECT
    'site_month_metrics',
    MAX(s.period),
    COUNT(*)::bigint,
    COUNT(DISTINCT s.site_key) FILTER (WHERE m.site_key IS NOT NULL)::bigint,
    COUNT(DISTINCT s.site_key)::bigint,
    ARRAY_AGG(DISTINCT s.period ORDER BY s.period),
    (SELECT MAX(r.last_refreshed_at) FROM refresh r WHERE r.source_key IN ('site_month_metrics', 'availability_logs_jatim'))
FROM availability_facts s
LEFT JOIN master m ON m.site_key = s.site_key
WHERE s.period BETWEEN :period_start AND :period_end
UNION ALL
SELECT
    'ticketing_fault_center',
    MAX(TO_CHAR(t.created_at, 'YYYY-MM')),
    COUNT(*)::bigint,
    NULL::bigint,
    COUNT(DISTINCT UPPER(TRIM(t.site_id)))::bigint,
    ARRAY_AGG(DISTINCT TO_CHAR(t.created_at, 'YYYY-MM') ORDER BY TO_CHAR(t.created_at, 'YYYY-MM')),
    MAX(r.last_refreshed_at)
FROM public.ticketing_fault_center t
LEFT JOIN refresh r ON r.source_key = 'ticketing_fault_center'
WHERE t.created_at >= CAST(:start_date AS date) AND t.created_at < CAST(:end_date_exclusive AS date)
UNION ALL
SELECT
    'proker_enom_jatim_2026',
    MAX(TO_CHAR(p.create_date, 'YYYY-MM')),
    COUNT(*)::bigint,
    NULL::bigint,
    COUNT(DISTINCT UPPER(TRIM(p.site_id)))::bigint,
    ARRAY_AGG(DISTINCT TO_CHAR(p.create_date, 'YYYY-MM') ORDER BY TO_CHAR(p.create_date, 'YYYY-MM')),
    MAX(r.last_refreshed_at)
FROM public.proker_enom_jatim_2026 p
LEFT JOIN refresh r ON r.source_key = 'proker_enom_jatim_2026'
WHERE p.create_date >= CAST(:start_date AS date) AND p.create_date < CAST(:end_date_exclusive AS date)
UNION ALL
SELECT
    'data_site_master',
    NULL::text,
    COUNT(*)::bigint,
    COUNT(*)::bigint,
    COUNT(*)::bigint,
    ARRAY[]::text[],
    MAX(r.last_refreshed_at)
FROM master m
LEFT JOIN refresh r ON r.source_key = 'data_site_master'
UNION ALL
SELECT
    'reporting_revenue_targets',
    MAX(t.trx_month),
    COUNT(*)::bigint,
    NULL::bigint,
    NULL::bigint,
    COALESCE(ARRAY_AGG(DISTINCT t.trx_month ORDER BY t.trx_month), ARRAY[]::text[]),
    MAX(r.last_refreshed_at)
FROM public.reporting_revenue_targets t
LEFT JOIN refresh r ON r.source_key = 'reporting_revenue_targets'
WHERE (CAST(:nop_key AS text) IS NOT NULL AND t.nop_key = :nop_key)
  AND t.trx_month BETWEEN :period_start AND :period_end
UNION ALL
SELECT
    'reporting_metric_thresholds',
    MAX(t.effective_month),
    COUNT(*)::bigint,
    NULL::bigint,
    NULL::bigint,
    CASE WHEN COUNT(DISTINCT (t.metric, t.threshold_key, t.site_class)) >= 8 THEN
        ARRAY(
            SELECT TO_CHAR(month_value, 'YYYY-MM')
            FROM GENERATE_SERIES(
                TO_DATE(:period_start, 'YYYY-MM'),
                TO_DATE(:period_end, 'YYYY-MM'),
                INTERVAL '1 month'
            ) AS month_series(month_value)
        )
    ELSE ARRAY[]::text[] END,
    MAX(r.last_refreshed_at)
FROM public.reporting_metric_thresholds t
LEFT JOIN refresh r ON r.source_key = 'reporting_metric_thresholds'
WHERE t.effective_month <= :period_end
""".format(availability_facts_ctes=AVAILABILITY_FACTS_CTES)


SOURCE_LABELS = {
    "traktor_data": "Performance",
    "site_month_metrics": "Availability",
    "ticketing_fault_center": "Ticketing",
    "proker_enom_jatim_2026": "Proker",
    "data_site_master": "Site Master",
    "reporting_revenue_targets": "Revenue Target",
    "reporting_metric_thresholds": "Performance Threshold",
}


AREA_AGGREGATES_QUERY = """
/* reporting_area_aggregates */
WITH master AS (
    SELECT DISTINCT ON (UPPER(TRIM(d."Siteid")))
        UPPER(TRIM(d."Siteid")) AS site_key,
        REGEXP_REPLACE(UPPER(TRIM(d."NOP")), '^NOP[[:space:]]+', '') AS nop_key,
        NULLIF(TRIM(d."Kabupaten/KOTA"), '') AS kabupaten
    FROM public.data_site_master d
    WHERE NULLIF(TRIM(d."Siteid"), '') IS NOT NULL
    ORDER BY UPPER(TRIM(d."Siteid")), d.row_number DESC NULLS LAST
),
active_performance AS (
    SELECT
        UPPER(TRIM(t.site_id)) AS site_key,
        SUM(COALESCE(t.rev, 0)) AS revenue,
        SUM(COALESCE(t.rev_voice, 0)) AS rev_voice,
        SUM(COALESCE(t.rev_bb, 0)) AS rev_bb,
        SUM(COALESCE(t.rev_dig, 0)) AS rev_dig,
        SUM(COALESCE(t.rev_sms, 0)) AS rev_sms,
        SUM(COALESCE(t.rev_ir, 0)) AS rev_ir,
        SUM(COALESCE(t.payload, 0)) AS payload,
        SUM(COALESCE(t.pld_2g, 0)) AS pld_2g,
        SUM(COALESCE(t.pld_3g, 0)) AS pld_3g,
        SUM(COALESCE(t.pld_4g, 0)) AS pld_4g,
        SUM(COALESCE(t.pld_5g, 0)) AS pld_5g,
        SUM(COALESCE(t.traffic, 0)) AS traffic,
        SUM(COALESCE(t.trf_2g, 0)) AS trf_2g,
        SUM(COALESCE(t.trf_3g, 0)) AS trf_3g,
        SUM(COALESCE(t.trf_4g, 0)) AS trf_4g
    FROM public.traktor_data t
    WHERE t.trx_month BETWEEN :period_start AND :period_end
      AND NULLIF(TRIM(t.site_id), '') IS NOT NULL
    GROUP BY 1
),
previous_performance AS (
    SELECT
        UPPER(TRIM(t.site_id)) AS site_key,
        SUM(COALESCE(t.rev, 0)) AS revenue,
        SUM(COALESCE(t.payload, 0)) AS payload
    FROM public.traktor_data t
    WHERE t.trx_month BETWEEN :comparison_start AND :comparison_end
      AND NULLIF(TRIM(t.site_id), '') IS NOT NULL
    GROUP BY 1
),
{availability_facts_ctes},
active_availability AS (
    SELECT
        s.site_key,
        SUM(COALESCE(s.total_time_minutes, 0)) AS total_time_minutes,
        SUM(COALESCE(s.outage_minutes, 0)) AS outage_minutes
    FROM availability_facts s
    WHERE s.period BETWEEN :period_start AND :period_end
    GROUP BY 1
),
previous_availability AS (
    SELECT
        s.site_key,
        SUM(COALESCE(s.total_time_minutes, 0)) AS previous_total_time_minutes,
        SUM(COALESCE(s.outage_minutes, 0)) AS previous_outage_minutes
    FROM availability_facts s
    WHERE s.period BETWEEN :comparison_start AND :comparison_end
    GROUP BY 1
),
facts AS (
    SELECT
        p.*,
        m.nop_key,
        m.kabupaten,
        COALESCE(UPPER(TRIM(m.kabupaten)), :unmapped_key) AS area_key,
        COALESCE(m.kabupaten, :unmapped_label) AS area_label,
        COALESCE(a.total_time_minutes, 0) AS total_time_minutes,
        COALESCE(a.outage_minutes, 0) AS outage_minutes
    FROM active_performance p
    LEFT JOIN master m ON m.site_key = p.site_key
    LEFT JOIN active_availability a ON a.site_key = p.site_key
    WHERE CAST(:nop_key AS text) IS NULL OR m.nop_key = :nop_key
),
previous_facts AS (
    SELECT
        COALESCE(UPPER(TRIM(m.kabupaten)), :unmapped_key) AS area_key,
        SUM(COALESCE(p.revenue, 0)) AS revenue,
        SUM(COALESCE(p.payload, 0)) AS payload,
        SUM(COALESCE(a.previous_total_time_minutes, 0)) AS previous_total_time_minutes,
        SUM(COALESCE(a.previous_outage_minutes, 0)) AS previous_outage_minutes
    FROM previous_performance p
    FULL OUTER JOIN previous_availability a ON a.site_key = p.site_key
    LEFT JOIN master m ON m.site_key = COALESCE(p.site_key, a.site_key)
    WHERE CAST(:nop_key AS text) IS NULL OR m.nop_key = :nop_key
    GROUP BY 1
),
area AS (
    SELECT
        area_key,
        MAX(area_label) AS kabupaten,
        BOOL_OR(area_key = :unmapped_key) AS is_unmapped,
        COUNT(DISTINCT site_key)::bigint AS total_sites,
        SUM(revenue)::bigint AS revenue,
        SUM(rev_voice)::bigint AS rev_voice,
        SUM(rev_bb)::bigint AS rev_bb,
        SUM(rev_dig)::bigint AS rev_dig,
        SUM(rev_sms)::bigint AS rev_sms,
        SUM(rev_ir)::bigint AS rev_ir,
        SUM(payload)::bigint AS payload,
        SUM(pld_2g)::bigint AS pld_2g,
        SUM(pld_3g)::bigint AS pld_3g,
        SUM(pld_4g)::bigint AS pld_4g,
        SUM(pld_5g)::bigint AS pld_5g,
        SUM(traffic)::bigint AS traffic,
        SUM(trf_2g)::bigint AS trf_2g,
        SUM(trf_3g)::bigint AS trf_3g,
        SUM(trf_4g)::bigint AS trf_4g,
        SUM(total_time_minutes)::double precision AS total_time_minutes,
        SUM(outage_minutes)::double precision AS outage_minutes
    FROM facts
    GROUP BY area_key
),
tickets AS (
    SELECT
        UPPER(TRIM(t.kabupaten_kota)) AS area_key,
        COUNT(*) FILTER (WHERE UPPER(TRIM(t.kategori_tt)) = 'BPS')::bigint AS ticket_swfm_bps,
        COUNT(*) FILTER (WHERE UPPER(TRIM(t.kategori_tt)) LIKE 'TS%')::bigint AS ticket_swfm_ts,
        COUNT(*) FILTER (
            WHERE UPPER(TRIM(t.kategori_tt)) = 'BPS'
              AND UPPER(TRIM(t.backup_sukses)) = 'BU GENSET'
        )::bigint AS backup_sukses_bps
    FROM public.ticketing_fault_center t
    WHERE t.created_at >= CAST(:start_date AS date)
      AND t.created_at < CAST(:end_date_exclusive AS date)
      AND (CAST(:nop_key AS text) IS NULL OR REGEXP_REPLACE(UPPER(TRIM(t.nop)), '^NOP[[:space:]]+', '') = :nop_key)
    GROUP BY 1
),
proker AS (
    SELECT
        UPPER(TRIM(p.kabupaten)) AS area_key,
        COUNT(*) FILTER (WHERE UPPER(TRIM(p.status)) = 'OPEN')::bigint AS proker_open,
        COUNT(*) FILTER (WHERE UPPER(TRIM(p.status)) IN ('CLOSE', 'CLOSED'))::bigint AS proker_closed
    FROM public.proker_enom_jatim_2026 p
    WHERE p.create_date >= CAST(:start_date AS date)
      AND p.create_date < CAST(:end_date_exclusive AS date)
      AND (CAST(:nop_key AS text) IS NULL OR REGEXP_REPLACE(UPPER(TRIM(p.nop)), '^NOP[[:space:]]+', '') = :nop_key)
    GROUP BY 1
)
SELECT
    a.*,
    COALESCE(bands.u30_sites, 0)::bigint AS u30_sites,
    COALESCE(bands.previous_u30_sites, 0)::bigint AS previous_u30_sites,
    COALESCE(bands.u60_sites, 0)::bigint AS u60_sites,
    COALESCE(bands.previous_u60_sites, 0)::bigint AS previous_u60_sites,
    previous.revenue AS previous_revenue,
    previous.payload AS previous_payload,
    COALESCE(previous.previous_total_time_minutes, 0)::double precision AS previous_total_time_minutes,
    COALESCE(previous.previous_outage_minutes, 0)::double precision AS previous_outage_minutes,
    COALESCE(t.ticket_swfm_bps, 0)::bigint AS ticket_swfm_bps,
    COALESCE(t.ticket_swfm_ts, 0)::bigint AS ticket_swfm_ts,
    COALESCE(t.backup_sukses_bps, 0)::bigint AS backup_sukses_bps,
    COALESCE(p.proker_open, 0)::bigint AS proker_open,
    COALESCE(p.proker_closed, 0)::bigint AS proker_closed
FROM area a
LEFT JOIN band_area bands ON bands.area_key = a.area_key
LEFT JOIN previous_facts previous ON previous.area_key = a.area_key
LEFT JOIN tickets t ON t.area_key = a.area_key
LEFT JOIN proker p ON p.area_key = a.area_key
ORDER BY a.revenue DESC, a.area_key
""".format(availability_facts_ctes=AVAILABILITY_FACTS_CTES)


def safe_share(
    selected: int | float | None,
    regional: int | float | None,
) -> float | None:
    if selected is None or regional is None or float(regional) == 0:
        return None
    return float(selected) / float(regional) * 100.0


def weighted_availability(
    total_minutes: int | float | None,
    outage_minutes: int | float | None,
) -> float | None:
    if total_minutes is None or float(total_minutes) <= 0:
        return None
    outage = float(outage_minutes or 0)
    return (float(total_minutes) - outage) / float(total_minutes) * 100.0


def availability_sla_status(value: float | None) -> str:
    if value is None:
        return "unavailable"
    return "met" if value >= AVAILABILITY_SLA else "missed"


def build_availability_contribution(
    *,
    selected_availability: float | None,
    regional_availability: float | None,
    selected_outage_minutes: int | float | None,
    regional_outage_minutes: int | float | None,
) -> ReportingContribution:
    difference = None
    if selected_availability is not None and regional_availability is not None:
        difference = float(selected_availability) - float(regional_availability)
    return ReportingContribution(
        regional_value=regional_availability,
        difference_pp=difference,
        contribution_pct=safe_share(selected_outage_minutes, regional_outage_minutes),
    )


def _delta_pct(current: int | float | None, previous: int | float | None) -> float | None:
    if current is None or previous is None or float(previous) == 0:
        return None
    return (float(current) - float(previous)) / float(previous) * 100.0


def _number(row: dict, key: str) -> float:
    return float(row.get(key) or 0)


def _availability_from(row: dict) -> float | None:
    return weighted_availability(
        row.get("total_time_minutes"),
        row.get("outage_minutes"),
    )


def _coverage_complete(coverage: list, required_sources: set[str]) -> bool:
    status_by_source = {
        str(item.get("source_key") if isinstance(item, dict) else item.source_key):
        str(item.get("status") if isinstance(item, dict) else item.status)
        for item in coverage
    }
    return all(status_by_source.get(source) == "complete" for source in required_sources)


def _risk_site_delta(trend: list) -> int | None:
    totals: list[int] = []
    for item in trend:
        u30 = item.get("u30_sites") if isinstance(item, dict) else item.u30_sites
        u60 = item.get("u60_sites") if isinstance(item, dict) else item.u60_sites
        if u30 is not None and u60 is not None:
            totals.append(int(u30) + int(u60))
    if len(totals) < 2:
        return None
    return totals[-1] - totals[-2]


def _continuing_availability_decline(trend: list) -> bool:
    values = []
    for item in trend[-3:]:
        value = item.get("avg_availability") if isinstance(item, dict) else item.avg_availability
        if value is not None:
            values.append(float(value))
    return len(values) == 3 and values[0] > values[1] > values[2]


def availability_insight_severity(value: float | None, trend: list) -> str:
    """Classify insight urgency without applying one global site-class SLA."""
    if value is None:
        return "unavailable"
    return "warning" if _continuing_availability_decline(trend) else "success"


def build_reporting_overview(
    *,
    selected: dict,
    regional: dict,
    previous: dict,
    target: RevenueTargetResult,
    scope_label: str,
    period_meta,
    coverage: list,
    trend: list,
    ytd: dict | None = None,
    thresholds=None,
    driver_rows: list[dict] | None = None,
) -> ReportingOverview:
    """Build the typed response from independently aggregated numeric facts."""
    selected_revenue = int(_number(selected, "revenue"))
    selected_payload = int(_number(selected, "payload"))
    previous_revenue = int(_number(previous, "revenue"))
    previous_payload = int(_number(previous, "payload"))
    regional_revenue = int(_number(regional, "revenue"))
    regional_payload = int(_number(regional, "payload"))
    selected_availability = _availability_from(selected)
    previous_availability = _availability_from(previous)
    regional_availability = _availability_from(regional)
    is_regional = scope_label == "Regional Jatim"
    ytd = ytd or {}
    driver_rows = driver_rows or []

    revenue_delta = selected_revenue - previous_revenue
    payload_delta = selected_payload - previous_payload
    availability_delta = (
        selected_availability - previous_availability
        if selected_availability is not None and previous_availability is not None
        else None
    )
    aggregate_outage_delta = (
        _number(selected, "outage_minutes") - _number(previous, "outage_minutes")
        if selected_availability is not None and previous_availability is not None
        else None
    )
    revenue_driver = select_additive_driver(
        driver_rows,
        metric="revenue",
        aggregate_delta=revenue_delta,
    )
    payload_driver = select_additive_driver(
        driver_rows,
        metric="payload",
        aggregate_delta=payload_delta,
    )
    availability_driver = select_availability_driver(
        driver_rows,
        aggregate_availability_delta=availability_delta,
        aggregate_outage_delta=aggregate_outage_delta,
    )
    directions = {
        "revenue": metric_direction(_delta_pct(selected_revenue, previous_revenue)),
        "payload": metric_direction(_delta_pct(selected_payload, previous_payload)),
        "availability": metric_direction(availability_delta),
    }

    revenue_contribution = 100.0 if is_regional and regional_revenue else safe_share(
        selected_revenue, regional_revenue
    )
    payload_contribution = 100.0 if is_regional and regional_payload else safe_share(
        selected_payload, regional_payload
    )
    if is_regional:
        availability_contribution = ReportingContribution()
    else:
        availability_contribution = build_availability_contribution(
            selected_availability=selected_availability,
            regional_availability=regional_availability,
            selected_outage_minutes=selected.get("outage_minutes"),
            regional_outage_minutes=regional.get("outage_minutes"),
        )

    target_gap = selected_revenue - target.target_revenue if target.complete else None
    target_attainment = safe_share(selected_revenue, target.target_revenue) if target.complete else None
    revenue_severity = "unavailable"
    if target.complete:
        revenue_severity = "success" if selected_revenue >= target.target_revenue else "warning"

    availability_severity = availability_insight_severity(selected_availability, trend)
    revenue_target_status = None
    if target.complete:
        revenue_target_status = "achieved" if selected_revenue >= target.target_revenue else "not_achieved"
    revenue_recommendation = build_metric_recommendation(
        "revenue",
        direction=directions["revenue"],
        driver=revenue_driver,
        comparison_available=_delta_pct(selected_revenue, previous_revenue) is not None,
        evidence_complete=_coverage_complete(
            coverage,
            {"traktor_data", "reporting_revenue_targets", "reporting_metric_thresholds"},
        ),
        target_status=revenue_target_status,
        related_directions=directions,
        risk_site_delta=_risk_site_delta(trend),
    )
    payload_recommendation = build_metric_recommendation(
        "payload",
        direction=directions["payload"],
        driver=payload_driver,
        comparison_available=_delta_pct(selected_payload, previous_payload) is not None,
        evidence_complete=_coverage_complete(
            coverage,
            {"traktor_data", "reporting_metric_thresholds"},
        ),
        related_directions=directions,
    )
    availability_recommendation = build_metric_recommendation(
        "availability",
        direction=directions["availability"],
        driver=availability_driver,
        comparison_available=availability_delta is not None,
        evidence_complete=_coverage_complete(
            coverage,
            {"site_month_metrics", "data_site_master", "reporting_metric_thresholds"},
        ),
        related_directions=directions,
    )

    return ReportingOverview(
        scope_label=scope_label,
        scorecards=ReportingOverviewScorecards(
            total_sites=int(selected.get("total_sites") or 0),
            epm_sites=int(selected.get("epm_sites") or 0),
            non_epm_sites=int(selected.get("non_epm_sites") or 0),
            total_revenue=selected_revenue,
            total_payload=selected_payload,
            revenue_ytd=int(ytd.get("revenue_ytd") or 0),
            payload_ytd=int(ytd.get("payload_ytd") or 0),
            avg_availability=selected_availability,
        ),
        revenue=ReportingRevenueFact(
            value=selected_revenue,
            previous_value=previous_revenue,
            delta_pct=_delta_pct(selected_revenue, previous_revenue),
            contribution=ReportingContribution(
                regional_value=regional_revenue,
                contribution_pct=revenue_contribution,
            ),
            target=ReportingTarget(
                target_revenue=target.target_revenue,
                selected_months=target.selected_months,
                configured_months=target.configured_months,
                missing_months=target.missing_months,
                complete=target.complete,
                gap=target_gap,
                attainment_pct=target_attainment,
            ),
            severity=revenue_severity,
            driver=revenue_driver,
            recommendation=revenue_recommendation,
        ),
        payload=ReportingMetricFact(
            value=selected_payload,
            previous_value=previous_payload,
            delta_pct=_delta_pct(selected_payload, previous_payload),
            contribution=ReportingContribution(
                regional_value=regional_payload,
                contribution_pct=payload_contribution,
            ),
            severity="info" if selected_payload or regional_payload else "unavailable",
            driver=payload_driver,
            recommendation=payload_recommendation,
        ),
        availability=ReportingMetricFact(
            value=selected_availability,
            previous_value=previous_availability,
            delta_pct=availability_delta,
            contribution=availability_contribution,
            severity=availability_severity,
            driver=availability_driver,
            recommendation=availability_recommendation,
        ),
        thresholds=thresholds,
        coverage=coverage,
        trend=trend,
        period_meta=period_meta,
    )


def _row_dicts(result) -> list[dict]:
    return [dict(row) for row in result.mappings().all()]


def _coverage_from_rows(rows: list[dict], active_months: tuple[str, ...]) -> list[ReportingSourceCoverage]:
    expected = list(active_months)
    coverage: list[ReportingSourceCoverage] = []
    for row in rows:
        source_key = str(row["source_key"])
        raw_available = row.get("available_periods") or []
        available = sorted({str(value) for value in raw_available if value})
        if not available and row.get("latest_data_period") in expected:
            available = [str(row["latest_data_period"])]
        source_expected = [] if source_key == "data_site_master" else expected
        missing = [month for month in source_expected if month not in available]
        if not source_expected:
            status = "complete" if int(row.get("record_count") or 0) > 0 else "missing"
        elif not missing:
            status = "complete"
        elif available:
            status = "partial"
        else:
            status = "missing"
        coverage.append(
            ReportingSourceCoverage(
                source_key=source_key,
                label=SOURCE_LABELS.get(source_key, source_key),
                expected_periods=source_expected,
                available_periods=available,
                missing_periods=missing,
                latest_data_period=row.get("latest_data_period"),
                record_count=int(row["record_count"]) if row.get("record_count") is not None else None,
                mapped_sites=int(row["mapped_sites"]) if row.get("mapped_sites") is not None else None,
                total_sites=int(row["total_sites"]) if row.get("total_sites") is not None else None,
                last_refreshed_at=row.get("last_refreshed_at"),
                status=status,
            )
        )
    return coverage


async def _run_overview_fact(session_factory, loader):
    async with session_factory() as fact_session:
        return await loader(fact_session)


async def load_reporting_overview(
    session,
    period,
    nop: str | None,
    *,
    session_factory=None,
) -> ReportingOverview:
    """Load selected, Regional, comparison, trend, target, and coverage facts."""
    nop_key = canonical_nop(nop)
    params = {
        "period_start": period.period_start,
        "period_end": period.period_end,
        "comparison_start": period.comparison_start,
        "comparison_end": period.comparison_end,
        "context_start": period.context_start,
        "availability_start": period.context_start,
        "availability_end": period.period_end,
        "start_date": period.start_date,
        "end_date_exclusive": period.end_date_exclusive,
        "nop_key": nop_key,
    }
    async def target_loader(fact_session):
        return await load_revenue_target(
            fact_session,
            nop=nop_key,
            period_start=period.period_start,
            period_end=period.period_end,
        )

    async def threshold_loader(fact_session):
        return await resolve_threshold_snapshot(fact_session, period.period_end)

    async def query_rows(fact_session, query, query_params):
        return _row_dicts(await fact_session.execute(text(query), query_params))

    ytd_params = {**params, "year_start": f"{period.period_end[:4]}-01"}
    driver_params = {**params, "availability_start": period.comparison_start}

    if session_factory is None:
        target = await target_loader(session)
        thresholds = await threshold_loader(session)
        scope_rows = await query_rows(session, SCOPE_AGGREGATES_QUERY, params)
        ytd_rows = await query_rows(session, OVERVIEW_YTD_QUERY, ytd_params)
        trend_rows = await query_rows(session, TREND_QUERY, params)
        driver_rows = await query_rows(session, SITE_DRIVER_CANDIDATES_QUERY, driver_params)
        coverage_rows = await query_rows(session, COVERAGE_QUERY, params)
    else:
        (
            target,
            thresholds,
            scope_rows,
            ytd_rows,
            trend_rows,
            driver_rows,
            coverage_rows,
        ) = await asyncio.gather(
            _run_overview_fact(session_factory, target_loader),
            _run_overview_fact(session_factory, threshold_loader),
            _run_overview_fact(
                session_factory,
                lambda fact_session: query_rows(fact_session, SCOPE_AGGREGATES_QUERY, params),
            ),
            _run_overview_fact(
                session_factory,
                lambda fact_session: query_rows(fact_session, OVERVIEW_YTD_QUERY, ytd_params),
            ),
            _run_overview_fact(
                session_factory,
                lambda fact_session: query_rows(fact_session, TREND_QUERY, params),
            ),
            _run_overview_fact(
                session_factory,
                lambda fact_session: query_rows(fact_session, SITE_DRIVER_CANDIDATES_QUERY, driver_params),
            ),
            _run_overview_fact(
                session_factory,
                lambda fact_session: query_rows(fact_session, COVERAGE_QUERY, params),
            ),
        )
    scopes = {str(row["scope"]): row for row in scope_rows}
    zero_scope = {
        "total_sites": 0,
        "epm_sites": 0,
        "non_epm_sites": 0,
        "revenue": 0,
        "payload": 0,
        "total_time_minutes": 0,
        "outage_minutes": 0,
    }
    ytd = ytd_rows[0] if ytd_rows else {"revenue_ytd": 0, "payload_ytd": 0}
    trend = [RevenueTrendItem(**row) for row in trend_rows]
    coverage = _coverage_from_rows(coverage_rows, period.active_months)
    period_meta = build_period_meta(
        period,
        {
            item.source_key: item.available_periods
            for item in coverage
            if item.expected_periods
        },
    )
    return build_reporting_overview(
        selected=scopes.get("selected", zero_scope),
        regional=scopes.get("regional", zero_scope),
        previous=scopes.get("previous", zero_scope),
        target=target,
        scope_label=nop_key or "Regional Jatim",
        period_meta=period_meta,
        coverage=coverage,
        trend=trend,
        ytd=ytd,
        thresholds=thresholds,
        driver_rows=driver_rows,
    )


async def load_reporting_areas(session, period, nop: str | None) -> list[ReportingAreaRow]:
    """Return area rows from the same normalized performance-site universe."""
    params = {
        "period_start": period.period_start,
        "period_end": period.period_end,
        "comparison_start": period.comparison_start,
        "comparison_end": period.comparison_end,
        "availability_start": period.comparison_start,
        "availability_end": period.period_end,
        "start_date": period.start_date,
        "end_date_exclusive": period.end_date_exclusive,
        "nop_key": canonical_nop(nop),
        "unmapped_key": UNMAPPED_AREA_KEY,
        "unmapped_label": UNMAPPED_AREA_LABEL,
    }
    rows = _row_dicts(await session.execute(text(AREA_AGGREGATES_QUERY), params))
    integer_fields = (
        "total_sites",
        "u30_sites",
        "previous_u30_sites",
        "u60_sites",
        "previous_u60_sites",
        "revenue",
        "previous_revenue",
        "rev_voice",
        "rev_bb",
        "rev_dig",
        "rev_sms",
        "rev_ir",
        "payload",
        "previous_payload",
        "pld_2g",
        "pld_3g",
        "pld_4g",
        "pld_5g",
        "traffic",
        "trf_2g",
        "trf_3g",
        "trf_4g",
        "ticket_swfm_bps",
        "ticket_swfm_ts",
        "backup_sukses_bps",
        "proker_open",
        "proker_closed",
    )
    response: list[ReportingAreaRow] = []
    for row in rows:
        values = {field: int(row.get(field) or 0) for field in integer_fields}
        availability = weighted_availability(
            row.get("total_time_minutes"), row.get("outage_minutes")
        )
        previous_availability = weighted_availability(
            row.get("previous_total_time_minutes"),
            row.get("previous_outage_minutes"),
        )
        response.append(
            ReportingAreaRow(
                area_key=str(row["area_key"]),
                kabupaten=str(row["kabupaten"]),
                is_unmapped=bool(row.get("is_unmapped")),
                **values,
                total_time_minutes=float(row.get("total_time_minutes") or 0),
                outage_minutes=float(row.get("outage_minutes") or 0),
                avg_availability=availability,
                previous_total_time_minutes=float(row.get("previous_total_time_minutes") or 0),
                previous_outage_minutes=float(row.get("previous_outage_minutes") or 0),
                previous_availability=previous_availability,
                availability_delta_pct=(
                    availability - previous_availability
                    if availability is not None and previous_availability is not None
                    else None
                ),
                sla_status=availability_sla_status(availability),
                backup_sukses_rate=safe_share(
                    row.get("backup_sukses_bps"), row.get("ticket_swfm_bps")
                ),
                u30_mom_pct=_delta_pct(row.get("u30_sites"), row.get("previous_u30_sites")),
                u60_mom_pct=_delta_pct(row.get("u60_sites"), row.get("previous_u60_sites")),
                revenue_delta_pct=_delta_pct(row.get("revenue"), row.get("previous_revenue")),
                payload_delta_pct=_delta_pct(row.get("payload"), row.get("previous_payload")),
            )
        )
    return response
