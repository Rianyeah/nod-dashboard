import { Component, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  Clock3,
  Download,
  Filter,
  ListChecks,
  MapPin,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShieldX,
  TicketCheck,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Breadcrumb from '../components/Breadcrumb';
import {
  fetchTicketingDashboard,
  fetchTicketingFilters,
  fetchTicketingTicketDetail,
  fetchTicketingTickets,
} from '../services/api';
import { formatNumber, formatPercent } from '../utils/formatters';

const TABLE_LIMIT = 20;

const COLORS = {
  bps: '#3B82F6',
  ts: '#10B981',
  total: '#FBBF24',
  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#10B981',
  violet: '#8B5CF6',
  muted: '#94A3B8',
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

function optionList(values = []) {
  return values.filter((value) => value != null && value !== '');
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
    <div className="glass-card min-w-0 p-4">
      <div className="flex items-center gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: glow, boxShadow: `0 0 16px ${glow}` }}
        >
          <Icon className="size-5" style={{ color: accent }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">{title}</p>
          {children || (
            <p className="mt-0.5 truncate font-mono text-xl font-bold tabular-nums tracking-tight" style={{ color: accent }}>
              {value}
            </p>
          )}
          <p className="truncate text-[10px] text-[var(--text-muted)]">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, icon: Icon, children, action }) {
  return (
    <section className="glass-card min-w-0 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-[var(--primary-light)]" />
          <h2 className="truncate text-sm font-semibold tracking-wide text-[var(--text-primary)]">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ChartEmpty({ label = 'Data belum tersedia untuk filter ini.' }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]/40">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

function TicketingTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card space-y-1 p-3 text-xs !border-[var(--primary)]/20">
      <p className="font-semibold text-[var(--text-primary)]">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} style={{ color: item.color }}>
          {item.name}: {formatNumber(item.value)}
        </p>
      ))}
    </div>
  );
}

function SelectFilter({ id, label, value, onChange, options, placeholder = 'Semua' }) {
  return (
    <label className="flex min-w-[145px] flex-1 flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
      {label}
      <select
        id={id}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-9 rounded-lg border border-[var(--border-light)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-medium normal-case tracking-normal text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
      >
        <option value="">{placeholder}</option>
        {optionList(options).map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function DateFilter({ id, label, value, onChange }) {
  return (
    <label className="flex min-w-[150px] flex-1 flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
      {label}
      <input
        id={id}
        type="date"
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-9 rounded-lg border border-[var(--border-light)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-medium normal-case tracking-normal text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
      />
    </label>
  );
}

function StatusBadge({ value }) {
  const status = String(value || '-').toUpperCase();
  const classes = status === 'OUT SLA' || status === 'CANCELED'
    ? 'border-red-500/30 bg-red-500/10 text-red-300'
    : status === 'IN SLA' || status === 'CLOSED'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return (
    <span className={`inline-flex min-w-[62px] justify-center rounded-md border px-2 py-0.5 text-[10px] font-bold ${classes}`}>
      {status}
    </span>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
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
    years: [],
    months: [],
    nops: [],
    clusters: [],
    categories: [],
    sla_statuses: [],
    ticket_statuses: [],
    backup_sukses: [],
    rc_categories: [],
  });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedNop, setSelectedNop] = useState('');
  const [filters, setFilters] = useState({
    cluster_to: '',
    kategori_tt: '',
    sla_status: '',
    ticket_swfm_status: '',
    backup_sukses: '',
    rc_category: '',
    is_escalate: '',
  });
  const [dashboard, setDashboard] = useState(null);
  const [tickets, setTickets] = useState({ items: [], total: 0, page: 1, limit: TABLE_LIMIT, total_pages: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketDetail, setTicketDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);

  const loadFilterOptions = useCallback(async () => {
    try {
      const data = await fetchTicketingFilters();
      setFilterOptions(data);
      const defaultStartDate = toDateInput(data.default_start_date || data.min_date);
      const defaultEndDate = toDateInput(data.default_end_date || data.max_date);
      if (defaultStartDate && defaultEndDate) {
        setStartDate((current) => current || defaultStartDate);
        setEndDate((current) => current || defaultEndDate);
      }
      setError('');
      return data;
    } catch (err) {
      console.error('Ticketing filters failed:', err);
      setError(filterErrorMessage(err));
      return null;
    }
  }, []);

  useEffect(() => {
    loadFilterOptions();
  }, [loadFilterOptions]);

  const queryParams = useMemo(() => ({
    start_date: startDate || undefined,
    end_date: endDate || undefined,
    tahun: selectedYear || undefined,
    bulan: selectedMonth || undefined,
    nop: selectedNop || undefined,
    cluster_to: filters.cluster_to || undefined,
    kategori_tt: filters.kategori_tt || undefined,
    sla_status: filters.sla_status || undefined,
    ticket_swfm_status: filters.ticket_swfm_status || undefined,
    backup_sukses: filters.backup_sukses || undefined,
    rc_category: filters.rc_category || undefined,
    is_escalate: filters.is_escalate || undefined,
  }), [endDate, filters, selectedMonth, selectedNop, selectedYear, startDate]);

  const loadData = useCallback(async () => {
    if (!startDate && !endDate && !selectedYear) return;
    setLoading(true);
    setError('');
    try {
      const [dashboardData, ticketData] = await Promise.all([
        fetchTicketingDashboard(queryParams),
        fetchTicketingTickets({ ...queryParams, q: search || undefined, page, limit: TABLE_LIMIT }),
      ]);
      setDashboard(dashboardData);
      setTickets(ticketData);
    } catch (err) {
      console.error('Ticketing dashboard failed:', err);
      setError('Gagal memuat data Ticketing.');
    } finally {
      setLoading(false);
    }
  }, [endDate, page, queryParams, search, selectedYear, startDate]);

  const handleRefresh = useCallback(async () => {
    await loadFilterOptions();
    if (startDate || endDate || selectedYear) {
      await loadData();
    }
  }, [endDate, loadData, loadFilterOptions, selectedYear, startDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [queryParams, search]);

  useEffect(() => {
    if (!selectedTicket) {
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

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const summary = dashboard?.summary;
  const ticketCategory = summary?.ticket_category || { bps: 0, ts: 0, total: 0 };

  const handleExportCsv = () => {
    const header = ['ticket_number_swfm', 'ticket_number_inap', 'site_id', 'site_name', 'cluster_to', 'kategori_tt', 'sla_status', 'ticket_swfm_status', 'created_at'];
    const rows = tickets.items.map((row) => header.map((key) => JSON.stringify(row[key] ?? '')).join(','));
    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ticketing-current-page.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] bg-gradient-to-r from-[var(--bg-base)] via-[var(--bg-surface)] to-[var(--bg-base)] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="flex size-9 items-center justify-center rounded-lg border border-[var(--border-light)] text-[var(--text-muted)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)]"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="flex size-10 items-center justify-center rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/10">
              <TicketCheck className="size-5 text-[var(--primary-light)]" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Ticketing</h1>
              <p className="text-xs text-[var(--text-muted)]">Ticket Fault Center</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p className="hidden font-mono text-xs text-[var(--text-muted)] md:block">
              Updated: {formatDateTime(summary?.last_created_at)}
            </p>
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-light)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)]"
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
          </div>
        </div>
      </header>
      <Breadcrumb />

      <main className="flex-1 space-y-4 overflow-auto p-5">
        <section className="glass-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Filter className="size-4 text-[var(--primary-light)]" />
              <h2 className="text-sm font-semibold">Global Filter</h2>
            </div>
            <button
              type="button"
              aria-expanded={!filtersCollapsed}
              aria-controls="ticketing-global-filters"
              onClick={() => setFiltersCollapsed((value) => !value)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-light)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)]"
            >
              {filtersCollapsed ? (
                <>
                  <ChevronDown className="size-3.5" />
                  Show Filter
                </>
              ) : (
                <>
                  <ChevronUp className="size-3.5" />
                  Collapse Filter
                </>
              )}
            </button>
          </div>
          {!filtersCollapsed && (
            <div id="ticketing-global-filters" className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <DateFilter id="ticketing-start-date" label="Date Range" value={startDate} onChange={setStartDate} />
              <DateFilter id="ticketing-end-date" label="Date End" value={endDate} onChange={setEndDate} />
              <SelectFilter id="ticketing-year" label="Tahun / Bulan" value={selectedYear} onChange={setSelectedYear} options={filterOptions.years} />
              <SelectFilter id="ticketing-month" label="Bulan" value={selectedMonth} onChange={setSelectedMonth} options={filterOptions.months} />
              <SelectFilter id="ticketing-nop" label="NOP" value={selectedNop} onChange={setSelectedNop} options={filterOptions.nops} />
              <SelectFilter id="ticketing-cluster" label="Cluster TO" value={filters.cluster_to} onChange={(value) => updateFilter('cluster_to', value)} options={filterOptions.clusters} />
              <SelectFilter id="ticketing-category" label="Kategori Ticket" value={filters.kategori_tt} onChange={(value) => updateFilter('kategori_tt', value)} options={filterOptions.categories} />
              <SelectFilter id="ticketing-sla" label="SLA Status" value={filters.sla_status} onChange={(value) => updateFilter('sla_status', value)} options={filterOptions.sla_statuses} />
              <SelectFilter id="ticketing-status" label="Ticket Status" value={filters.ticket_swfm_status} onChange={(value) => updateFilter('ticket_swfm_status', value)} options={filterOptions.ticket_statuses} />
              <SelectFilter id="ticketing-backup" label="Backup Sukses" value={filters.backup_sukses} onChange={(value) => updateFilter('backup_sukses', value)} options={filterOptions.backup_sukses} />
              <SelectFilter id="ticketing-rc-category" label="RC Category" value={filters.rc_category} onChange={(value) => updateFilter('rc_category', value)} options={filterOptions.rc_categories} />
              <SelectFilter id="ticketing-escalate" label="Is Escalate" value={filters.is_escalate} onChange={(value) => updateFilter('is_escalate', value)} options={['true', 'false']} />
            </div>
          )}
        </section>

        {error && (
          <section className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </section>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Scorecard title="Total Tickets" value={formatNumber(summary?.total_tickets)} subtitle="Filtered tickets" icon={TicketCheck} accent={COLORS.bps} glow="rgba(59,130,246,0.14)" />
          <Scorecard title="Ticket Category" subtitle="BPS / TS ticket" icon={ListChecks} accent={COLORS.ts} glow="rgba(16,185,129,0.14)">
            <div className="mt-1 flex items-baseline gap-3 font-mono text-lg font-bold">
              <span style={{ color: COLORS.bps }}>BPS: {formatNumber(ticketCategory.bps)}</span>
              <span style={{ color: COLORS.ts }}>TS: {formatNumber(ticketCategory.ts)}</span>
            </div>
          </Scorecard>
          <Scorecard title="OUT SLA Rate" value={formatPercent(summary?.out_sla_rate)} subtitle={`${formatNumber(summary?.out_sla_tickets)} OUT SLA`} icon={ShieldX} accent={COLORS.danger} glow="rgba(239,68,68,0.14)" />
          <Scorecard
            title="Visitation Rate"
            value={formatPercent(summary?.visitation_rate)}
            subtitle={`${formatNumber(summary?.visitation_tickets)} / ${formatNumber(summary?.total_tickets)} Visit site`}
            icon={MapPin}
            accent={COLORS.violet}
            glow="rgba(139,92,246,0.14)"
          />
          <Scorecard title="Backup Sukses Rate" value={formatPercent(summary?.backup_sukses_rate)} subtitle={`${formatNumber(summary?.backup_sukses_tickets)} BU Genset`} icon={ShieldCheck} accent={COLORS.success} glow="rgba(16,185,129,0.14)" />
          <Scorecard title="Escalated" value={formatNumber(summary?.escalated_tickets)} subtitle={formatPercent(summary?.escalated_rate)} icon={AlertTriangle} accent={COLORS.warning} glow="rgba(245,158,11,0.14)" />
          <Scorecard title="Manual Takeover" value={formatNumber(summary?.manual_takeover_tickets)} subtitle={formatPercent(summary?.manual_takeover_rate)} icon={Zap} accent={COLORS.total} glow="rgba(251,191,36,0.14)" />
          <Scorecard title="Response P90" value={formatMinutes(summary?.p90_response_minutes)} subtitle="Clean response time" icon={Clock3} accent={COLORS.bps} glow="rgba(59,130,246,0.14)" />
          <Scorecard title="Closed Rate" value={formatPercent(summary?.closed_rate)} subtitle={`${formatNumber(summary?.closed_tickets)} closed`} icon={CircleCheck} accent={COLORS.success} glow="rgba(16,185,129,0.14)" />
          <Scorecard title="Canceled" value={formatNumber(summary?.canceled_tickets)} subtitle="Canceled tickets" icon={ShieldX} accent={COLORS.danger} glow="rgba(239,68,68,0.14)" />
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)_minmax(280px,0.65fr)]">
          <ChartCard title="Daily Trend Ticket by Kategori" icon={TrendingUp}>
            {dashboard?.trend?.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={dashboard.trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip content={<TicketingTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey="bps" name="BPS" stroke={COLORS.bps} strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="ts" name="TS" stroke={COLORS.ts} strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <ChartEmpty />}
          </ChartCard>

          <ChartCard title="SLA Status Distribution" icon={ShieldCheck}>
            {dashboard?.sla_distribution?.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dashboard.sla_distribution} layout="vertical" margin={{ left: 12, right: 12 }}>
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis type="category" dataKey="label" width={92} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip content={<TicketingTooltip />} />
                  <Bar dataKey="tickets" name="Tickets" radius={[0, 4, 4, 0]}>
                    {dashboard.sla_distribution.map((entry, index) => (
                      <Cell key={entry.label} fill={[COLORS.success, COLORS.danger, COLORS.warning, COLORS.muted][index % 4]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartEmpty />}
          </ChartCard>

          <ChartCard title="Visiting Site vs Backup Genset" icon={BarChart3}>
            {dashboard?.visiting_backup_distribution?.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dashboard.visiting_backup_distribution.slice(0, 6)} layout="vertical" margin={{ left: 12, right: 12 }}>
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis type="category" dataKey="label" width={92} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip content={<TicketingTooltip />} />
                  <Legend />
                  <Bar dataKey="visiting_site" name="Visiting Site" fill={COLORS.bps} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="backup_genset" name="Backup Genset" fill={COLORS.success} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartEmpty />}
          </ChartCard>
        </section>

        <section className="grid gap-3 xl:grid-cols-2">
          <ChartCard title={dashboard?.location_breakdown_title || 'Kabupaten/Kota Distribution'} icon={BarChart3}>
            {dashboard?.location_breakdown?.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dashboard.location_breakdown} layout="vertical" margin={{ left: 12 }}>
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip content={<TicketingTooltip />} />
                  <Bar dataKey="tickets" name="Tickets" fill={COLORS.bps} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartEmpty />}
          </ChartCard>

          <ChartCard title="RC Category Pareto" icon={ListChecks}>
            {dashboard?.rc_category_pareto?.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dashboard.rc_category_pareto}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip content={<TicketingTooltip />} />
                  <Bar dataKey="tickets" name="Tickets" fill={COLORS.bps} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="cumulative_rate" position="top" formatter={(value) => `${value}%`} fontSize={10} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartEmpty />}
          </ChartCard>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <ChartCard title="Top Problem Sites" icon={AlertTriangle}>
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
          </ChartCard>

          <section className="glass-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
              <div className="flex items-center gap-2">
                <ListChecks className="size-4 text-[var(--primary-light)]" />
                <h2 className="text-sm font-semibold">Ticket List</h2>
              </div>
              <label className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search ticket number, site, summary..."
                  className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-elevated)] py-2 pl-9 pr-3 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                />
              </label>
            </div>
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={page <= 1 || loading}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-light)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="size-3.5" />
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(prev + 1, tickets.total_pages || prev))}
                  disabled={page >= (tickets.total_pages || 1) || loading}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-light)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
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
