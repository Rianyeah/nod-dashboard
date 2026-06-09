import { Component, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BellRing,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  Filter,
  ListChecks,
  MapPin,
  Radio,
  Search,
  ShieldAlert,
  Siren,
  Users,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Breadcrumb from '../components/Breadcrumb';
import { useDashboardThemeTokens } from '../hooks/useDashboardThemeTokens';
import {
  DashboardChartPanel,
  DashboardChartTooltip,
  DashboardKpiCard,
  DashboardStatusBadge,
} from '../components/ui/DashboardPrimitives';
import {
  fetchImpactServiceAlarmDetail,
  fetchImpactServiceAlarms,
  fetchImpactServiceDailyTrend,
  fetchImpactServiceDistributions,
  fetchImpactServiceFilters,
  fetchImpactServiceLast7DaysTrend,
  fetchImpactServiceSummary,
  fetchImpactServiceTopAlarms,
  fetchImpactServiceTopSites,
} from '../services/api';
import { formatNumber } from '../utils/formatters';

const STATUS_COLORS = {
  open: '#EF4444',
  clear: '#10B981',
  total: '#60A5FA',
  critical: '#DC2626',
  warning: '#F59E0B',
};

const TABLE_LIMIT = 20;

class ImpactServiceErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Impact Service render failed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--bg-base)] p-6 text-[var(--text-primary)]">
          <section className="glass-card mx-auto mt-16 max-w-xl p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="size-10 rounded-xl border border-red-500/20 bg-red-500/10 flex items-center justify-center">
                <BellRing className="size-5 text-red-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Impact Service</h1>
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

function formatDateLabel(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`));
}

function asDisplay(value) {
  if (value == null || value === '') return '-';
  return String(value);
}

function getImpactDelta(current, previous) {
  const currentValue = Number(current) || 0;
  const previousValue = Number(previous) || 0;
  const delta = currentValue - previousValue;
  const rate = previousValue === 0 ? null : (delta / Math.abs(previousValue)) * 100;
  return { delta, rate };
}

function formatImpactDelta({ delta, rate }) {
  const deltaSign = delta > 0 ? '+' : delta < 0 ? '-' : '';
  const deltaLabel = `${deltaSign}${formatNumber(Math.abs(delta))}`;
  const rateLabel = rate == null ? '-' : `${rate > 0 ? '+' : rate < 0 ? '-' : ''}${Math.abs(rate).toFixed(1).replace('.', ',')}%`;
  return `${deltaLabel} (${rateLabel})`;
}

function Scorecard({ title, value, delta, comparisonLabel, icon: Icon, accent, glow }) {
  const deltaTone = delta.delta > 0
    ? 'text-emerald-400'
    : delta.delta < 0
      ? 'text-red-400'
      : 'text-[var(--text-muted)]';

  return (
    <DashboardKpiCard title={title} value={value} icon={Icon} accent={accent} glow={glow} className="animate-fade-in">
      <p className="mt-2 truncate font-mono text-[28px] font-bold leading-none tabular-nums tracking-tight" style={{ color: accent }}>
        {value}
      </p>
      <div className="mt-2 space-y-0.5 text-[11px] font-semibold leading-snug">
        <p className={`font-mono tabular-nums ${deltaTone}`}>{formatImpactDelta(delta)}</p>
        <p className="text-[var(--text-muted)]">{comparisonLabel}</p>
      </div>
    </DashboardKpiCard>
  );
}

function ChartCard({ title, icon: Icon, children, action }) {
  return (
    <DashboardChartPanel title={title} icon={Icon} action={action} className="animate-fade-in">
      {children}
    </DashboardChartPanel>
  );
}

function ChartEmpty({ label = 'Data belum tersedia untuk filter ini.' }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]/40">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

function ImpactTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <DashboardChartTooltip active={active} payload={payload} label={label} valueFormatter={formatNumber} />
  );
}

function StatusBadge({ value }) {
  const status = String(value || '').toUpperCase();
  const isOpen = status === 'OPEN';

  return <DashboardStatusBadge tone={isOpen ? 'danger' : status === 'CLEAR' ? 'success' : 'neutral'}>{status || '-'}</DashboardStatusBadge>;
}

function SeverityBadge({ value }) {
  const severity = String(value || '');

  return <DashboardStatusBadge tone={severity === 'Critical' ? 'danger' : severity === 'Major' ? 'warning' : 'info'}>{severity || '-'}</DashboardStatusBadge>;
}

function AlarmDetailModal({ detail, loading, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const fields = [
    ['Tanggal', detail?.tanggal ? formatDateLabel(detail.tanggal) : '-'],
    ['Site ID', detail?.site_id],
    ['Site Name', detail?.site_name],
    ['NOP', detail?.nop],
    ['Alarm Name', detail?.alarm_name],
    ['Alarm Type', detail?.alarm_type],
    ['Category', detail?.category],
    ['Severity', detail?.severity],
    ['Status', detail?.status],
    ['SOW', detail?.sow],
    ['Aging', detail?.aging == null ? '-' : `${detail.aging} hari`],
    ['Aging Range', detail?.aging_range],
    ['Ticket No', detail?.ticket_no],
    ['Plan Action', detail?.plan_action],
    ['PIC Officer', detail?.pic_officer],
    ['PIC Onsite', detail?.pic_onsite],
    ['Root Cause Analyst', detail?.root_cause_analyst],
    ['Date Cleared', detail?.date_cleared],
    ['Latitude', detail?.latitude],
    ['Longitude', detail?.longitude],
    ['Comment', detail?.comment],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-scrim)] p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Alarm Detail ${detail?.id || ''}`}
        className="glass-card max-h-[86vh] w-full max-w-4xl overflow-hidden"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold">Alarm Detail</p>
            <h2 className="mt-1 truncate text-lg font-bold text-[var(--text-primary)]">
              {loading ? 'Loading alarm...' : asDisplay(detail?.alarm_name)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
            aria-label="Close alarm detail"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[calc(86vh-82px)] overflow-y-auto p-5">
          {loading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {Array.from({ length: 10 }, (_, i) => <div key={i} className="skeleton h-14 rounded-lg" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {fields.map(([label, value]) => (
                <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/45 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold">{label}</p>
                  <p className="mt-1 break-words text-sm text-[var(--text-primary)]">{asDisplay(value)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ImpactServiceDashboard() {
  const navigate = useNavigate();
  const themeTokens = useDashboardThemeTokens();
  const [filterOptions, setFilterOptions] = useState({
    min_date: null,
    max_date: null,
    today: null,
    default_date: null,
    has_today_data: false,
    nops: [],
  });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedNop, setSelectedNop] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState(null);
  const [dailyTrend, setDailyTrend] = useState([]);
  const [distributions, setDistributions] = useState({
    by_severity: [],
    by_category: [],
    by_aging_range: [],
    by_sow: [],
    by_nop: [],
  });
  const [topAlarms, setTopAlarms] = useState([]);
  const [topSites, setTopSites] = useState([]);
  const [alarms, setAlarms] = useState({ items: [], total: 0, page: 1, limit: TABLE_LIMIT, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAlarmId, setSelectedAlarmId] = useState(null);
  const [selectedAlarmDetail, setSelectedAlarmDetail] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchImpactServiceFilters()
      .then((filters) => {
        if (cancelled) return;
        if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
          throw new Error('Invalid Impact Service filter response');
        }

        const normalizedFilters = {
          min_date: filters?.min_date || null,
          max_date: filters?.max_date || null,
          today: filters?.today || null,
          default_date: filters?.default_date || null,
          has_today_data: Boolean(filters?.has_today_data),
          nops: Array.isArray(filters?.nops) ? filters.nops : [],
        };
        if (!normalizedFilters.max_date) {
          throw new Error('Impact Service filter response is missing max_date');
        }

        const defaultDate = normalizedFilters.default_date || normalizedFilters.max_date;
        setFilterOptions(normalizedFilters);
        setStartDate(defaultDate);
        setEndDate(defaultDate);
        setFiltersLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to load impact service filters:', err);
        if (!cancelled) {
          setError('Gagal memuat filter Impact Service.');
          setLoading(false);
          setFiltersLoaded(true);
        }
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [startDate, endDate, selectedNop, statusFilter, severityFilter, searchTerm]);

  const queryParams = useMemo(() => ({
    start_date: startDate,
    end_date: endDate,
    nop: selectedNop || undefined,
    status: statusFilter || undefined,
    severity: severityFilter || undefined,
    q: searchTerm.trim() || undefined,
    page,
    limit: TABLE_LIMIT,
  }), [endDate, page, searchTerm, selectedNop, severityFilter, startDate, statusFilter]);

  const last7DaysParams = useMemo(() => ({
    nop: selectedNop || undefined,
  }), [selectedNop]);

  const hasValidDateRange = Boolean(startDate && endDate && startDate <= endDate);

  const handleStartDateChange = useCallback((event) => {
    const nextStartDate = event.target.value;
    setStartDate(nextStartDate);
    setEndDate((currentEndDate) => (
      currentEndDate && nextStartDate && currentEndDate < nextStartDate ? nextStartDate : currentEndDate
    ));
  }, []);

  const handleEndDateChange = useCallback((event) => {
    const nextEndDate = event.target.value;
    setEndDate(nextEndDate);
    setStartDate((currentStartDate) => (
      currentStartDate && nextEndDate && currentStartDate > nextEndDate ? nextEndDate : currentStartDate
    ));
  }, []);

  useEffect(() => {
    if (!hasValidDateRange) return;
    let cancelled = false;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    Promise.all([
      fetchImpactServiceSummary(queryParams),
      fetchImpactServiceLast7DaysTrend(last7DaysParams).catch(() => fetchImpactServiceDailyTrend(queryParams)),
      fetchImpactServiceDistributions(queryParams),
      fetchImpactServiceTopAlarms(queryParams),
      fetchImpactServiceTopSites(queryParams),
      fetchImpactServiceAlarms(queryParams),
    ])
      .then(([nextSummary, trend, nextDistributions, nextTopAlarms, nextTopSites, nextAlarms]) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setDailyTrend(trend);
        setDistributions(nextDistributions);
        setTopAlarms(nextTopAlarms);
        setTopSites(nextTopSites);
        setAlarms(nextAlarms);
      })
      .catch((err) => {
        console.error('Failed to load impact service dashboard:', err);
        if (!cancelled) setError('Gagal memuat data Impact Service.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [hasValidDateRange, last7DaysParams, queryParams]);

  useEffect(() => {
    if (!selectedAlarmId || !hasValidDateRange) return;
    let cancelled = false;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModalLoading(true);
    setSelectedAlarmDetail(null);
    fetchImpactServiceAlarmDetail(selectedAlarmId, queryParams)
      .then((detail) => {
        if (!cancelled) setSelectedAlarmDetail(detail);
      })
      .catch((err) => {
        console.error('Failed to load impact service alarm detail:', err);
        if (!cancelled) setSelectedAlarmId(null);
      })
      .finally(() => {
        if (!cancelled) setModalLoading(false);
      });

    return () => { cancelled = true; };
  }, [hasValidDateRange, queryParams, selectedAlarmId]);

  const closeModal = useCallback(() => {
    setSelectedAlarmId(null);
    setSelectedAlarmDetail(null);
  }, []);

  const isSingleDayRange = startDate === endDate;
  const comparisonLabel = isSingleDayRange ? 'vs hari sebelumnya' : 'vs periode sebelumnya';

  const scorecards = [
    {
      title: 'Alarm Impact Service',
      value: formatNumber(summary?.total_alarms),
      delta: getImpactDelta(summary?.total_alarms, summary?.previous_total_alarms),
      comparisonLabel,
      icon: Siren,
      accent: STATUS_COLORS.total,
      glow: 'rgba(96, 165, 250, 0.15)',
    },
    {
      title: 'Impacted Site',
      value: formatNumber(summary?.impacted_sites),
      delta: getImpactDelta(summary?.impacted_sites, summary?.previous_impacted_sites),
      comparisonLabel,
      icon: Radio,
      accent: '#A78BFA',
      glow: 'rgba(167, 139, 250, 0.15)',
    },
    {
      title: 'OPEN Alarm',
      value: formatNumber(summary?.open_alarms),
      delta: getImpactDelta(summary?.open_alarms, summary?.previous_open_alarms),
      comparisonLabel,
      icon: AlertTriangle,
      accent: STATUS_COLORS.open,
      glow: 'rgba(239, 68, 68, 0.14)',
    },
    {
      title: 'CLEAR Alarm',
      value: formatNumber(summary?.clear_alarms),
      delta: getImpactDelta(summary?.clear_alarms, summary?.previous_clear_alarms),
      comparisonLabel,
      icon: CircleCheck,
      accent: STATUS_COLORS.clear,
      glow: 'rgba(16, 185, 129, 0.15)',
    },
    {
      title: 'SOW TSEL',
      value: formatNumber(summary?.sow_tsel),
      delta: getImpactDelta(summary?.sow_tsel, summary?.previous_sow_tsel),
      comparisonLabel,
      icon: ShieldAlert,
      accent: STATUS_COLORS.warning,
      glow: 'rgba(245, 158, 11, 0.15)',
    },
  ];

  const nopOrSiteData = selectedNop
    ? topSites.map((site) => ({
      label: site.site_id,
      total: site.total,
      open: site.open,
      clear: site.clear,
    }))
    : distributions.by_nop;

  const totalPages = alarms.total_pages || 0;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--bg-base)]">
      <header className="relative border-b border-[var(--border)] bg-gradient-to-r from-[var(--bg-base)] via-[var(--bg-surface)] to-[var(--bg-base)]">
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border-light)] text-[var(--text-muted)] transition-colors hover:border-[var(--primary)]/30 hover:bg-[var(--primary)]/10 hover:text-[var(--primary-light)]"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="size-10 rounded-xl border border-red-500/20 bg-red-500/10 flex items-center justify-center">
              <BellRing className="size-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">Impact Service</h1>
              <p className="text-[11px] text-[var(--text-muted)]">Alarm operational dashboard - {formatDateLabel(startDate)} sampai {formatDateLabel(endDate)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              Tanggal Mulai
              <input
                id="impact-start-date"
                type="date"
                value={startDate}
                min={filterOptions.min_date || undefined}
                onChange={handleStartDateChange}
                className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-elevated)] px-3 py-2 text-sm normal-case tracking-normal text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
              />
            </label>
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              Tanggal Akhir
              <input
                id="impact-end-date"
                type="date"
                value={endDate}
                min={filterOptions.min_date || undefined}
                onChange={handleEndDateChange}
                className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-elevated)] px-3 py-2 text-sm normal-case tracking-normal text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
              />
            </label>
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              <MapPin className="size-3.5" />
              NOP
              <select
                id="impact-nop"
                value={selectedNop || ''}
                onChange={(event) => setSelectedNop(event.target.value || null)}
                className="min-w-[140px] rounded-lg border border-[var(--border-light)] bg-[var(--bg-elevated)] px-3 py-2 text-sm normal-case tracking-normal text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
              >
                <option value="">Semua NOP</option>
                {(filterOptions.nops || []).map((nop) => (
                  <option key={nop} value={nop}>{nop}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>

      <Breadcrumb />

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {filtersLoaded && startDate && endDate && !hasValidDateRange && (
          <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Rentang tanggal tidak valid. Pastikan tanggal mulai tidak melebihi tanggal akhir.
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {loading && !summary ? (
            Array.from({ length: 5 }, (_, index) => <div key={index} className="skeleton h-[86px] rounded-xl" />)
          ) : (
            scorecards.map((card) => <Scorecard key={card.title} {...card} />)
          )}
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Last 7 Days Trend" icon={Activity}>
            {dailyTrend.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={dailyTrend} margin={{ top: 12, right: 18, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={themeTokens.chartGrid} vertical={false} />
                  <XAxis dataKey="tanggal" tickFormatter={formatDateLabel} tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <YAxis tick={{ fontSize: 10, fill: themeTokens.axisTick }} width={44} />
                  <Tooltip content={<ImpactTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="open" name="OPEN" stackId="status" fill={STATUS_COLORS.open} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="clear" name="CLEAR" stackId="status" fill={STATUS_COLORS.clear} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="total" position="top" formatter={formatNumber} fill="var(--text-muted)" fontSize={10} />
                  </Bar>
                  <Line type="monotone" dataKey="total" name="Total" stroke={STATUS_COLORS.total} strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <ChartEmpty />}
          </ChartCard>

          <ChartCard title={selectedNop ? 'Top Impacted Sites' : 'NOP Contribution'} icon={Users}>
            {nopOrSiteData.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={nopOrSiteData.slice(0, 10)} layout="vertical" margin={{ top: 6, right: 22, left: 48, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={themeTokens.chartGrid} vertical={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <Tooltip content={<ImpactTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="open" name="OPEN" stackId="status" fill={STATUS_COLORS.open} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="clear" name="CLEAR" stackId="status" fill={STATUS_COLORS.clear} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartEmpty />}
          </ChartCard>

          <ChartCard title="Status by Severity" icon={ShieldAlert}>
            {distributions.by_severity.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={distributions.by_severity} layout="vertical" margin={{ top: 6, right: 22, left: 18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={themeTokens.chartGrid} vertical={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <YAxis type="category" dataKey="label" width={72} tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <Tooltip content={<ImpactTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="open" name="OPEN" stackId="status" fill={STATUS_COLORS.open} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="clear" name="CLEAR" stackId="status" fill={STATUS_COLORS.clear} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartEmpty />}
          </ChartCard>

          <ChartCard title="Category Distribution" icon={ListChecks}>
            {distributions.by_category.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={distributions.by_category.slice(0, 8)} layout="vertical" margin={{ top: 6, right: 22, left: 110, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={themeTokens.chartGrid} vertical={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <Tooltip content={<ImpactTooltip />} />
                  <Bar dataKey="total" name="Total" fill={STATUS_COLORS.total} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartEmpty />}
          </ChartCard>

          <ChartCard title="Aging Range" icon={Clock3}>
            {distributions.by_aging_range.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={distributions.by_aging_range} margin={{ top: 12, right: 18, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={themeTokens.chartGrid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <YAxis tick={{ fontSize: 10, fill: themeTokens.axisTick }} width={44} />
                  <Tooltip content={<ImpactTooltip />} />
                  <Bar dataKey="total" name="Total" fill={STATUS_COLORS.warning} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="total" position="top" formatter={formatNumber} fill="var(--text-muted)" fontSize={10} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartEmpty />}
          </ChartCard>

          <ChartCard title="Top Alarm Names" icon={BellRing}>
            {topAlarms.length ? (
              <div className="max-h-[260px] overflow-y-auto pr-1">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th className="px-2 py-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Alarm</th>
                      <th className="px-2 py-2 text-right text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Total</th>
                      <th className="px-2 py-2 text-right text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Sites</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {topAlarms.map((row) => (
                      <tr key={row.alarm_name} className="hover:bg-[var(--bg-hover)]/50">
                        <td className="px-2 py-2 text-xs font-medium text-[var(--text-primary)]">{row.alarm_name}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs text-red-400">{formatNumber(row.total)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs text-[var(--text-secondary)]">{formatNumber(row.impacted_sites)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <ChartEmpty />}
          </ChartCard>
        </section>

        <section className="glass-card overflow-hidden animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Siren className="size-4 text-[var(--primary-light)]" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-wide">Alarm Detail Table</h2>
              <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] font-mono text-[var(--text-muted)]">
                {formatNumber(alarms.total)} rows
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Cari site, alarm, ticket"
                  className="w-[220px] rounded-lg border border-[var(--border-light)] bg-[var(--bg-elevated)] py-2 pl-8 pr-3 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                aria-label="Filter status alarm"
              >
                <option value="">Semua Status</option>
                <option value="OPEN">OPEN</option>
                <option value="CLEAR">CLEAR</option>
              </select>
              <select
                value={severityFilter}
                onChange={(event) => setSeverityFilter(event.target.value)}
                className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                aria-label="Filter severity alarm"
              >
                <option value="">Semua Severity</option>
                <option value="Critical">Critical</option>
                <option value="Major">Major</option>
                <option value="Minor">Minor</option>
                <option value="Warning">Warning</option>
              </select>
              <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-[10px] text-[var(--text-muted)]">
                <Filter className="size-3" />
                {selectedNop || 'Semua NOP'}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  {['Tanggal', 'Site ID', 'Site Name', 'NOP', 'Alarm Name', 'Category', 'Severity', 'Aging', 'Status', 'SOW', 'Comment'].map((head) => (
                    <th key={head} className="sticky top-0 z-10 whitespace-nowrap bg-[var(--bg-elevated)] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {loading ? (
                  Array.from({ length: 8 }, (_, index) => (
                    <tr key={index}>
                      <td colSpan={11} className="px-3 py-2"><div className="skeleton h-9 rounded-lg" /></td>
                    </tr>
                  ))
                ) : alarms.items.length ? (
                  alarms.items.map((row) => (
                    <tr
                      key={row.id}
                      data-testid="impact-alarm-row"
                      onClick={() => setSelectedAlarmId(row.id)}
                      className="cursor-pointer transition-colors hover:bg-[var(--bg-hover)]/60"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--text-secondary)]">{formatDateLabel(row.tanggal)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-semibold text-[var(--primary-light)]">{asDisplay(row.site_id)}</td>
                      <td className="min-w-[180px] px-3 py-2.5 text-xs text-[var(--text-primary)]">{asDisplay(row.site_name)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--text-secondary)]">{asDisplay(row.nop)}</td>
                      <td className="min-w-[220px] px-3 py-2.5 text-xs font-medium text-[var(--text-primary)]">{asDisplay(row.alarm_name)}</td>
                      <td className="min-w-[180px] px-3 py-2.5 text-xs text-[var(--text-secondary)]">{asDisplay(row.category)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5"><SeverityBadge value={row.severity} /></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--text-secondary)]">{row.aging == null ? asDisplay(row.aging_range) : `${row.aging} hari`}</td>
                      <td className="whitespace-nowrap px-3 py-2.5"><StatusBadge value={row.status} /></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--text-secondary)]">{asDisplay(row.sow)}</td>
                      <td className="min-w-[220px] px-3 py-2.5 text-xs text-[var(--text-secondary)]">{asDisplay(row.comment)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={11} className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">
                      Tidak ada alarm untuk filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
            <p className="text-[11px] text-[var(--text-muted)]">
              Page {formatNumber(alarms.page || page)} of {formatNumber(totalPages || 1)}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1 || loading}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-light)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="size-3.5" />
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((value) => (totalPages ? Math.min(totalPages, value + 1) : value + 1))}
                disabled={loading || (totalPages > 0 && page >= totalPages)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-light)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
        </section>
      </main>

      {selectedAlarmId && (
        <AlarmDetailModal detail={selectedAlarmDetail} loading={modalLoading} onClose={closeModal} />
      )}
    </div>
  );
}

export default function ImpactServicePage() {
  return (
    <ImpactServiceErrorBoundary>
      <ImpactServiceDashboard />
    </ImpactServiceErrorBoundary>
  );
}
