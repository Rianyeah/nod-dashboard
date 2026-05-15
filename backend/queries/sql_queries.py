"""
All SQL queries for the NOD backend.
Column names use quoted identifiers to match NeonDB schema exactly.
Type casting applied per NOD doc requirements.
"""

# Query 1 — Map Site Data (GeoJSON-ready)
MAP_SITES_QUERY = """
SELECT
    m."Siteid",
    m."Site Name",
    NULLIF(NULLIF(m."Latitude", '#N/A'), '')::FLOAT    AS latitude,
    NULLIF(NULLIF(m."Longitude", '#N/A'), '')::FLOAT   AS longitude,
    m."Kabupaten/KOTA"           AS kabupaten,
    m."Site Class",
    m."Status Site",
    m."NOP",
    m."New Cluster"              AS cluster,
    m."Type Site",
    ROUND(AVG(a.availability)::NUMERIC, 4) AS avg_availability,
    SUM(NULLIF(a."outgage (menit)", '')::NUMERIC) AS total_outage_menit
FROM data_site_master m
LEFT JOIN availability_logs_jatim a
    ON m."Siteid" = a."SITE ID"
    AND a."Bulan" = :bulan
    AND a."Tahun" = :tahun
WHERE NULLIF(NULLIF(m."Latitude", '#N/A'), '') IS NOT NULL
  AND NULLIF(NULLIF(m."Longitude", '#N/A'), '') IS NOT NULL
GROUP BY m."Siteid", m."Site Name", m."Latitude", m."Longitude",
         m."Kabupaten/KOTA", m."Site Class", m."Status Site",
         m."NOP", m."New Cluster", m."Type Site"
"""

# Query 2 — Summary Card Dashboard
SUMMARY_CARD_QUERY = """
SELECT
    COUNT(DISTINCT a."SITE ID")                          AS total_site_dengan_data,
    COUNT(DISTINCT m."Siteid")                           AS total_site_master,
    ROUND(AVG(a.availability)::NUMERIC, 4)               AS avg_availability,
    SUM(NULLIF(a."outgage (menit)", '')::NUMERIC)         AS total_outage_menit,
    COUNT(DISTINCT CASE WHEN AVG_s.avg_avail >= 99.5
          THEN a."SITE ID" END)                          AS site_excellent,
    COUNT(DISTINCT CASE WHEN AVG_s.avg_avail >= 95
          AND AVG_s.avg_avail < 99.5
          THEN a."SITE ID" END)                          AS site_degraded,
    COUNT(DISTINCT CASE WHEN AVG_s.avg_avail < 95
          THEN a."SITE ID" END)                          AS site_critical
FROM availability_logs_jatim a
JOIN data_site_master m ON m."Siteid" = a."SITE ID"
LEFT JOIN (
    SELECT "SITE ID", AVG(availability) AS avg_avail
    FROM availability_logs_jatim
    WHERE "Bulan" = :bulan AND "Tahun" = :tahun
    GROUP BY "SITE ID"
) AVG_s ON AVG_s."SITE ID" = a."SITE ID"
WHERE a."Bulan" = :bulan AND a."Tahun" = :tahun
"""

# Query 3 — Trend Availability 12 Bulan
TREND_AVAILABILITY_QUERY = """
SELECT
    "Bulan",
    "Tahun",
    ROUND(AVG(availability)::NUMERIC, 4) AS avg_availability,
    SUM(NULLIF("outgage (menit)", '')::NUMERIC) AS total_outage_menit
FROM availability_logs_jatim
WHERE "SITE ID" = :site_id
  AND "Tahun" IN (:tahun, :tahun_prev)
GROUP BY "Bulan", "Tahun"
ORDER BY "Tahun" ASC, "Bulan" ASC
LIMIT 12
"""

# Query 4 — Popup Data Detail Site (subquery to avoid GROUP BY m.* issue)
POPUP_DETAIL_QUERY = """
SELECT
    m.*,
    agg.avg_availability,
    agg.total_outage_menit,
    agg.jumlah_hari_data
FROM data_site_master m
LEFT JOIN (
    SELECT
        "SITE ID",
        ROUND(AVG(availability)::NUMERIC, 4)                 AS avg_availability,
        SUM(NULLIF("outgage (menit)", '')::NUMERIC)           AS total_outage_menit,
        COUNT(id_unique)                                      AS jumlah_hari_data
    FROM availability_logs_jatim
    WHERE "SITE ID" = :site_id AND "Bulan" = :bulan AND "Tahun" = :tahun
    GROUP BY "SITE ID"
) agg ON agg."SITE ID" = m."Siteid"
WHERE m."Siteid" = :site_id
"""

# Query — Availability by Kabupaten
AVAILABILITY_BY_KABUPATEN_QUERY = """
SELECT
    m."Kabupaten/KOTA"           AS kabupaten,
    COUNT(DISTINCT m."Siteid")   AS total_site,
    ROUND(AVG(a.availability)::NUMERIC, 4)   AS avg_availability,
    SUM(NULLIF(a."outgage (menit)", '')::NUMERIC) AS total_outage_menit
FROM data_site_master m
LEFT JOIN availability_logs_jatim a
    ON m."Siteid" = a."SITE ID"
    AND a."Bulan" = :bulan AND a."Tahun" = :tahun
WHERE m."Kabupaten/KOTA" IS NOT NULL
GROUP BY m."Kabupaten/KOTA"
ORDER BY avg_availability ASC
"""

# Query — Site Availability Detail
SITE_AVAILABILITY_QUERY = """
SELECT
    a."SITE ID"                  AS site_id,
    a."SITE NAME"                AS site_name,
    a."Bulan",
    a."Tahun",
    a."Tgl",
    a.availability,
    NULLIF(a."outgage (menit)", '')::NUMERIC AS outage_menit,
    NULLIF(a."outgage (jam)", '')::NUMERIC   AS outage_jam,
    a."CLASS",
    a."RCA"
FROM availability_logs_jatim a
WHERE a."SITE ID" = :site_id
  AND a."Bulan" = :bulan AND a."Tahun" = :tahun
ORDER BY a."Tgl" ASC
"""

# Query — Worst Sites
WORST_SITES_QUERY = """
SELECT
    a."SITE ID"                  AS site_id,
    m."Site Name"                AS site_name,
    m."Kabupaten/KOTA"           AS kabupaten,
    m."Site Class",
    ROUND(AVG(a.availability)::NUMERIC, 4) AS avg_availability,
    SUM(NULLIF(a."outgage (menit)", '')::NUMERIC) AS total_outage_menit
FROM availability_logs_jatim a
JOIN data_site_master m ON m."Siteid" = a."SITE ID"
WHERE a."Bulan" = :bulan AND a."Tahun" = :tahun
GROUP BY a."SITE ID", m."Site Name", m."Kabupaten/KOTA", m."Site Class"
ORDER BY avg_availability ASC
LIMIT :limit_val
"""

# Query — Sites list with filters
SITES_LIST_QUERY = """
SELECT
    m."Siteid",
    m."Site Name",
    m."Kabupaten/KOTA"           AS kabupaten,
    m."Site Class",
    m."Status Site",
    m."NOP",
    m."New Cluster"              AS cluster,
    m."Type Site",
    ROUND(AVG(a.availability)::NUMERIC, 4) AS avg_availability,
    SUM(NULLIF(a."outgage (menit)", '')::NUMERIC) AS total_outage_menit
FROM data_site_master m
LEFT JOIN availability_logs_jatim a
    ON m."Siteid" = a."SITE ID"
    AND a."Bulan" = :bulan AND a."Tahun" = :tahun
WHERE 1=1
{filters}
GROUP BY m."Siteid", m."Site Name", m."Kabupaten/KOTA", m."Site Class",
         m."Status Site", m."NOP", m."New Cluster", m."Type Site"
ORDER BY m."Siteid"
LIMIT :limit_val OFFSET :offset_val
"""

# Query — Sites count (for pagination)
SITES_COUNT_QUERY = """
SELECT COUNT(DISTINCT m."Siteid") AS total
FROM data_site_master m
WHERE 1=1
{filters}
"""

# Query — Search sites
SITES_SEARCH_QUERY = """
SELECT
    m."Siteid",
    m."Site Name",
    m."Kabupaten/KOTA"           AS kabupaten,
    m."Site Class",
    m."Status Site"
FROM data_site_master m
WHERE m."Siteid" ILIKE :q OR m."Site Name" ILIKE :q
ORDER BY m."Siteid"
LIMIT 20
"""

# Query — Filter options
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

# Query — Full site detail (all 55+ columns)
SITE_FULL_DETAIL_QUERY = """
SELECT m.*
FROM data_site_master m
WHERE m."Siteid" = :site_id
"""
