"""Shared cache-first availability facts with a raw-log fallback."""


AVAILABILITY_FACTS_CTES = r'''
availability_cache_facts AS (
    SELECT
        CONCAT(s.tahun::text, '-', LPAD(s.bulan::text, 2, '0')) AS period,
        UPPER(TRIM(s.site_id)) AS site_key,
        SUM(COALESCE(s.total_time_in_minutes, 0))::double precision AS total_time_minutes,
        SUM(COALESCE(s.total_outage_menit, 0))::double precision AS outage_minutes
    FROM public.site_month_metrics s
    WHERE CONCAT(s.tahun::text, '-', LPAD(s.bulan::text, 2, '0'))
          BETWEEN :availability_start AND :availability_end
    GROUP BY 1, 2
),
availability_raw_facts AS (
    SELECT
        CONCAT(a."Tahun"::text, '-', LPAD(a."Bulan"::text, 2, '0')) AS period,
        UPPER(TRIM(a."SITE ID")) AS site_key,
        (
            MAX(COALESCE(a.jumlah_cell, 1))::numeric
            * EXTRACT(
                DAY FROM (
                    DATE_TRUNC('month', MAKE_DATE(a."Tahun"::int, a."Bulan"::int, 1))
                    + INTERVAL '1 month - 1 day'
                )
            )::numeric
            * 1440
        )::double precision AS total_time_minutes,
        SUM(COALESCE(NULLIF(a."outgage (menit)", ''), '0')::numeric)::double precision AS outage_minutes
    FROM public.availability_logs_jatim a
    WHERE CONCAT(a."Tahun"::text, '-', LPAD(a."Bulan"::text, 2, '0'))
          BETWEEN :availability_start AND :availability_end
      AND NULLIF(TRIM(a."SITE ID"), '') IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM public.site_month_metrics cached
          WHERE cached.tahun = a."Tahun"::int
            AND cached.bulan = a."Bulan"::int
            AND UPPER(TRIM(cached.site_id)) = UPPER(TRIM(a."SITE ID"))
      )
    GROUP BY a."Tahun", a."Bulan", UPPER(TRIM(a."SITE ID"))
),
availability_facts AS (
    SELECT period, site_key, total_time_minutes, outage_minutes
    FROM availability_cache_facts
    UNION ALL
    SELECT period, site_key, total_time_minutes, outage_minutes
    FROM availability_raw_facts
)
'''
