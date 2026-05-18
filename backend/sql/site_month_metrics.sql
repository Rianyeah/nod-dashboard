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
);

CREATE INDEX IF NOT EXISTS idx_availability_logs_period_site
ON availability_logs_jatim ("Tahun", "Bulan", "SITE ID");

CREATE INDEX IF NOT EXISTS idx_availability_logs_site_period_day
ON availability_logs_jatim ("SITE ID", "Tahun", "Bulan", "Tgl");

CREATE INDEX IF NOT EXISTS idx_data_site_master_siteid
ON data_site_master ("Siteid");

CREATE INDEX IF NOT EXISTS idx_data_site_master_nop
ON data_site_master ("NOP");
