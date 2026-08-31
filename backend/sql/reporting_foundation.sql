CREATE TABLE IF NOT EXISTS public.reporting_revenue_targets (
    nop_key text NOT NULL,
    trx_month text NOT NULL CHECK (trx_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    target_revenue numeric(20, 0) NOT NULL CHECK (target_revenue >= 0),
    note text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (nop_key, trx_month)
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reporting_revenue_targets_month
ON public.reporting_revenue_targets (trx_month);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS public.reporting_source_refresh (
    source_key text PRIMARY KEY,
    last_refreshed_at timestamptz,
    last_operation text,
    updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE OR REPLACE FUNCTION public.touch_reporting_source_refresh()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.reporting_source_refresh (
        source_key,
        last_refreshed_at,
        last_operation,
        updated_at
    )
    VALUES (TG_ARGV[0], clock_timestamp(), TG_OP, clock_timestamp())
    ON CONFLICT (source_key) DO UPDATE
    SET last_refreshed_at = EXCLUDED.last_refreshed_at,
        last_operation = EXCLUDED.last_operation,
        updated_at = EXCLUDED.updated_at;
    RETURN NULL;
END;
$$;
-- statement-breakpoint
DO $$
DECLARE
    source_table text;
BEGIN
    FOREACH source_table IN ARRAY ARRAY[
        'traktor_data',
        'site_month_metrics',
        'availability_logs_jatim',
        'data_site_master',
        'ticketing_fault_center',
        'proker_enom_jatim_2026',
        'reporting_revenue_targets'
    ]
    LOOP
        IF to_regclass('public.' || source_table) IS NULL THEN
            CONTINUE;
        END IF;

        EXECUTE format(
            'DROP TRIGGER IF EXISTS reporting_refresh_tracker ON public.%I',
            source_table
        );
        EXECUTE format(
            'CREATE TRIGGER reporting_refresh_tracker '
            'AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I '
            'FOR EACH STATEMENT EXECUTE FUNCTION '
            'public.touch_reporting_source_refresh(%L)',
            source_table,
            source_table
        );
    END LOOP;
END;
$$;
-- statement-breakpoint
INSERT INTO public.reporting_revenue_targets (
    nop_key,
    trx_month,
    target_revenue,
    note
)
SELECT
    'SIDOARJO',
    available.trx_month,
    90000000000,
    'Migrasi target awal Network Reporting'
FROM (
    SELECT DISTINCT trx_month
    FROM public.traktor_data
    WHERE trx_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
) AS available
ON CONFLICT (nop_key, trx_month) DO NOTHING;
