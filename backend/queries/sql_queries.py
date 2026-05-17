"""
All SQL queries for the NOD backend.
Column names use quoted identifiers to match NeonDB schema exactly.
Type casting applied per NOD doc requirements.
"""

MONTH_MINUTES_EXPR = """
(
    EXTRACT(
        DAY FROM (
            DATE_TRUNC('month', MAKE_DATE(:tahun, :bulan, 1)) + INTERVAL '1 month - 1 day'
        )
    )::NUMERIC * 1440
)
""".strip()

TREND_MONTH_MINUTES_EXPR = """
(
    EXTRACT(
        DAY FROM (
            DATE_TRUNC('month', MAKE_DATE("Tahun"::INT, "Bulan"::INT, 1)) + INTERVAL '1 month - 1 day'
        )
    )::NUMERIC * 1440
)
""".strip()

SITE_MONTH_AGG_CTE = f"""
WITH site_raw AS (
    SELECT
        "SITE ID",
        MAX(COALESCE(jumlah_cell, 1)) AS jumlah_cell,
        SUM(COALESCE(NULLIF("outgage (menit)", ''), '0')::NUMERIC) AS total_outage_menit,
        MAX(COALESCE(jumlah_cell, 1))::NUMERIC * {MONTH_MINUTES_EXPR} AS total_time_in_minutes,
        ROUND(
            (
                (MAX(COALESCE(jumlah_cell, 1))::NUMERIC * {MONTH_MINUTES_EXPR})
                - SUM(COALESCE(NULLIF("outgage (menit)", ''), '0')::NUMERIC)
            ) / NULLIF(MAX(COALESCE(jumlah_cell, 1))::NUMERIC * {MONTH_MINUTES_EXPR}, 0) * 100.0
        , 4) AS avg_availability
    FROM availability_logs_jatim
    WHERE "Bulan" = :bulan AND "Tahun" = :tahun
    GROUP BY "SITE ID"
),
rca_weights AS (
    SELECT
        "SITE ID",
        CASE
            WHEN LOWER(COALESCE(NULLIF("RCA", ''), 'unknown')) IN ('safe', 'save') THEN 'safe'
            ELSE COALESCE(NULLIF("RCA", ''), 'unknown')
        END AS rca_label,
        SUM(COALESCE(NULLIF("outgage (menit)", ''), '0')::NUMERIC) AS rca_weight
    FROM availability_logs_jatim
    WHERE "Bulan" = :bulan AND "Tahun" = :tahun
    GROUP BY "SITE ID", rca_label
),
rca_ranked AS (
    SELECT
        rw."SITE ID",
        rw.rca_label,
        ROW_NUMBER() OVER (
            PARTITION BY rw."SITE ID"
            ORDER BY rw.rca_weight DESC, rw.rca_label ASC
        ) AS rn
    FROM rca_weights rw
    JOIN site_raw sr ON sr."SITE ID" = rw."SITE ID"
    WHERE NOT (sr.total_outage_menit > 0 AND rw.rca_label = 'safe')
),
site_month AS (
    SELECT
        sr."SITE ID",
        sr.jumlah_cell,
        sr.total_outage_menit,
        sr.total_time_in_minutes,
        sr.avg_availability,
        COALESCE(
            rr.rca_label,
            CASE WHEN sr.total_outage_menit > 0 THEN 'unknown' ELSE 'safe' END
        ) AS rca_dominan
    FROM site_raw sr
    LEFT JOIN rca_ranked rr ON rr."SITE ID" = sr."SITE ID" AND rr.rn = 1
)
""".strip()

# Query - Latest available availability period
LATEST_PERIOD_QUERY = """
SELECT
    "Tahun"::INT AS tahun,
    "Bulan"::INT AS bulan,
    COUNT(*)::INT AS row_count,
    COUNT(DISTINCT "SITE ID")::INT AS site_count
FROM availability_logs_jatim
WHERE "Tahun" IS NOT NULL AND "Bulan" IS NOT NULL
GROUP BY "Tahun", "Bulan"
ORDER BY "Tahun" DESC, "Bulan" DESC
LIMIT 1
"""

# Query 1 - Map Site Data (GeoJSON-ready)
MAP_SITES_QUERY = f"""
{SITE_MONTH_AGG_CTE}
SELECT
    m."Siteid",
    m."Site Name",
    NULLIF(NULLIF(m."Latitude", '#N/A'), '')::FLOAT AS latitude,
    NULLIF(NULLIF(m."Longitude", '#N/A'), '')::FLOAT AS longitude,
    m."Kabupaten/KOTA" AS kabupaten,
    m."Site Class",
    m."Status Site",
    m."NOP",
    m."New Cluster" AS cluster,
    m."Type Site",
    agg.avg_availability,
    agg.total_outage_menit,
    agg.jumlah_cell,
    agg.rca_dominan
FROM data_site_master m
LEFT JOIN site_month agg ON agg."SITE ID" = m."Siteid"
WHERE NULLIF(NULLIF(m."Latitude", '#N/A'), '') IS NOT NULL
  AND NULLIF(NULLIF(m."Longitude", '#N/A'), '') IS NOT NULL
"""

# Query 2 - Summary Card Dashboard
SUMMARY_CARD_QUERY = f"""
{SITE_MONTH_AGG_CTE}
SELECT
    COUNT(DISTINCT agg."SITE ID") AS total_site_dengan_data,
    COUNT(DISTINCT m."Siteid") AS total_site_master,
    ROUND(
        (
            SUM(agg.total_time_in_minutes)
            - SUM(agg.total_outage_menit)
        ) / NULLIF(SUM(agg.total_time_in_minutes), 0) * 100.0
    , 4) AS avg_availability,
    SUM(agg.total_outage_menit) AS total_outage_menit,
    SUM(agg.jumlah_cell) AS total_cell,
    COUNT(DISTINCT CASE
        WHEN agg.avg_availability >= 99.5 THEN agg."SITE ID"
    END) AS site_excellent,
    COUNT(DISTINCT CASE
        WHEN agg.avg_availability >= 95 AND agg.avg_availability < 99.5 THEN agg."SITE ID"
    END) AS site_degraded,
    COUNT(DISTINCT CASE
        WHEN agg.avg_availability < 95 THEN agg."SITE ID"
    END) AS site_critical
FROM data_site_master m
LEFT JOIN site_month agg ON agg."SITE ID" = m."Siteid"
WHERE 1=1
{{filters}}
"""

# Query 3 - Trend Availability 12 Bulan ending at selected month
TREND_AVAILABILITY_QUERY = f"""
SELECT
    "Bulan",
    "Tahun",
    avg_availability,
    total_outage_menit
FROM (
    SELECT
        "Bulan",
        "Tahun",
        ROUND(
            (
                (MAX(COALESCE(jumlah_cell, 1))::NUMERIC * {TREND_MONTH_MINUTES_EXPR})
                - SUM(COALESCE(NULLIF("outgage (menit)", ''), '0')::NUMERIC)
            ) / NULLIF(MAX(COALESCE(jumlah_cell, 1))::NUMERIC * {TREND_MONTH_MINUTES_EXPR}, 0) * 100.0
        , 4) AS avg_availability,
        SUM(COALESCE(NULLIF("outgage (menit)", ''), '0')::NUMERIC) AS total_outage_menit
    FROM availability_logs_jatim
    WHERE "SITE ID" = :site_id
      AND ("Tahun"::INT < :tahun OR ("Tahun"::INT = :tahun AND "Bulan"::INT <= :bulan))
    GROUP BY "Bulan", "Tahun"
    ORDER BY "Tahun"::INT DESC, "Bulan"::INT DESC
    LIMIT 12
) trend_window
ORDER BY "Tahun" ASC, "Bulan" ASC
"""

# Query 4 - Popup Data Detail Site
POPUP_DETAIL_QUERY = f"""
SELECT
    m.*,
    agg.avg_availability,
    agg.total_outage_menit,
    agg.jumlah_hari_data,
    agg.jumlah_cell,
    agg.rca_dominan
FROM data_site_master m
LEFT JOIN (
    WITH site_raw AS (
        SELECT
            "SITE ID",
            MAX(COALESCE(jumlah_cell, 1)) AS jumlah_cell,
            SUM(COALESCE(NULLIF("outgage (menit)", ''), '0')::NUMERIC) AS total_outage_menit,
            ROUND(
                (
                    (MAX(COALESCE(jumlah_cell, 1))::NUMERIC * {MONTH_MINUTES_EXPR})
                    - SUM(COALESCE(NULLIF("outgage (menit)", ''), '0')::NUMERIC)
                ) / NULLIF(MAX(COALESCE(jumlah_cell, 1))::NUMERIC * {MONTH_MINUTES_EXPR}, 0) * 100.0
            , 4) AS avg_availability,
            COUNT(id_unique) AS jumlah_hari_data
        FROM availability_logs_jatim
        WHERE "SITE ID" = :site_id AND "Bulan" = :bulan AND "Tahun" = :tahun
        GROUP BY "SITE ID"
    ),
    rca_weights AS (
        SELECT
            "SITE ID",
            CASE
                WHEN LOWER(COALESCE(NULLIF("RCA", ''), 'unknown')) IN ('safe', 'save') THEN 'safe'
                ELSE COALESCE(NULLIF("RCA", ''), 'unknown')
            END AS rca_label,
            SUM(COALESCE(NULLIF("outgage (menit)", ''), '0')::NUMERIC) AS rca_weight
        FROM availability_logs_jatim
        WHERE "SITE ID" = :site_id AND "Bulan" = :bulan AND "Tahun" = :tahun
        GROUP BY "SITE ID", rca_label
    ),
    rca_ranked AS (
        SELECT
            rw."SITE ID",
            rw.rca_label,
            ROW_NUMBER() OVER (
                PARTITION BY rw."SITE ID"
                ORDER BY rw.rca_weight DESC, rw.rca_label ASC
            ) AS rn
        FROM rca_weights rw
        JOIN site_raw sr ON sr."SITE ID" = rw."SITE ID"
        WHERE NOT (sr.total_outage_menit > 0 AND rw.rca_label = 'safe')
    )
    SELECT
        sr."SITE ID",
        sr.jumlah_cell,
        sr.total_outage_menit,
        sr.avg_availability,
        sr.jumlah_hari_data,
        COALESCE(
            rr.rca_label,
            CASE WHEN sr.total_outage_menit > 0 THEN 'unknown' ELSE 'safe' END
        ) AS rca_dominan
    FROM site_raw sr
    LEFT JOIN rca_ranked rr ON rr."SITE ID" = sr."SITE ID" AND rr.rn = 1
) agg ON agg."SITE ID" = m."Siteid"
WHERE m."Siteid" = :site_id
"""

# Query - Availability by Kabupaten
AVAILABILITY_BY_KABUPATEN_QUERY = f"""
{SITE_MONTH_AGG_CTE}
SELECT
    m."Kabupaten/KOTA" AS kabupaten,
    COUNT(DISTINCT m."Siteid") AS total_site,
    ROUND(
        (
            SUM(agg.total_time_in_minutes)
            - SUM(agg.total_outage_menit)
        ) / NULLIF(SUM(agg.total_time_in_minutes), 0) * 100.0
    , 4) AS avg_availability,
    SUM(agg.total_outage_menit) AS total_outage_menit
FROM data_site_master m
LEFT JOIN site_month agg ON agg."SITE ID" = m."Siteid"
WHERE m."Kabupaten/KOTA" IS NOT NULL
GROUP BY m."Kabupaten/KOTA"
ORDER BY avg_availability ASC
"""

# Query - Site Availability Detail
SITE_AVAILABILITY_QUERY = """
SELECT
    a."SITE ID" AS site_id,
    a."SITE NAME" AS site_name,
    a."Bulan",
    a."Tahun",
    a."Tgl",
    a.availability,
    NULLIF(a."outgage (menit)", '')::NUMERIC AS outage_menit,
    NULLIF(a."outgage (jam)", '')::NUMERIC AS outage_jam,
    a."CLASS",
    a."RCA"
FROM availability_logs_jatim a
WHERE a."SITE ID" = :site_id
  AND a."Bulan" = :bulan AND a."Tahun" = :tahun
ORDER BY a."Tgl" ASC
"""

# Query - Worst Sites
WORST_SITES_QUERY = f"""
{SITE_MONTH_AGG_CTE}
SELECT
    agg."SITE ID" AS site_id,
    m."Site Name" AS site_name,
    m."Kabupaten/KOTA" AS kabupaten,
    m."Site Class",
    agg.avg_availability,
    agg.total_outage_menit,
    agg.jumlah_cell
FROM site_month agg
JOIN data_site_master m ON m."Siteid" = agg."SITE ID"
ORDER BY avg_availability ASC
LIMIT :limit_val
"""

# Query - Sites list with filters
SITES_LIST_QUERY = f"""
{SITE_MONTH_AGG_CTE}
SELECT
    m."Siteid",
    m."Site Name",
    m."Kabupaten/KOTA" AS kabupaten,
    m."Site Class",
    m."Status Site",
    m."NOP",
    m."New Cluster" AS cluster,
    m."Type Site",
    agg.avg_availability,
    agg.total_outage_menit,
    agg.jumlah_cell,
    agg.rca_dominan
FROM data_site_master m
LEFT JOIN site_month agg ON agg."SITE ID" = m."Siteid"
WHERE 1=1
{{filters}}
{{search_filter}}
ORDER BY m."Siteid"
LIMIT :limit_val OFFSET :offset_val
"""

# Query - Sites count (for pagination)
SITES_COUNT_QUERY = """
SELECT COUNT(DISTINCT m."Siteid") AS total
FROM data_site_master m
WHERE 1=1
{filters}
{search_filter}
"""

# Query - Search sites
SITES_SEARCH_QUERY = """
SELECT
    m."Siteid",
    m."Site Name",
    m."Kabupaten/KOTA" AS kabupaten,
    m."Site Class",
    m."Status Site"
FROM data_site_master m
WHERE m."Siteid" ILIKE :q
   OR m."Site Name" ILIKE :q
   OR m."Kabupaten/KOTA" ILIKE :q
ORDER BY m."Siteid"
LIMIT 20
"""

# Query - Filter options
FILTER_OPTIONS_QUERY_KABUPATEN = """
SELECT DISTINCT m."Kabupaten/KOTA" AS value
FROM data_site_master m
WHERE m."Kabupaten/KOTA" IS NOT NULL AND m."Kabupaten/KOTA" != ''
ORDER BY value
"""

FILTER_OPTIONS_QUERY_CLUSTER = """
SELECT DISTINCT m."New Cluster" AS value
FROM data_site_master m
WHERE m."New Cluster" IS NOT NULL AND m."New Cluster" != ''
ORDER BY value
"""

FILTER_OPTIONS_QUERY_KELAS = """
SELECT DISTINCT m."Site Class" AS value
FROM data_site_master m
WHERE m."Site Class" IS NOT NULL AND m."Site Class" != ''
ORDER BY value
"""

FILTER_OPTIONS_QUERY_NOP = """
SELECT DISTINCT m."NOP" AS value
FROM data_site_master m
WHERE m."NOP" IS NOT NULL AND m."NOP" != ''
ORDER BY value
"""

# Query - Full site detail (all 55+ columns)
SITE_FULL_DETAIL_QUERY = """
SELECT m.*
FROM data_site_master m
WHERE m."Siteid" = :site_id
"""
