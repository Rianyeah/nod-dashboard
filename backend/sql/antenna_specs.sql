-- Antenna specification table
-- Stores scraped antenna specs keyed by canonical model name.
-- JSONB columns hold per-band values keyed by frequency MHz (e.g. {"900": 17.5, "1800": 18.0}).
-- Follows the idempotent CREATE TABLE IF NOT EXISTS convention used in backend/sql/.

CREATE TABLE IF NOT EXISTS antenna_specs (
    id SERIAL PRIMARY KEY,
    antenna_model VARCHAR(100) NOT NULL UNIQUE,
    vendor VARCHAR(50),
    series VARCHAR(20),
    antenna_type_enum VARCHAR(20),
    frequency_low_mhz INTEGER,
    frequency_high_mhz INTEGER,
    frequency_bands TEXT,
    gain_dbi_by_band JSONB,
    vertical_beamwidth_by_band JSONB,
    horizontal_beamwidth REAL,
    electrical_tilt_min REAL,
    electrical_tilt_max REAL,
    ports INTEGER,
    ftb_ratio_db REAL,
    impedance_ohm REAL DEFAULT 50,
    vswr REAL,
    weight_kg REAL,
    height_mm REAL,
    width_mm REAL,
    depth_mm REAL,
    connector_type VARCHAR(50),
    source_url TEXT,
    scraped_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_antenna_specs_model ON antenna_specs(antenna_model);
CREATE INDEX IF NOT EXISTS idx_antenna_specs_vendor ON antenna_specs(vendor);
