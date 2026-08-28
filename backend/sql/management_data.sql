CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('viewer', 'data_admin', 'sysadmin')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    session_version INTEGER NOT NULL DEFAULT 1 CHECK (session_version > 0),
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_lower_uq
    ON app_users (LOWER(username));

CREATE TABLE IF NOT EXISTS data_import_jobs (
    id UUID PRIMARY KEY,
    target TEXT NOT NULL CHECK (target IN ('ticketing_swfm_non_inap', 'ticketing_fault_center')),
    strategy TEXT NOT NULL CHECK (strategy IN ('upsert', 'replace_period')),
    status TEXT NOT NULL CHECK (status IN ('validated', 'committing', 'completed', 'failed', 'cancelled')),
    actor_username TEXT NOT NULL,
    file_count INTEGER NOT NULL DEFAULT 0 CHECK (file_count >= 0),
    source_rows INTEGER NOT NULL DEFAULT 0 CHECK (source_rows >= 0),
    valid_rows INTEGER NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
    invalid_rows INTEGER NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
    inserted_rows INTEGER NOT NULL DEFAULT 0 CHECK (inserted_rows >= 0),
    updated_rows INTEGER NOT NULL DEFAULT 0 CHECK (updated_rows >= 0),
    unchanged_rows INTEGER NOT NULL DEFAULT 0 CHECK (unchanged_rows >= 0),
    warnings JSONB NOT NULL DEFAULT '[]'::JSONB,
    errors JSONB NOT NULL DEFAULT '[]'::JSONB,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    committed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS data_import_jobs_created_at_idx
    ON data_import_jobs (created_at DESC);

CREATE TABLE IF NOT EXISTS data_import_job_rows (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES data_import_jobs(id) ON DELETE CASCADE,
    source_file TEXT NOT NULL,
    source_row INTEGER NOT NULL CHECK (source_row > 0),
    row_key TEXT,
    change_kind TEXT NOT NULL CHECK (change_kind IN ('insert', 'update', 'unchanged', 'invalid')),
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    validation_errors JSONB NOT NULL DEFAULT '[]'::JSONB
);

CREATE INDEX IF NOT EXISTS data_import_job_rows_job_id_idx
    ON data_import_job_rows (job_id, id);

CREATE TABLE IF NOT EXISTS ticketing_pic_aliases (
    id UUID PRIMARY KEY,
    alias_key TEXT NOT NULL UNIQUE,
    alias_display TEXT NOT NULL,
    canonical_pic TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticketing_swfm_non_inap (
    ticket_number TEXT PRIMARY KEY,
    ticket_type TEXT NOT NULL CHECK (ticket_type IN ('PMS', 'PMG', 'FNA', 'BBM')),
    ticket_date DATE,
    status TEXT,
    site_id TEXT,
    site_name TEXT,
    nop TEXT,
    regional TEXT,
    cluster TEXT,
    kabupaten TEXT,
    pic_takeover_raw TEXT,
    pic_takeover_key TEXT,
    source_file TEXT NOT NULL,
    source_row INTEGER NOT NULL CHECK (source_row > 0),
    source_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    source_hash TEXT NOT NULL,
    import_job_id UUID REFERENCES data_import_jobs(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ticketing_swfm_non_inap
    ADD COLUMN IF NOT EXISTS cluster TEXT;

ALTER TABLE ticketing_swfm_non_inap
    ADD COLUMN IF NOT EXISTS kabupaten TEXT;

CREATE INDEX IF NOT EXISTS ticketing_swfm_non_inap_date_idx
    ON ticketing_swfm_non_inap (ticket_date);

CREATE INDEX IF NOT EXISTS ticketing_swfm_non_inap_pic_idx
    ON ticketing_swfm_non_inap (pic_takeover_key);

CREATE INDEX IF NOT EXISTS ticketing_swfm_non_inap_type_idx
    ON ticketing_swfm_non_inap (ticket_type);
