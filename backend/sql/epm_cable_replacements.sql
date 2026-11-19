-- Apply after epm.sql on every EPM database.
ALTER TABLE public.epm_routes
    ADD COLUMN IF NOT EXISTS cable_replacements jsonb NOT NULL DEFAULT '[]'::jsonb;
