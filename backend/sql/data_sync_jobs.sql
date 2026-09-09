CREATE TABLE IF NOT EXISTS public.data_sync_jobs (
    id uuid PRIMARY KEY,
    dataset text NOT NULL CHECK (
        dataset IN ('impact_service', 'data_master', 'activity_enom')
    ),
    status text NOT NULL CHECK (
        status IN (
            'dispatching', 'running', 'dispatch_unknown',
            'succeeded', 'failed', 'timed_out', 'canceled'
        )
    ),
    requested_by_user_id text NOT NULL,
    requested_by_username text NOT NULL,
    requested_by_role text NOT NULL CHECK (
        requested_by_role IN ('viewer', 'data_admin', 'sysadmin')
    ),
    callback_token_hash text NOT NULL CHECK (
        char_length(callback_token_hash) = 64
    ),
    correlation_id uuid NOT NULL,
    protocol_version integer NOT NULL DEFAULT 1 CHECK (
        protocol_version = 1
    ),
    started_at timestamptz NOT NULL,
    dispatch_finished_at timestamptz,
    dispatch_outcome_code text CHECK (
        dispatch_outcome_code IS NULL OR dispatch_outcome_code IN (
            'accepted', 'rejected_4xx', 'timeout_unknown',
            'network_unknown', 'server_unknown', 'invalid_ack_unknown'
        )
    ),
    claimed_at timestamptz,
    callback_received_at timestamptz,
    n8n_execution_id text,
    canceled_at timestamptz,
    canceled_by_user_id text,
    finished_at timestamptz,
    rows_processed bigint CHECK (
        rows_processed IS NULL OR rows_processed >= 0
    ),
    result_code text CHECK (
        result_code IS NULL OR result_code IN (
            'completed', 'workflow_failed', 'source_validation_failed',
            'database_write_failed', 'trigger_rejected', 'timed_out',
            'dispatch_timed_out', 'workflow_timed_out', 'canceled'
        )
    ),
    cache_outcome_code text CHECK (
        cache_outcome_code IS NULL OR cache_outcome_code IN (
            'invalidated', 'unavailable', 'disabled'
        )
    ),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (status IN ('succeeded', 'failed', 'timed_out', 'canceled')) =
        (finished_at IS NOT NULL)
    )
);

ALTER TABLE public.data_sync_jobs
ADD COLUMN IF NOT EXISTS n8n_execution_id text;

ALTER TABLE public.data_sync_jobs
ADD COLUMN IF NOT EXISTS canceled_at timestamptz;

ALTER TABLE public.data_sync_jobs
ADD COLUMN IF NOT EXISTS canceled_by_user_id text;

ALTER TABLE public.data_sync_jobs
DROP CONSTRAINT IF EXISTS data_sync_jobs_status_check;

ALTER TABLE public.data_sync_jobs
ADD CONSTRAINT data_sync_jobs_status_check CHECK (
    status IN (
        'dispatching', 'running', 'dispatch_unknown',
        'succeeded', 'failed', 'timed_out', 'canceled'
    )
);

ALTER TABLE public.data_sync_jobs
DROP CONSTRAINT IF EXISTS data_sync_jobs_result_code_check;

ALTER TABLE public.data_sync_jobs
ADD CONSTRAINT data_sync_jobs_result_code_check CHECK (
    result_code IS NULL OR result_code IN (
        'completed', 'workflow_failed', 'source_validation_failed',
        'database_write_failed', 'trigger_rejected', 'timed_out',
        'dispatch_timed_out', 'workflow_timed_out', 'canceled'
    )
);

ALTER TABLE public.data_sync_jobs
DROP CONSTRAINT IF EXISTS data_sync_jobs_check;

ALTER TABLE public.data_sync_jobs
ADD CONSTRAINT data_sync_jobs_check CHECK (
    (status IN ('succeeded', 'failed', 'timed_out', 'canceled')) =
    (finished_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_data_sync_jobs_active_dataset
ON public.data_sync_jobs (dataset)
WHERE status IN ('dispatching', 'running', 'dispatch_unknown');

CREATE INDEX IF NOT EXISTS idx_data_sync_jobs_requester_started
ON public.data_sync_jobs (requested_by_user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_sync_jobs_dataset_started
ON public.data_sync_jobs (dataset, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_sync_jobs_active_started
ON public.data_sync_jobs (started_at)
WHERE status IN ('dispatching', 'running', 'dispatch_unknown');
