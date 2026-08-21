import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Layers3,
  RefreshCcw,
  RotateCcw,
  ShieldAlert,
  TicketCheck,
} from 'lucide-react';

import Breadcrumb from '../components/Breadcrumb';
import {
  DashboardCombobox,
  DashboardDateRangePicker,
  DashboardFilterBar,
  DashboardFilterChips,
  DashboardFilterPopover,
  DashboardFilterSelect,
  DashboardMonthRangePicker,
} from '../components/dashboard-filters/DashboardFilters';
import TicketingSectionNav from '../components/TicketingSectionNav';
import { DASHBOARD_CHART_COLORS } from '../components/dashboard-charts/dashboardChartUtils';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { DashboardKpiCard } from '../components/ui/DashboardPrimitives';
import { Skeleton } from '../components/ui/skeleton';
import TicketTotiCharts from '../features/ticket-toti/TicketTotiCharts';
import TicketTotiTable from '../features/ticket-toti/TicketTotiTable';
import {
  formatPeriodComparison,
  formatRankSubtitle,
  formatShareSubtitle,
  formatTotiDateTime,
} from '../features/ticket-toti/ticketTotiUtils';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
  fetchTicketTotiDashboard,
  fetchTicketTotiFilters,
  fetchTicketTotiTickets,
} from '../services/api';
import { formatNumber } from '../utils/formatters';

const TABLE_LIMIT = 15;
const EMPTY_ADVANCED_FILTERS = {
  cluster: '',
  mitra: '',
  kategori: '',
  status: '',
};

const EMPTY_FILTER_OPTIONS = {
  default_start_date: '',
  default_end_date: '',
  available_months: [],
  nops: [],
  clusters: [],
  mitras: [],
  categories: [],
  statuses: [],
};

function toDateInput(value) {
  return value ? String(value).slice(0, 10) : '';
}

function TotiKpiGrid({ summary, loading }) {
  if (loading && !summary) {
    return (
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Memuat scorecard Ticket TOTI">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[116px]" />)}
      </section>
    );
  }

  const topMitra = summary?.top_mitra || { label: '-', tickets: 0, share: 0 };
  const topCategory = summary?.top_category || { label: '-', tickets: 0, share: 0 };

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <DashboardKpiCard
        title="Total Ticket TOTI"
        value={formatNumber(summary?.total_tickets || 0)}
        subtitle={formatPeriodComparison(
          summary?.total_tickets_period_delta,
          summary?.total_tickets_period_rate,
        )}
        icon={TicketCheck}
        accent={DASHBOARD_CHART_COLORS.info}
      />
      <DashboardKpiCard
        title="Top Tower Provider"
        subtitle={formatRankSubtitle(topMitra.tickets, topMitra.share)}
        icon={Building2}
        accent={DASHBOARD_CHART_COLORS.warning}
      >
        <p
          title={topMitra.label}
          className="mt-2 truncate text-[25px] font-bold leading-none tracking-tight"
          style={{ color: DASHBOARD_CHART_COLORS.warning }}
        >
          {topMitra.label}
        </p>
      </DashboardKpiCard>
      <DashboardKpiCard
        title="Kategori Terbanyak"
        subtitle={formatRankSubtitle(topCategory.tickets, topCategory.share)}
        icon={Layers3}
        accent={DASHBOARD_CHART_COLORS.neutral}
      >
        <p
          title={topCategory.label}
          className="mt-2 truncate text-[25px] font-bold leading-none tracking-tight"
          style={{ color: DASHBOARD_CHART_COLORS.neutral }}
        >
          {topCategory.label}
        </p>
      </DashboardKpiCard>
      <DashboardKpiCard
        title="Ticket Vandalisme"
        value={formatNumber(summary?.vandalism_tickets || 0)}
        subtitle={formatShareSubtitle(summary?.vandalism_rate)}
        icon={ShieldAlert}
        tone="danger"
      />
    </section>
  );
}

export default function TicketTotiPage() {
  const navigate = useNavigate();
  const [filterOptions, setFilterOptions] = useState(EMPTY_FILTER_OPTIONS);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [filtersError, setFiltersError] = useState('');
  const [periodMode, setPeriodMode] = useState('month');
  const [selectedPeriod, setSelectedPeriod] = useState({ start: '', end: '' });
  const [defaultPeriod, setDefaultPeriod] = useState({ start: '', end: '' });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedNop, setSelectedNop] = useState('');
  const [advancedFilters, setAdvancedFilters] = useState(EMPTY_ADVANCED_FILTERS);
  const [dashboard, setDashboard] = useState(null);
  const [tickets, setTickets] = useState({ items: [], total: 0, page: 1, limit: TABLE_LIMIT, total_pages: 0 });
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const [tableError, setTableError] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dashboardRetryKey, setDashboardRetryKey] = useState(0);
  const [tableRetryKey, setTableRetryKey] = useState(0);
  const debouncedSearch = useDebouncedValue(search, 300);

  const loadFilterOptions = useCallback(async () => {
    try {
      const data = await fetchTicketTotiFilters();
      const defaultStartDate = toDateInput(data.default_start_date || data.min_date);
      const defaultEndDate = toDateInput(data.default_end_date || data.max_date);
      const latestMonth = String(defaultEndDate).slice(0, 7);
      setFilterOptions({ ...EMPTY_FILTER_OPTIONS, ...data, default_start_date: defaultStartDate, default_end_date: defaultEndDate });
      setStartDate((current) => current || defaultStartDate);
      setEndDate((current) => current || defaultEndDate);
      if (latestMonth) {
        setSelectedPeriod((current) => current.start ? current : { start: latestMonth, end: latestMonth });
        setDefaultPeriod({ start: latestMonth, end: latestMonth });
      }
      setFiltersError('');
      setFiltersLoaded(true);
      return true;
    } catch (error) {
      console.error('Ticket TOTI filters failed:', error);
      setFiltersError('Filter Ticket TOTI tidak dapat dimuat.');
      setFiltersLoaded(true);
      setDashboardLoading(false);
      setTableLoading(false);
      return false;
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFilterOptions();
  }, [loadFilterOptions]);

  const filterReady = filtersLoaded && (
    periodMode === 'month'
      ? Boolean(selectedPeriod.start && selectedPeriod.end)
      : Boolean(startDate && endDate)
  );

  const dashboardParams = useMemo(() => ({
    period_start: periodMode === 'month' ? selectedPeriod.start || undefined : undefined,
    period_end: periodMode === 'month' ? selectedPeriod.end || undefined : undefined,
    start_date: periodMode === 'custom' ? startDate || undefined : undefined,
    end_date: periodMode === 'custom' ? endDate || undefined : undefined,
    nop: selectedNop || undefined,
    cluster: advancedFilters.cluster || undefined,
    mitra: advancedFilters.mitra || undefined,
    kategori: advancedFilters.kategori || undefined,
    status: advancedFilters.status || undefined,
  }), [advancedFilters, endDate, periodMode, selectedNop, selectedPeriod, startDate]);

  const tableParams = useMemo(() => ({
    ...dashboardParams,
    q: debouncedSearch || undefined,
    page,
    limit: TABLE_LIMIT,
  }), [dashboardParams, debouncedSearch, page]);

  useEffect(() => {
    if (!filterReady) return undefined;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDashboardLoading(true);
    setDashboardError('');
    fetchTicketTotiDashboard(dashboardParams, controller.signal)
      .then((data) => setDashboard(data))
      .catch((error) => {
        if (error?.name !== 'CanceledError') {
          console.error('Ticket TOTI dashboard failed:', error);
          setDashboardError('Ringkasan dan chart Ticket TOTI tidak dapat diperbarui.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDashboardLoading(false);
      });
    return () => controller.abort();
  }, [dashboardParams, dashboardRetryKey, filterReady]);

  useEffect(() => {
    if (!filterReady) return undefined;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTableLoading(true);
    setTableError('');
    fetchTicketTotiTickets(tableParams, controller.signal)
      .then((data) => setTickets(data))
      .catch((error) => {
        if (error?.name !== 'CanceledError') {
          console.error('Ticket TOTI table failed:', error);
          setTableError('Daftar Ticket TOTI tidak dapat diperbarui.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setTableLoading(false);
      });
    return () => controller.abort();
  }, [filterReady, tableParams, tableRetryKey]);

  const resetFilters = () => {
    setPeriodMode('month');
    setSelectedPeriod(defaultPeriod);
    setStartDate(filterOptions.default_start_date || '');
    setEndDate(filterOptions.default_end_date || '');
    setSelectedNop('');
    setAdvancedFilters({ ...EMPTY_ADVANCED_FILTERS });
    setSearch('');
    setPage(1);
  };

  const refreshAll = async () => {
    await loadFilterOptions();
    setDashboardRetryKey((current) => current + 1);
    setTableRetryKey((current) => current + 1);
  };

  const applyAdvancedFilters = (values) => {
    setAdvancedFilters(values);
    setPage(1);
  };

  const removeAdvancedFilter = (key) => {
    setAdvancedFilters((current) => ({ ...current, [key]: '' }));
    setPage(1);
  };

  const coverageMissing = dashboard?.period_meta?.missing_months_by_source?.ticket_toti || [];
  const summary = dashboard?.summary;

  return (
    <div className="flex min-h-screen min-w-0 flex-col overflow-x-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] bg-gradient-to-r from-[var(--bg-base)] via-[var(--bg-surface)] to-[var(--bg-base)] px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3 2xl:flex-nowrap">
          <div className="flex min-w-0 items-center gap-3 2xl:shrink-0">
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="flex size-9 items-center justify-center rounded-lg border border-[var(--border-light)] text-[var(--text-muted)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)]"
              aria-label="Kembali ke dashboard"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="flex size-10 items-center justify-center rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/10">
              <TicketCheck className="size-5 text-[var(--primary-light)]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight">Ticket TOTI</h1>
              <p className="truncate text-xs text-[var(--text-muted)]">Tower Operations Ticket Insight</p>
            </div>
          </div>

          <div className="flex w-full min-w-0 flex-wrap items-end justify-end gap-2 2xl:w-auto 2xl:flex-nowrap">
            <p className="hidden shrink-0 font-mono text-xs text-[var(--text-muted)] 2xl:block">
              Updated: {formatTotiDateTime(summary?.last_updated_at)}
            </p>
            <DashboardFilterBar
              className="w-full border-0 bg-transparent p-0 shadow-none backdrop-blur-none 2xl:w-auto"
              actions={(
                <>
                  <DashboardFilterPopover
                    title="Filter Ticket TOTI lanjutan"
                    description="Cluster, Tower Provider, kategori, dan status diterapkan ke seluruh ringkasan serta tabel."
                    values={advancedFilters}
                    onApply={applyAdvancedFilters}
                    onReset={() => ({ ...EMPTY_ADVANCED_FILTERS })}
                    triggerLabel="Filter lanjutan"
                    testId="ticket-toti-advanced-filter"
                  >
                    {({ draftValues, setDraftValue }) => (
                      <>
                        <DashboardCombobox id="ticket-toti-cluster" label="Cluster" value={draftValues.cluster} onChange={(value) => setDraftValue('cluster', value)} options={filterOptions.clusters} allLabel="Semua Cluster" />
                        <DashboardCombobox id="ticket-toti-mitra" label="Tower Provider" value={draftValues.mitra} onChange={(value) => setDraftValue('mitra', value)} options={filterOptions.mitras} allLabel="Semua Provider" />
                        <DashboardFilterSelect id="ticket-toti-kategori" label="Kategori" value={draftValues.kategori} onChange={(value) => setDraftValue('kategori', value)} options={filterOptions.categories} allLabel="Semua Kategori" />
                        <DashboardFilterSelect id="ticket-toti-status" label="Status" value={draftValues.status} onChange={(value) => setDraftValue('status', value)} options={filterOptions.statuses} allLabel="Semua Status" />
                      </>
                    )}
                  </DashboardFilterPopover>
                  <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                    <RotateCcw data-icon="inline-start" /> Reset
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={refreshAll} disabled={dashboardLoading || tableLoading}>
                    <RefreshCcw data-icon="inline-start" /> Refresh
                  </Button>
                </>
              )}
              chips={(
                <DashboardFilterChips
                  items={[
                    { key: 'cluster', label: 'Cluster', value: advancedFilters.cluster },
                    { key: 'mitra', label: 'Provider', value: advancedFilters.mitra },
                    { key: 'kategori', label: 'Kategori', value: advancedFilters.kategori },
                    { key: 'status', label: 'Status', value: advancedFilters.status },
                  ]}
                  onRemove={removeAdvancedFilter}
                />
              )}
            >
              <div className="flex h-8 items-center rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5 text-[10px] font-semibold">
                <button type="button" onClick={() => { setPeriodMode('month'); setPage(1); }} className={`rounded-md px-2 py-1 ${periodMode === 'month' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)]'}`}>Periode Bulan</button>
                <button type="button" onClick={() => { setPeriodMode('custom'); setPage(1); }} className={`rounded-md px-2 py-1 ${periodMode === 'custom' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)]'}`}>Tanggal Kustom</button>
              </div>
              {periodMode === 'month' ? (
                <DashboardMonthRangePicker
                  id="ticket-toti-period"
                  label="Periode"
                  value={selectedPeriod}
                  defaultValue={defaultPeriod}
                  availableMonths={filterOptions.available_months}
                  onApply={(value) => { setSelectedPeriod(value); setPage(1); }}
                  onReset={(value) => { setSelectedPeriod(value); setPage(1); }}
                />
              ) : (
                <DashboardDateRangePicker
                  id="ticket-toti-start-date"
                  data-end-date-id="ticket-toti-end-date"
                  label="Tanggal Kustom"
                  value={{ from: startDate, to: endDate }}
                  onApply={({ from, to }) => { setStartDate(from); setEndDate(to); setPage(1); }}
                />
              )}
              <DashboardCombobox
                id="ticket-toti-nop"
                label="NOP"
                value={selectedNop}
                onChange={(value) => { setSelectedNop(value); setPage(1); }}
                options={filterOptions.nops}
                allLabel="Semua NOP"
                searchPlaceholder="Cari NOP..."
              />
            </DashboardFilterBar>
          </div>
        </div>
      </header>

      <Breadcrumb />
      <main className="min-w-0 flex-1 space-y-4 p-4 sm:p-5">
        <TicketingSectionNav />

        {filtersError ? (
          <Alert variant="destructive">
            <AlertTitle>Filter tidak dapat diperbarui</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{filtersError}</span>
              <Button type="button" variant="outline" size="sm" onClick={loadFilterOptions}>Coba lagi</Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {dashboardError ? (
          <Alert variant="destructive">
            <AlertTitle>Dashboard tidak dapat diperbarui</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{dashboardError}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setDashboardRetryKey((current) => current + 1)}>Coba lagi</Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {coverageMissing.length ? (
          <Alert>
            <AlertTitle>Coverage data belum lengkap</AlertTitle>
            <AlertDescription>Bulan tanpa data Ticket TOTI: {coverageMissing.join(', ')}.</AlertDescription>
          </Alert>
        ) : null}

        {dashboard && summary?.total_tickets === 0 ? (
          <Alert>
            <AlertTitle>Tidak ada Ticket TOTI pada periode ini</AlertTitle>
            <AlertDescription>Ubah periode atau longgarkan filter untuk melihat data.</AlertDescription>
          </Alert>
        ) : null}

        <TotiKpiGrid summary={summary} loading={dashboardLoading} />
        <TicketTotiCharts dashboard={dashboard} loading={dashboardLoading && !dashboard} />
        <TicketTotiTable
          tickets={tickets}
          loading={tableLoading}
          error={tableError}
          search={search}
          onSearchChange={(value) => { setSearch(value); setPage(1); }}
          onPageChange={setPage}
          onRetry={() => setTableRetryKey((current) => current + 1)}
        />
      </main>
    </div>
  );
}
