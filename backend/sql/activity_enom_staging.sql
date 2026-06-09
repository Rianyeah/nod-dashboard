CREATE TABLE IF NOT EXISTS public.proker_enom_jatim_2026_stage (
    batch_id TEXT NOT NULL CHECK (BTRIM(batch_id) <> ''),
    sheet_row_number INTEGER NOT NULL
        CHECK (sheet_row_number > 1 AND sheet_row_number < 100000),
    bulan SMALLINT NOT NULL CHECK (bulan BETWEEN 1 AND 12),
    baseline_activity TEXT,
    nop TEXT,
    site_id TEXT,
    site_name TEXT,
    part TEXT,
    activity TEXT,
    info TEXT,
    analisis TEXT,
    week_done INTEGER CHECK (week_done IS NULL OR week_done BETWEEN 1 AND 53),
    status TEXT CHECK (
        status IS NULL OR UPPER(status) IN ('OPEN', 'CLOSE')
    ),
    date_done DATE,
    remark_1 TEXT,
    remark_2 TEXT,
    milestone TEXT,
    xcek TEXT,
    workshop TEXT,
    target_workshop TEXT,
    source_row_hash TEXT NOT NULL,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (batch_id, sheet_row_number)
);

CREATE INDEX IF NOT EXISTS proker_enom_jatim_2026_stage_loaded_at_idx
ON public.proker_enom_jatim_2026_stage (loaded_at);

CREATE INDEX IF NOT EXISTS proker_enom_jatim_2026_stage_month_idx
ON public.proker_enom_jatim_2026_stage (bulan);

CREATE OR REPLACE FUNCTION public.replace_proker_enom_jatim_2026_month(
    p_batch_id TEXT,
    p_bulan SMALLINT,
    p_expected_rows INTEGER
)
RETURNS TABLE (
    result_batch_id TEXT,
    result_bulan SMALLINT,
    staged_rows BIGINT,
    deleted_rows BIGINT,
    inserted_rows BIGINT,
    completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_staged_rows BIGINT;
    v_deleted_rows BIGINT;
    v_inserted_rows BIGINT;
    v_other_month_rows BIGINT;
    v_invalid_rows BIGINT;
BEGIN
    IF p_batch_id IS NULL OR BTRIM(p_batch_id) = '' THEN
        RAISE EXCEPTION 'batch_id is required';
    END IF;

    IF p_bulan IS NULL OR p_bulan NOT BETWEEN 1 AND 12 THEN
        RAISE EXCEPTION 'bulan must be between 1 and 12';
    END IF;

    IF p_expected_rows IS NULL OR p_expected_rows <= 0 THEN
        RAISE EXCEPTION 'expected_rows must be greater than zero';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'proker_enom_jatim_2026:' || p_bulan::TEXT,
            0
        )
    );

    SELECT
        COUNT(*),
        COUNT(*) FILTER (
            WHERE site_id IS NULL
               OR BTRIM(site_id) = ''
               OR activity IS NULL
               OR BTRIM(activity) = ''
        )
    INTO v_staged_rows, v_invalid_rows
    FROM public.proker_enom_jatim_2026_stage
    WHERE batch_id = p_batch_id
      AND bulan = p_bulan;

    SELECT COUNT(*)
    INTO v_other_month_rows
    FROM public.proker_enom_jatim_2026_stage
    WHERE batch_id = p_batch_id
      AND bulan <> p_bulan;

    IF v_other_month_rows > 0 THEN
        RAISE EXCEPTION
            'Batch % contains % row(s) from another month',
            p_batch_id,
            v_other_month_rows;
    END IF;

    IF v_staged_rows <> p_expected_rows THEN
        RAISE EXCEPTION
            'Staged row count % does not match expected row count % for batch %',
            v_staged_rows,
            p_expected_rows,
            p_batch_id;
    END IF;

    IF v_invalid_rows > 0 THEN
        RAISE EXCEPTION
            'Batch % contains % row(s) without site_id or activity',
            p_batch_id,
            v_invalid_rows;
    END IF;

    DELETE FROM public.proker_enom_jatim_2026
    WHERE bulan = p_bulan;

    GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

    INSERT INTO public.proker_enom_jatim_2026 (
        source_row_number,
        unique_activity,
        bulan,
        baseline_activity,
        nop,
        site_id,
        site_name,
        part,
        activity,
        info,
        analisis,
        week_done,
        status,
        date_done,
        remark_1,
        remark_2,
        milestone,
        xcek,
        workshop,
        target_workshop,
        source_row_hash,
        imported_at,
        updated_at
    )
    SELECT
        (p_bulan::INTEGER * 100000) + stage.sheet_row_number,
        format(
            'enom-2026-%s-%s',
            LPAD(p_bulan::TEXT, 2, '0'),
            LPAD(stage.sheet_row_number::TEXT, 6, '0')
        ),
        stage.bulan,
        stage.baseline_activity,
        stage.nop,
        stage.site_id,
        stage.site_name,
        stage.part,
        stage.activity,
        stage.info,
        stage.analisis,
        stage.week_done,
        stage.status,
        stage.date_done,
        stage.remark_1,
        stage.remark_2,
        stage.milestone,
        stage.xcek,
        stage.workshop,
        stage.target_workshop,
        stage.source_row_hash,
        now(),
        now()
    FROM public.proker_enom_jatim_2026_stage AS stage
    WHERE stage.batch_id = p_batch_id
      AND stage.bulan = p_bulan
    ORDER BY stage.sheet_row_number;

    GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

    IF v_inserted_rows <> v_staged_rows THEN
        RAISE EXCEPTION
            'Inserted row count % does not match staged row count % for batch %',
            v_inserted_rows,
            v_staged_rows,
            p_batch_id;
    END IF;

    DELETE FROM public.proker_enom_jatim_2026_stage
    WHERE batch_id = p_batch_id;

    RETURN QUERY
    SELECT
        p_batch_id,
        p_bulan,
        v_staged_rows,
        v_deleted_rows,
        v_inserted_rows,
        now();
END;
$function$;
