-- Supporting indexes for contiguous dashboard month-range filters.
-- Safe to run repeatedly; no data migration is performed.

CREATE INDEX IF NOT EXISTS idx_traktor_data_trx_month_site
    ON public.traktor_data (trx_month, site_id);

CREATE INDEX IF NOT EXISTS idx_site_month_metrics_period_site
    ON public.site_month_metrics (tahun, bulan, site_id);

CREATE INDEX IF NOT EXISTS idx_ticketing_fault_center_created_at_nop
    ON public.ticketing_fault_center (created_at, nop);

CREATE INDEX IF NOT EXISTS idx_proker_enom_create_date_nop
    ON public.proker_enom_jatim_2026 (create_date, nop);
