import { Component, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  CircleCheck,
  Clock3,
  Download,
  ListChecks,
  MapPin,
  RefreshCcw,
  RotateCcw as ArrowCounterClockwiseIcon,
  ShieldCheck,
  ShieldX,
  TicketCheck,
  X,
  Zap,
} from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import TicketingSectionNav from '../components/TicketingSectionNav';
import {
  DashboardCombobox,
  DashboardDateRangePicker,
  DashboardFilterBar,
  DashboardFilterChips,
  DashboardFilterPopover,
  DashboardFilterSelect,
  DashboardPagination,
  DashboardSearchInput,
  DashboardTableToolbar,
  DashboardMonthRangePicker,
} from '../components/dashboard-filters/DashboardFilters';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { TICKETING_CHART_COLORS } from '../features/ticketing/ticketingChartConfig';
import { TicketingCharts } from '../features/ticketing/TicketingCharts';
import {
  getFopMonthCount,
  getTakeoverThreshold,
  sortFopRows,
} from '../features/ticketing/ticketingFopUtils';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
  DashboardChartPanel,
  DashboardKpiCard,
  DashboardStatusBadge,
} from '../components/ui/DashboardPrimitives';
import {
  fetchTicketingDashboard,
  fetchTicketingFilters,
  fetchTicketingTicketDetail,
  fetchTicketingTickets,
  exportTicketingTickets,
} from '../services/api';
import { getPeriodComparisonLabel } from '../components/dashboard-filters/periodRange';
import { formatNumber, formatPercent } from '../utils/formatters';

const TABLE_LIMIT = 20;
const EMPTY_TICKETING_ADVANCED_FILTERS = {
  cluster_to: '',
  kategori_tt: '',
  takeover: '',
  ticket_swfm_status: '',
  backup_sukses: '',
  rc_category: '',
  is_escalate: '',
};

class TicketingErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Ticketing render failed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--bg-base)] p-6 text-[var(--text-primary)]">
          <section className="glass-card mx-auto mt-16 max-w-xl p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10">
                <TicketCheck className="size-5 text-red-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Ticketing</h1>
                <p className="text-sm text-[var(--text-muted)]">Halaman gagal dirender. Coba muat ulang.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="rounded-lg border border-[var(--border-light)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)]"
            >
              Muat ulang halaman
            </button>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}

function toDateInput(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatHours(value) {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return `${Number(value).toFixed(1).replace('.', ',')}h`;
}

function formatMinutes(value) {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return `${Number(value).toFixed(0)}m`;
}

function formatTicketComparison(summary, comparisonLabel) {
  const delta = summary?.total_tickets_mom_delta;
  const rate = summary?.total_tickets_mom_rate;
  if (delta == null) return `${comparisonLabel} -`;
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : '';
  const rateLabel = rate == null ? '-' : `${rate > 0 ? '+' : rate < 0 ? '-' : ''}${Math.abs(Number(rate)).toFixed(1)}%`;
  return `${comparisonLabel} ${sign}${formatNumber(Math.abs(delta))} (${rateLabel})`;
}

function categoryShare(value, total) {
  const numerator = Number(value || 0);
  const denominator = Number(total || 0);
  if (!denominator) return '-';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function asDisplay(value) {
  if (value == null || value === '') return '-';
  return String(value);
}

function filterErrorMessage(err) {
  if (err?.response?.status === 404) {
    return 'Gagal memuat filter Ticketing. Backend belum memuat API Ticketing terbaru.';
  }
  return 'Gagal memuat filter Ticketing.';
}

function Scorecard({ title, value, subtitle, icon: Icon, accent, glow, children }) {
  return (
    <DashboardKpiCard title={title} value={value} subtitle={subtitle} icon={Icon} accent={accent} glow={glow}>
      {children}
    </DashboardKpiCard>
  );
}

function FopSortHeader({ column, label, sort, onSort, align = 'right' }) {
  const active = sort.key === column;
  const SortIcon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 rounded-sm transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40 ${align === 'right' ? 'justify-end' : 'justify-start'}`}
      >
        <span>{label}</span>
        <SortIcon className="size-3" aria-hidden="true" />
      </button>
    </th>
  );
}

function StatusBadge({ value }) {
  const status = String(value || '-').toUpperCase();
  return (
    <DashboardStatusBadge tone={status === 'OUT SLA' || status === 'CANCELED' ? 'danger' : status === 'IN SLA' || status === 'CLOSED' ? 'success' : 'warning'}>
      {status}
    </DashboardStatusBadge>
  );
}

function TicketDetailModal({ detail, loading, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const data = detail?.data || {};
  const fields = [
    ['SWFM', data.ticket_number_swfm],
    ['INAP', data.ticket_number_inap],
    ['Site', `${asDisplay(data.site_id)} - ${asDisplay(data.site_name)}`],
    ['Cluster', data.cluster_to],
    ['Created', formatDateTime(data.created_at)],
    ['Cleared', formatDateTime(data.cleared_time)],
    ['Status', data.ticket_swfm_status],
    ['SLA', data.sla_status],
    ['Severity', data.severity],
    ['Impact', data.impact],
    ['Backup Sukses', data.backup_sukses],
    ['RC Category', data.rc_category],
    ['RC 1 / RC 2', `${asDisplay(data.rc_1)} / ${asDisplay(data.rc_2)}`],
    ['PIC Take Over', data.pic_take_over_ticket],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-scrim)] p-4 backdrop-blur-sm" onClick={onClose}>
      <section className="glass-card max-h-[86vh] w-full max-w-4xl overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">Ticket Detail</h2>
            <p className="font-mono text-xs text-[var(--primary-light)]">{asDisplay(data.ticket_number_swfm)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg border border-[var(--border-light)] text-[var(--text-muted)] transition-colors hover:border-red-500/30 hover:text-red-300"
            aria-label="Close ticket detail"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto p-5">
          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">Memuat detail ticket...</p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {fields.map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
                    <p className="mt-1 text-sm text-[var(--text-primary)]">{asDisplay(value)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Summary</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--text-secondary)]">{asDisplay(data.summary)}</p>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Resolution Action</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--text-secondary)]">{asDisplay(data.inap_resolution_action || data.resolution_action)}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function TicketingDashboard() {
  const navigate = useNavigate();
  const [filterOptions, setFilterOptions] = useState({
    default_start_date: '',
    default_end_date: '',
    available_months: [],
    years: [],
    months: [],
    nops: [],
    clusters: [],
    categories: [],
    takeovers: [],
    ticket_statuses: [],
    backup_sukses: [],
    rc_categories: [],
  });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [periodMode, setPeriodMode] = useState('month');
  const [selectedPeriod, setSelectedPeriod] = useState({ start: '', end: '' });
  const [defaultPeriod, setDefaultPeriod] = useState({ start: '', end: '' });
  const [selectedNop, setSelectedNop] = useState('');
  const [advancedFilters, setAdvancedFilters] = useState(EMPTY_TICKETING_ADVANCED_FILTERS);
  const [dashboard, setDashboard] = useState(null);
  const [tickets, setTickets] = useState({ items: [], total: 0, page: 1, limit: TABLE_LIMIT, total_pages: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketDetail, setTicketDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [fopSort, setFopSort] = useState({ key: 'performance_score', direction: 'desc' });

  const loadFilterOptions = useCallback(async () => {
    try {
      const data = await fetchTicketingFilters();
      const defaultStartDate = toDateInput(data.default_start_date || data.min_date);
      const defaultEndDate = toDateInput(data.default_end_date || data.max_date);
      setFilterOptions({
        ...data,
        default_start_date: defaultStartDate,
        default_end_date: defaultEndDate,
      });
      if (defaultStartDate && defaultEndDate) {
        setStartDate((current) => current || defaultStartDate);
        setEndDate((current) => current || defaultEndDate);
        const latestMonth = String(defaultEndDate).slice(0, 7);
        setSelectedPeriod((current) => current.start ? current : { start: latestMonth, end: latestMonth });
        setDefaultPeriod({ start: latestMonth, end: latestMonth });
      }
      setError('');
      setFiltersLoaded(true);
      return data;
    } catch (err) {
      console.error('Ticketing filters failed:', err);
      setError(filterErrorMessage(err));
      setDashboardLoading(false);
      setTableLoading(false);
      setFiltersLoaded(true);
      return null;
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFilterOptions();
  }, [loadFilterOptions]);

  const debouncedSearch = useDebouncedValue(search, 300);

  const dashboardParams = useMemo(() => ({
    period_start: periodMode === 'month' ? selectedPeriod.start || undefined : undefined,
    period_end: periodMode === 'month' ? selectedPeriod.end || undefined : undefined,
    start_date: periodMode === 'custom' ? startDate || undefined : undefined,
    end_date: periodMode === 'custom' ? endDate || undefined : undefined,
    nop: selectedNop || undefined,
    cluster_to: advancedFilters.cluster_to || undefined,
    kategori_tt: advancedFilters.kategori_tt || undefined,
    takeover: advancedFilters.takeover || undefined,
    ticket_swfm_status: advancedFilters.ticket_swfm_status || undefined,
    backup_sukses: advancedFilters.backup_sukses || undefined,
    rc_category: advancedFilters.rc_category || undefined,
    is_escalate: advancedFilters.is_escalate || undefined,
  }), [advancedFilters, endDate, periodMode, selectedNop, selectedPeriod, startDate]);

  const tableParams = useMemo(() => ({
    ...dashboardParams,
    q: debouncedSearch || undefined,
    page,
    limit: TABLE_LIMIT,
  }), [dashboardParams, debouncedSearch, page]);

  const handleRefresh = useCallback(async () => {
    await loadFilterOptions();
    setRefreshKey((current) => current + 1);
  }, [loadFilterOptions]);

  useEffect(() => {
    if (!filtersLoaded || (periodMode === 'month' ? !selectedPeriod.start || !selectedPeriod.end : !startDate || !endDate)) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDashboardLoading(true);
    setError('');
    fetchTicketingDashboard(dashboardParams)
      .then((dashboardData) => {
        if (!cancelled) setDashboard(dashboardData);
      })
      .catch((err) => {
        console.error('Ticketing dashboard failed:', err);
        if (!cancelled) setError('Gagal memuat data dashboard Ticketing.');
      })
      .finally(() => {
        if (!cancelled) setDashboardLoading(false);
      });
    return () => { cancelled = true; };
  }, [dashboardParams, endDate, filtersLoaded, periodMode, refreshKey, selectedPeriod, startDate]);

  useEffect(() => {
    if (!filtersLoaded || (periodMode === 'month' ? !selectedPeriod.start || !selectedPeriod.end : !startDate || !endDate)) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTableLoading(true);
    fetchTicketingTickets(tableParams)
      .then((ticketData) => {
        if (!cancelled) setTickets(ticketData);
      })
      .catch((err) => {
        console.error('Ticketing list failed:', err);
        if (!cancelled) setError('Gagal memuat daftar ticket.');
      })
      .finally(() => {
        if (!cancelled) setTableLoading(false);
      });
    return () => { cancelled = true; };
  }, [endDate, filtersLoaded, periodMode, refreshKey, selectedPeriod, startDate, tableParams]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [dashboardParams, debouncedSearch]);

  useEffect(() => {
    if (!selectedTicket) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTicketDetail(null);
      return;
    }
    setDetailLoading(true);
    fetchTicketingTicketDetail(selectedTicket)
      .then(setTicketDetail)
      .catch((err) => {
        console.error('Ticket detail failed:', err);
        setTicketDetail(null);
      })
      .finally(() => setDetailLoading(false));
  }, [selectedTicket]);

  const resetFilters = () => {
    setStartDate(filterOptions.default_start_date || '');
    setEndDate(filterOptions.default_end_date || '');
    setPeriodMode('month');
    setSelectedPeriod(defaultPeriod);
    setSelectedNop('');
    setAdvancedFilters({ ...EMPTY_TICKETING_ADVANCED_FILTERS });
    setPage(1);
  };

  const removeAdvancedFilter = (key) => {
    setAdvancedFilters((current) => ({ ...current, [key]: '' }));
  };

  const resetTableFilters = () => {
    setSearch('');
    setPage(1);
  };

  const summary = dashboard?.summary;
  const ticketCategory = summary?.ticket_category || { bps: 0, ts: 0, total: 0 };

  const comparisonLabel = periodMode === 'month'
    ? getPeriodComparisonLabel(selectedPeriod.start, selectedPeriod.end)
    : 'vs periode sebelumnya';
  const coverageMissing = dashboard?.period_meta?.missing_months_by_source?.ticketing || [];
  const fopMonthCount = getFopMonthCount(dashboard?.period_meta, startDate, endDate);
  const takeoverThreshold = getTakeoverThreshold(fopMonthCount);
  const sortedFopPerformance = useMemo(
    () => sortFopRows(dashboard?.fop_performance, fopSort.key, fopSort.direction),
    [dashboard?.fop_performance, fopSort],
  );

  const handleFopSort = (key) => {
    setFopSort((current) => ({
      key,
      direction: current.key === key
        ? (current.direction === 'asc' ? 'desc' : 'asc')
        : (key === 'pic' ? 'asc' : 'desc'),
    }));
  };

  const handleExportCsv = async () => {
    try {
      const response = await exportTicketingTickets({ ...dashboardParams, q: debouncedSearch || undefined });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      const disposition = response.headers?.['content-disposition'] || '';
      link.download = disposition.match(/filename="?([^";]+)"?/)?.[1] || 'ticketing-export.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Ticketing export failed:', err);
      setError('Gagal mengekspor seluruh hasil Ticketing.');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] bg-gradient-to-r from-[var(--bg-base)] via-[var(--bg-surface)] to-[var(--bg-base)] px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3 lg:flex-nowrap">
          <div className="flex min-w-0 items-center gap-3 lg:shrink-0">
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="flex size-9 items-center justify-center rounded-lg border border-[var(--border-light)] text-[var(--text-muted)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)]"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="flex size-10 items-center justify-center rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/10">
              <TicketCheck className="size-5 text-[var(--primary-light)]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight">Ticketing</h1>
              <p className="truncate text-xs text-[var(--text-muted)]">Ticket Fault Center</p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-end justify-end gap-2 lg:w-auto lg:flex-nowrap">
            <p className="hidden font-mono text-xs text-[var(--text-muted)] md:block">
              Updated: {formatDateTime(summary?.last_created_at)}
            </p>
            <DashboardFilterBar
              className="w-full border-0 bg-transparent p-0 shadow-none backdrop-blur-none lg:w-auto"
              actions={(
                <>
                  <DashboardFilterPopover
                    title="Filter Ticketing lanjutan"
                    description="Filter compatibility diterapkan bersamaan setelah menekan Terapkan."
                    values={advancedFilters}
                    onApply={setAdvancedFilters}
                    onReset={() => ({ ...EMPTY_TICKETING_ADVANCED_FILTERS })}
                    testId="ticketing-filter-sheet"
                  >
                    {({ draftValues, setDraftValue }) => (
                      <>
                        <DashboardCombobox
                          id="ticketing-cluster"
                          label="Cluster TO"
                          value={draftValues.cluster_to}
                          onChange={(value) => setDraftValue('cluster_to', value)}
                          options={filterOptions.clusters}
                          allLabel="Semua Cluster"
                        />
                        <DashboardFilterSelect
                          id="ticketing-category"
                          label="Kategori Ticket"
                          value={draftValues.kategori_tt}
                          onChange={(value) => setDraftValue('kategori_tt', value)}
                          options={filterOptions.categories}
                          allLabel="Semua Kategori"
                        />
                        <DashboardFilterSelect
                          id="ticketing-takeover"
                          label="Takeover"
                          value={draftValues.takeover}
                          onChange={(value) => setDraftValue('takeover', value)}
                          options={filterOptions.takeovers}
                          allLabel="Semua Takeover"
                        />
                        <DashboardFilterSelect
                          id="ticketing-status"
                          label="Ticket Status"
                          value={draftValues.ticket_swfm_status}
                          onChange={(value) => setDraftValue('ticket_swfm_status', value)}
                          options={filterOptions.ticket_statuses}
                          allLabel="Semua Status"
                        />
                        <DashboardFilterSelect
                          id="ticketing-backup"
                          label="Backup Sukses"
                          value={draftValues.backup_sukses}
                          onChange={(value) => setDraftValue('backup_sukses', value)}
                          options={filterOptions.backup_sukses}
                          allLabel="Semua Backup"
                        />
                        <DashboardCombobox
                          id="ticketing-rc-category"
                          label="RC Category"
                          value={draftValues.rc_category}
                          onChange={(value) => setDraftValue('rc_category', value)}
                          options={filterOptions.rc_categories}
                          allLabel="Semua RC"
                        />
                        <DashboardFilterSelect
                          id="ticketing-escalate"
                          label="Is Escalate"
                          value={draftValues.is_escalate}
                          onChange={(value) => setDraftValue('is_escalate', value)}
                          options={[
                            { value: 'true', label: 'Ya' },
                            { value: 'false', label: 'Tidak' },
                          ]}
                          allLabel="Semua Escalation"
                        />
                      </>
                    )}
                  </DashboardFilterPopover>
                  <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                    <ArrowCounterClockwiseIcon data-icon="inline-start" />
                    Reset
                  </Button>
                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={dashboardLoading || tableLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-light)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCcw className="size-3.5" />
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-light)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)]"
                  >
                    <Download className="size-3.5" />
                    Export CSV
                  </button>
                </>
              )}
              chips={(
                <DashboardFilterChips
                  items={[
                    { key: 'cluster_to', label: 'Cluster', value: advancedFilters.cluster_to },
                    { key: 'kategori_tt', label: 'Kategori', value: advancedFilters.kategori_tt },
                    { key: 'takeover', label: 'Takeover', value: advancedFilters.takeover },
                    { key: 'ticket_swfm_status', label: 'Status', value: advancedFilters.ticket_swfm_status },
                    { key: 'backup_sukses', label: 'Backup', value: advancedFilters.backup_sukses },
                    { key: 'rc_category', label: 'RC', value: advancedFilters.rc_category },
                    { key: 'is_escalate', label: 'Escalation', value: advancedFilters.is_escalate },
                  ]}
                  onRemove={removeAdvancedFilter}
                />
              )}
            >
              <div className="flex h-8 items-center rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5 text-[10px] font-semibold">
                <button type="button" onClick={() => setPeriodMode('month')} className={`rounded-md px-2 py-1 ${periodMode === 'month' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)]'}`}>Periode Bulan</button>
                <button type="button" onClick={() => setPeriodMode('custom')} className={`rounded-md px-2 py-1 ${periodMode === 'custom' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)]'}`}>Tanggal Kustom</button>
              </div>
              {periodMode === 'month' ? (
                <DashboardMonthRangePicker
                  id="ticketing-period"
                  label="Periode"
                  value={selectedPeriod}
                  defaultValue={defaultPeriod}
                  availableMonths={filterOptions.available_months}
                  onApply={setSelectedPeriod}
                  onReset={setSelectedPeriod}
                />
              ) : (
                <DashboardDateRangePicker
                  id="ticketing-start-date"
                  data-end-date-id="ticketing-end-date"
                  label="Tanggal Kustom"
                  value={{ from: startDate, to: endDate }}
                  onApply={({ from, to }) => {
                    setStartDate(from);
                    setEndDate(to);
                  }}
                />
              )}
              <DashboardCombobox
                id="ticketing-nop"
                label="NOP"
                value={selectedNop}
                onChange={setSelectedNop}
                options={filterOptions.nops}
                allLabel="Semua NOP"
                searchPlaceholder="Cari NOP..."
              />
            </DashboardFilterBar>
          </div>
        </div>
      </header>
      <Breadcrumb />

      <main className="flex-1 space-y-4 overflow-auto p-5">
        <TicketingSectionNav />
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Data tidak dapat diperbarui</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {coverageMissing.length ? (
          <Alert>
            <AlertTitle>Coverage data belum lengkap</AlertTitle>
            <AlertDescription>Bulan tanpa data Ticketing: {coverageMissing.join(', ')}. KPI dan ekspor menggunakan data yang tersedia.</AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Scorecard title="Total Tickets" value={formatNumber(summary?.total_tickets)} subtitle={formatTicketComparison(summary, comparisonLabel)} icon={TicketCheck} accent={TICKETING_CHART_COLORS.bps} glow="rgba(59,130,246,0.14)" />
          <Scorecard
            title="Ticket Category"
            subtitle={`BPS ${categoryShare(ticketCategory.bps, ticketCategory.total)} / TS ${categoryShare(ticketCategory.ts, ticketCategory.total)}`}
            icon={ListChecks}
            accent={TICKETING_CHART_COLORS.ts}
            glow="rgba(16,185,129,0.14)"
          >
            <div className="mt-1 flex items-baseline gap-3 font-mono text-lg font-bold">
              <span style={{ color: TICKETING_CHART_COLORS.bps }}>BPS: {formatNumber(ticketCategory.bps)}</span>
              <span style={{ color: TICKETING_CHART_COLORS.ts }}>TS: {formatNumber(ticketCategory.ts)}</span>
            </div>
          </Scorecard>
          <Scorecard
            title="Manual Takeover"
            value={formatPercent(summary?.manual_takeover_rate)}
            subtitle={`${formatNumber(summary?.manual_takeover_tickets)} dari ${formatNumber(summary?.total_tickets)} ticket`}
            icon={Zap}
            accent={TICKETING_CHART_COLORS.total}
            glow="rgba(251,191,36,0.14)"
          />
          <Scorecard
            title="Visitation Rate"
            value={formatPercent(summary?.visitation_rate)}
            subtitle={`${formatNumber(summary?.visitation_tickets)} / ${formatNumber(summary?.total_tickets)} Visit site`}
            icon={MapPin}
            accent={TICKETING_CHART_COLORS.violet}
            glow="rgba(139,92,246,0.14)"
          />
          <Scorecard title="Backup Sukses Rate" value={formatPercent(summary?.backup_sukses_rate)} subtitle={`${formatNumber(summary?.backup_sukses_tickets)} BU Genset`} icon={ShieldCheck} accent={TICKETING_CHART_COLORS.success} glow="rgba(16,185,129,0.14)" />
          <Scorecard title="Escalated" value={formatNumber(summary?.escalated_tickets)} subtitle={formatPercent(summary?.escalated_rate)} icon={AlertTriangle} accent={TICKETING_CHART_COLORS.warning} glow="rgba(245,158,11,0.14)" />
          <Scorecard title="OUT SLA Rate" value={formatPercent(summary?.out_sla_rate)} subtitle={`${formatNumber(summary?.out_sla_tickets)} OUT SLA`} icon={ShieldX} accent={TICKETING_CHART_COLORS.danger} glow="rgba(239,68,68,0.14)" />
          <Scorecard title="Average MTTR" value={formatHours(summary?.average_mttr_hours)} icon={Clock3} accent={TICKETING_CHART_COLORS.bps} glow="rgba(59,130,246,0.14)" />
          <Scorecard title="Closed Rate" value={formatPercent(summary?.closed_rate)} subtitle={`${formatNumber(summary?.closed_tickets)} closed`} icon={CircleCheck} accent={TICKETING_CHART_COLORS.success} glow="rgba(16,185,129,0.14)" />
          <Scorecard title="Canceled" value={formatNumber(summary?.canceled_tickets)} subtitle="Canceled tickets" icon={ShieldX} accent={TICKETING_CHART_COLORS.danger} glow="rgba(239,68,68,0.14)" />
        </section>

        <TicketingCharts dashboard={dashboard} />

        <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="grid content-start gap-4">
            <DashboardChartPanel title="Top Problem Sites" icon={AlertTriangle}>
              <div className="overflow-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2">Site ID</th>
                      <th className="px-3 py-2">Site Name</th>
                      <th className="px-3 py-2">Cluster</th>
                      <th className="px-3 py-2 text-right">Tickets</th>
                      <th className="px-3 py-2 text-right">OUT SLA</th>
                      <th className="px-3 py-2 text-right">P90 MTTR</th>
                      <th className="px-3 py-2 text-right">Backup</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {(dashboard?.top_sites || []).map((site) => (
                      <tr key={site.site_id} className="hover:bg-[var(--bg-elevated)]/50">
                        <td className="px-3 py-2 font-mono font-semibold text-[var(--primary-light)]">{site.site_id}</td>
                        <td className="px-3 py-2">{asDisplay(site.site_name)}</td>
                        <td className="px-3 py-2">{asDisplay(site.cluster_to)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(site.tickets)}</td>
                        <td className="px-3 py-2 text-right font-mono text-red-300">{formatPercent(site.out_sla_rate)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatHours(site.p90_mttr_hours)}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-300">{formatPercent(site.backup_sukses_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DashboardChartPanel>

            <DashboardChartPanel title="Performance Tim FOP" icon={Zap}>
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-surface)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    <tr>
                      <FopSortHeader column="rank" label="Rank" sort={fopSort} onSort={handleFopSort} />
                      <FopSortHeader column="pic" label="PIC" sort={fopSort} onSort={handleFopSort} align="left" />
                      <FopSortHeader column="performance_score" label="Performance Score" sort={fopSort} onSort={handleFopSort} />
                      <FopSortHeader column="takeover_tickets" label="Takeover" sort={fopSort} onSort={handleFopSort} />
                      <FopSortHeader column="visitation_tickets" label="Visitation" sort={fopSort} onSort={handleFopSort} />
                      <FopSortHeader column="backup_sukses_tickets" label="Backup Sukses" sort={fopSort} onSort={handleFopSort} />
                      <FopSortHeader column="average_response_minutes" label="Average Response Time" sort={fopSort} onSort={handleFopSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {sortedFopPerformance.map((member) => (
                      <tr key={member.pic} className="hover:bg-[var(--bg-elevated)]/50">
                        <td className="px-3 py-2 text-right font-mono text-[var(--text-muted)]">{member.rank}</td>
                        <td className="px-3 py-2 font-semibold text-[var(--text-primary)]">{member.pic}</td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${member.performance_score > 50 ? 'text-emerald-300' : 'text-[var(--primary-light)]'}`}>{Number(member.performance_score || 0).toFixed(2)}</td>
                        <td
                          className={`px-3 py-2 text-right font-mono ${member.takeover_tickets >= takeoverThreshold ? 'font-semibold text-emerald-300' : ''}`}
                          title={`Target ${formatNumber(takeoverThreshold)} takeover untuk ${fopMonthCount} bulan`}
                        >
                          {formatNumber(member.takeover_tickets)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(member.visitation_tickets)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(member.backup_sukses_tickets)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatMinutes(member.average_response_minutes)}</td>
                      </tr>
                    ))}
                    {!dashboard?.fop_performance?.length ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-[var(--text-muted)]">Tidak ada PIC takeover pada filter aktif.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </DashboardChartPanel>
          </div>

          <section className="glass-card overflow-hidden">
            <DashboardTableToolbar
              className="border-b border-[var(--border)] p-3"
              actions={(
                <>
                  <DashboardSearchInput
                    id="ticketing-search"
                    value={search}
                    onChange={setSearch}
                    placeholder="Search ticket number, site, summary..."
                    className="w-full sm:w-[280px]"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={resetTableFilters}>
                    <ArrowCounterClockwiseIcon data-icon="inline-start" />
                    Reset tabel
                  </Button>
                </>
              )}
            >
              <div className="flex items-center gap-2">
                <ListChecks className="size-4 text-[var(--primary-light)]" />
                <h2 className="text-sm font-semibold">Ticket List</h2>
              </div>
            </DashboardTableToolbar>
            <div className="overflow-auto">
              <table className="w-full min-w-[880px] text-left text-xs">
                <thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Ticket Number SWFM</th>
                    <th className="px-3 py-2">Site ID</th>
                    <th className="px-3 py-2">Site Name</th>
                    <th className="px-3 py-2">Cluster</th>
                    <th className="px-3 py-2">Kategori</th>
                    <th className="px-3 py-2">SLA Status</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2 text-right">MTTR</th>
                    <th className="px-3 py-2">Backup</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {tickets.items.map((ticket) => (
                    <tr
                      key={ticket.ticket_number_swfm}
                      onClick={() => setSelectedTicket(ticket.ticket_number_swfm)}
                      className="cursor-pointer hover:bg-[var(--bg-elevated)]/50"
                    >
                      <td className="px-3 py-2 font-mono font-semibold text-[var(--primary-light)]">{ticket.ticket_number_swfm}</td>
                      <td className="px-3 py-2 font-mono">{ticket.site_id}</td>
                      <td className="px-3 py-2">{asDisplay(ticket.site_name)}</td>
                      <td className="px-3 py-2">{asDisplay(ticket.cluster_to)}</td>
                      <td className="px-3 py-2">{asDisplay(ticket.kategori_tt)}</td>
                      <td className="px-3 py-2"><StatusBadge value={ticket.sla_status} /></td>
                      <td className="px-3 py-2"><StatusBadge value={ticket.ticket_swfm_status} /></td>
                      <td className="px-3 py-2">{formatDateTime(ticket.created_at)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatHours(ticket.mttr_hours)}</td>
                      <td className="px-3 py-2">{asDisplay(ticket.backup_sukses)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--text-muted)]">
              <span>Showing page {tickets.page || page} of {tickets.total_pages || 1} | {formatNumber(tickets.total)} tickets</span>
              <DashboardPagination
                page={page}
                totalPages={tickets.total_pages || 1}
                onPageChange={setPage}
                disabled={tableLoading}
              />
            </div>
          </section>
        </section>
      </main>

      {selectedTicket && (
        <TicketDetailModal
          detail={ticketDetail}
          loading={detailLoading}
          onClose={() => setSelectedTicket(null)}
        />
      )}
    </div>
  );
}

export default function TicketingPage() {
  return (
    <TicketingErrorBoundary>
      <TicketingDashboard />
    </TicketingErrorBoundary>
  );
}
