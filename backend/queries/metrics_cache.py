"""
SQL used to bootstrap and refresh the precomputed monthly site metrics cache.
"""

from queries.sql_queries import MONTH_MINUTES_EXPR


BOOTSTRAP_SITE_MONTH_METRICS_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS site_month_metrics (
        tahun INTEGER NOT NULL,
        bulan INTEGER NOT NULL,
        site_id TEXT NOT NULL,
        jumlah_cell INTEGER,
        total_outage_menit NUMERIC,
        total_time_in_minutes NUMERIC,
        avg_availability NUMERIC,
        rca_dominan TEXT,
        jumlah_hari_data INTEGER,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tahun, bulan, site_id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_availability_logs_period_site
    ON availability_logs_jatim ("Tahun", "Bulan", "SITE ID")
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_availability_logs_site_period_day
    ON availability_logs_jatim ("SITE ID", "Tahun", "Bulan", "Tgl")
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_data_site_master_siteid
    ON data_site_master ("Siteid")
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_data_site_master_nop
    ON data_site_master ("NOP")
    """,
]


REFRESH_SITE_MONTH_DELETE_QUERY = """
DELETE FROM site_month_metrics
WHERE tahun = :tahun AND bulan = :bulan
"""


REFRESH_SITE_MONTH_INSERT_QUERY = f"""
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
        , 4) AS avg_availability,
        COUNT(id_unique) AS jumlah_hari_data
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
)
INSERT INTO site_month_metrics (
    tahun,
    bulan,
    site_id,
    jumlah_cell,
    total_outage_menit,
    total_time_in_minutes,
    avg_availability,
    rca_dominan,
    jumlah_hari_data,
    updated_at
)
SELECT
    :tahun AS tahun,
    :bulan AS bulan,
    sr."SITE ID" AS site_id,
    sr.jumlah_cell::INTEGER,
    sr.total_outage_menit,
    sr.total_time_in_minutes,
    sr.avg_availability,
    COALESCE(
        rr.rca_label,
        CASE WHEN sr.total_outage_menit > 0 THEN 'unknown' ELSE 'safe' END
    ) AS rca_dominan,
    sr.jumlah_hari_data::INTEGER,
    NOW() AS updated_at
FROM site_raw sr
LEFT JOIN rca_ranked rr ON rr."SITE ID" = sr."SITE ID" AND rr.rn = 1
RETURNING site_id
"""
