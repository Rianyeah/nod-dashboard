CREATE TABLE IF NOT EXISTS public.reporting_revenue_targets (
    nop_key text NOT NULL,
    trx_month text NOT NULL CHECK (trx_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    target_revenue numeric(20, 0) NOT NULL CHECK (target_revenue >= 0),
    note text,
    updated_by text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (nop_key, trx_month)
);
-- statement-breakpoint
ALTER TABLE public.reporting_revenue_targets
ADD COLUMN IF NOT EXISTS updated_by text;
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reporting_revenue_targets_month
ON public.reporting_revenue_targets (trx_month);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS public.reporting_metric_thresholds (
    metric text NOT NULL CHECK (metric IN ('availability', 'revenue', 'payload')),
    threshold_key text NOT NULL,
    site_class text NOT NULL,
    effective_month text NOT NULL CHECK (effective_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    threshold_value numeric(20, 4) NOT NULL CHECK (threshold_value >= 0),
    unit text NOT NULL CHECK (unit IN ('percent', 'idr', 'tb')),
    updated_by text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (metric, threshold_key, site_class, effective_month),
    CHECK (
        (metric = 'availability' AND threshold_key = 'target'
            AND site_class IN ('DIAMOND', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE')
            AND unit = 'percent')
        OR (metric = 'revenue' AND threshold_key IN ('u30_upper', 'u60_upper')
            AND site_class = '*' AND unit = 'idr')
        OR (metric = 'payload' AND threshold_key = 'target'
            AND site_class = '*' AND unit = 'tb')
    )
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reporting_metric_thresholds_effective_month
ON public.reporting_metric_thresholds (effective_month);
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
        'reporting_revenue_targets',
        'reporting_metric_thresholds'
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
-- statement-breakpoint
WITH baseline AS (
    SELECT COALESCE(
        MIN(trx_month) FILTER (WHERE trx_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
        TO_CHAR(CURRENT_DATE, 'YYYY-MM')
    ) AS effective_month
    FROM public.traktor_data
), values_to_seed(metric, threshold_key, site_class, threshold_value, unit) AS (
    VALUES
        ('availability', 'target', 'DIAMOND', 99.87, 'percent'),
        ('availability', 'target', 'PLATINUM', 99.73, 'percent'),
        ('availability', 'target', 'GOLD', 99.68, 'percent'),
        ('availability', 'target', 'SILVER', 99.67, 'percent'),
        ('availability', 'target', 'BRONZE', 99.73, 'percent'),
        ('revenue', 'u30_upper', '*', 30000000, 'idr'),
        ('revenue', 'u60_upper', '*', 60000000, 'idr'),
        ('payload', 'target', '*', 15, 'tb')
)
INSERT INTO public.reporting_metric_thresholds (
    metric,
    threshold_key,
    site_class,
    effective_month,
    threshold_value,
    unit,
    updated_by
)
SELECT
    values_to_seed.metric,
    values_to_seed.threshold_key,
    values_to_seed.site_class,
    baseline.effective_month,
    values_to_seed.threshold_value,
    values_to_seed.unit,
    'system:migration'
FROM baseline
CROSS JOIN values_to_seed
ON CONFLICT (metric, threshold_key, site_class, effective_month) DO NOTHING;
