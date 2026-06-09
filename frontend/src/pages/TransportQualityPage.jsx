import { Component, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Filter,
  Gauge,
  Network,
  Radio,
  Route,
  ShieldAlert,
  Signal,
  Timer,
  Waves,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { useDashboardThemeTokens } from '../hooks/useDashboardThemeTokens';
import {
  DashboardChartPanel,
  DashboardChartTooltip,
  DashboardKpiCard,
  DashboardStatusBadge,
} from '../components/ui/DashboardPrimitives';
import {
  fetchTransportQualityBreakdowns,
  fetchTransportQualityDistributions,
  fetchTransportQualityFilters,
  fetchTransportQualityPrioritySites,
  fetchTransportQualitySummary,
  fetchTransportQualityTrend,
} from '../services/api';
import { formatNumber } from '../utils/formatters';

const PL_THRESHOLD = 1;
const LATENCY_THRESHOLD = 5;
const TABLE_LIMIT = 20;

const QUALITY_COLORS = {
  packetLoss: '#EF4444',
  latency: '#F59E0B',
  jitter: '#22D3EE',
  p1: '#DC2626',
  p2: '#F59E0B',
  normal: '#10B981',
  total: '#60A5FA',
  muted: '#94A3B8',
};

class TransportQualityErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Transport Quality render failed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--bg-base)] p-6 text-[var(--text-primary)]">
          <section className="glass-card mx-auto mt-16 max-w-xl p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10">
                <ShieldAlert className="size-5 text-red-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Transport Quality</h1>
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

function formatMetric(value, digits = 2, suffix = '') {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return `${Number(value).toFixed(digits).replace('.', ',')}${suffix}`;
}

function asDisplay(value) {
  if (value == null || value === '') return '-';
  return String(value);
}

function optionList(values = []) {
  return values.filter((value) => value != null && value !== '');
}

function Scorecard({ title, value, subtitle, icon: Icon, accent, glow }) {
  return (
    <DashboardKpiCard title={title} value={value} subtitle={subtitle} icon={Icon} accent={accent} glow={glow} />
  );
}

function ChartCard({ title, icon: Icon, children, action }) {
  return (
    <DashboardChartPanel title={title} icon={Icon} action={action}>
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

function TransportTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <DashboardChartTooltip active={active} payload={payload} label={label} valueFormatter={formatNumber} />
  );
}

function SelectFilter({ id, label, value, onChange, options, placeholder = 'Semua' }) {
  return (
    <label className="flex min-w-[150px] flex-1 flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
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

function PriorityBadge({ value }) {
  const priority = String(value || 'Normal').toUpperCase();
  return (
    <DashboardStatusBadge tone={priority === 'P1' ? 'danger' : priority === 'P2' ? 'warning' : 'success'}>{priority}</DashboardStatusBadge>
  );
}

function StatusBadge({ value, fail }) {
  const label = String(value || '-').toUpperCase();
  const isFail = fail || label === 'FAIL';
  return (
    <DashboardStatusBadge tone={isFail ? 'danger' : label === 'PASS' ? 'success' : 'neutral'}>{label}</DashboardStatusBadge>
  );
}

function MetricCell({ value, bad, suffix = '', digits = 2 }) {
  return (
    <span className={`font-mono text-xs font-semibold tabular-nums ${bad ? 'text-red-300' : 'text-[var(--text-secondary)]'}`}>
      {formatMetric(value, digits, suffix)}
    </span>
  );
}

function TransportQualityDashboard() {
  const navigate = useNavigate();
  const themeTokens = useDashboardThemeTokens();
  const [filterOptions, setFilterOptions] = useState({
    periods: [],
    nops: [],
    kabupaten: [],
    transport_types: [],
    thi_statuses: [],
    distribution_pl: [],
    pl_status_0_1_pct: [],
    distribution_lat: [],
    jitter_statuses: [],
  });
  const [selectedDate, setSelectedDate] = useState('');
  const [filters, setFilters] = useState({
    nop: '',
    kabupaten: '',
    transport_type: '',
    thi_status: '',
    distribution_pl: '',
    pl_status_0_1_pct: '',
    distribution_lat: '',
    jitter_status: '',
  });
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [distributions, setDistributions] = useState({ by_packet_loss: [], by_latency: [], by_jitter: [] });
  const [breakdowns, setBreakdowns] = useState({ by_nop: [], by_kabupaten: [], by_transport_type: [] });
  const [prioritySites, setPrioritySites] = useState({ items: [], total: 0, page: 1, limit: TABLE_LIMIT, total_pages: 0 });
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchTransportQualityFilters()
      .then((data) => {
        if (cancelled) return;
        const periods = Array.isArray(data?.periods) ? data.periods : [];
        const latestDate = data?.max_date || periods[0]?.date || '';
        setFilterOptions({
          periods,
          nops: data?.nops || [],
          kabupaten: data?.kabupaten || [],
          transport_types: data?.transport_types || [],
          thi_statuses: data?.thi_statuses || [],
          distribution_pl: data?.distribution_pl || [],
          pl_status_0_1_pct: data?.pl_status_0_1_pct || [],
          distribution_lat: data?.distribution_lat || [],
          jitter_statuses: data?.jitter_statuses || [],
        });
        setSelectedDate(latestDate);
        setFiltersLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to load Transport Quality filters:', err);
        if (!cancelled) {
          setError('Gagal memuat filter Transport Quality.');
          setLoading(false);
          setFiltersLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const baseQueryParams = useMemo(() => ({
    date: selectedDate || undefined,
    nop: filters.nop || undefined,
    kabupaten: filters.kabupaten || undefined,
    transport_type: filters.transport_type || undefined,
    thi_status: filters.thi_status || undefined,
    distribution_pl: filters.distribution_pl || undefined,
    pl_status_0_1_pct: filters.pl_status_0_1_pct || undefined,
    distribution_lat: filters.distribution_lat || undefined,
    jitter_status: filters.jitter_status || undefined,
  }), [filters, selectedDate]);

  const tableQueryParams = useMemo(() => ({
    ...baseQueryParams,
    page,
    limit: TABLE_LIMIT,
  }), [baseQueryParams, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [baseQueryParams]);

  useEffect(() => {
    if (!filtersLoaded || !selectedDate) return;
    let cancelled = false;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    Promise.all([
      fetchTransportQualitySummary(baseQueryParams),
      fetchTransportQualityTrend(baseQueryParams),
      fetchTransportQualityDistributions(baseQueryParams),
      fetchTransportQualityBreakdowns(baseQueryParams),
      fetchTransportQualityPrioritySites(tableQueryParams),
    ])
      .then(([nextSummary, nextTrend, nextDistributions, nextBreakdowns, nextPrioritySites]) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setTrend(Array.isArray(nextTrend) ? nextTrend : []);
        setDistributions(nextDistributions || { by_packet_loss: [], by_latency: [], by_jitter: [] });
        setBreakdowns(nextBreakdowns || { by_nop: [], by_kabupaten: [], by_transport_type: [] });
        setPrioritySites(nextPrioritySites || { items: [], total: 0, page: 1, limit: TABLE_LIMIT, total_pages: 0 });
      })
      .catch((err) => {
        console.error('Failed to load Transport Quality dashboard:', err);
        if (!cancelled) setError('Gagal memuat data Transport Quality.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [baseQueryParams, filtersLoaded, selectedDate, tableQueryParams]);

  const selectedPeriod = useMemo(
    () => filterOptions.periods.find((period) => period.date === selectedDate),
    [filterOptions.periods, selectedDate],
  );

  const setFilterValue = useCallback((key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  }, []);

  const scorecards = useMemo(() => [
    {
      title: 'Total Sites',
      value: formatNumber(summary?.total_sites || 0),
      subtitle: `${formatNumber(summary?.total_records || 0)} records selected`,
      icon: Network,
      accent: QUALITY_COLORS.total,
      glow: 'rgba(96, 165, 250, 0.12)',
    },
    {
      title: 'PL > 1%',
      value: formatNumber(summary?.pl_over_1_sites || 0),
      subtitle: `threshold packet loss ${PL_THRESHOLD}%`,
      icon: Signal,
      accent: QUALITY_COLORS.packetLoss,
      glow: 'rgba(239, 68, 68, 0.12)',
    },
    {
      title: 'Latency > 5ms',
      value: formatNumber(summary?.latency_over_5_sites || 0),
      subtitle: `threshold latency ${LATENCY_THRESHOLD}ms`,
      icon: Timer,
      accent: QUALITY_COLORS.latency,
      glow: 'rgba(245, 158, 11, 0.12)',
    },
    {
      title: 'FLAG PL FAIL',
      value: formatNumber(summary?.flag_pl_fail_sites || 0),
      subtitle: 'high priority packet loss',
      icon: CircleAlert,
      accent: QUALITY_COLORS.p1,
      glow: 'rgba(220, 38, 38, 0.12)',
    },
    {
      title: 'THI FAIL',
      value: formatNumber(summary?.thi_fail_sites || 0),
      subtitle: 'Transport Healthy Index',
      icon: ShieldAlert,
      accent: QUALITY_COLORS.p1,
      glow: 'rgba(220, 38, 38, 0.12)',
    },
    {
      title: 'P1 Sites',
      value: formatNumber(summary?.p1_sites || 0),
      subtitle: `${formatNumber(summary?.p2_sites || 0)} P2 threshold sites`,
      icon: AlertTriangle,
      accent: QUALITY_COLORS.p1,
      glow: 'rgba(220, 38, 38, 0.14)',
    },
  ], [summary]);

  const latestPriority = prioritySites.items.slice(0, 4);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] bg-gradient-to-r from-[var(--bg-base)] via-[var(--bg-surface)] to-[var(--bg-base)] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="flex size-9 items-center justify-center rounded-lg border border-[var(--border-light)] text-[var(--text-muted)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)]"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
                <Radio className="size-5 text-[var(--primary-light)]" />
                Transport Quality
              </h1>
              <p className="text-xs text-[var(--text-muted)]">
                Packet loss, latency, jitter, and Transport Healthy Index monitoring.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/70 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Last update</p>
            <p className="font-mono text-xs font-semibold text-[var(--primary-light)]">
              {selectedPeriod?.label || formatDateLabel(selectedDate)}
            </p>
          </div>
        </div>
      </header>

      <Breadcrumb />

      <main className="flex-1 space-y-4 overflow-y-auto p-4">
        {error && (
          <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="glass-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Filter className="size-4 text-[var(--primary-light)]" />
              <h2 className="text-sm font-semibold tracking-wide">Global Filters</h2>
            </div>
            <button
              type="button"
              aria-expanded={!filtersCollapsed}
              onClick={() => setFiltersCollapsed((value) => !value)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-light)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)]"
            >
              {filtersCollapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
              {filtersCollapsed ? 'Show Filter' : 'Collapse Filter'}
            </button>
          </div>
          {!filtersCollapsed && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <label className="flex min-w-[170px] flex-1 flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Date / Week
              <select
                id="transport-date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="min-h-9 rounded-lg border border-[var(--border-light)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-medium normal-case tracking-normal text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
              >
                {filterOptions.periods.map((period) => (
                  <option key={period.date} value={period.date}>{period.label}</option>
                ))}
              </select>
            </label>
            <SelectFilter id="transport-nop" label="NOP" value={filters.nop} options={filterOptions.nops} onChange={(value) => setFilterValue('nop', value)} />
            <SelectFilter id="transport-kabupaten" label="Kabupaten" value={filters.kabupaten} options={filterOptions.kabupaten} onChange={(value) => setFilterValue('kabupaten', value)} />
            <SelectFilter id="transport-type" label="Transport Type" value={filters.transport_type} options={filterOptions.transport_types} onChange={(value) => setFilterValue('transport_type', value)} />
            <SelectFilter id="transport-thi-status" label="THI Status" value={filters.thi_status} options={filterOptions.thi_statuses} onChange={(value) => setFilterValue('thi_status', value)} />
            <SelectFilter id="transport-distribution-pl" label="Distribution PL" value={filters.distribution_pl} options={filterOptions.distribution_pl} onChange={(value) => setFilterValue('distribution_pl', value)} />
            <SelectFilter id="transport-pl-status" label="PL Status 0.1%" value={filters.pl_status_0_1_pct} options={filterOptions.pl_status_0_1_pct} onChange={(value) => setFilterValue('pl_status_0_1_pct', value)} />
            <SelectFilter id="transport-distribution-lat" label="Distribution Lat" value={filters.distribution_lat} options={filterOptions.distribution_lat} onChange={(value) => setFilterValue('distribution_lat', value)} />
            <SelectFilter id="transport-jitter-status" label="Jitter Status" value={filters.jitter_status} options={filterOptions.jitter_statuses} onChange={(value) => setFilterValue('jitter_status', value)} />
          </div>
          )}
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {loading && !summary ? (
            Array.from({ length: 6 }, (_, index) => <div key={index} className="skeleton h-[86px] rounded-xl" />)
          ) : (
            scorecards.map((card) => <Scorecard key={card.title} {...card} />)
          )}
        </section>

        <section className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,0.7fr)]">
          <ChartCard title="Weekly Quality Trend" icon={Activity}>
            {trend.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trend} margin={{ top: 14, right: 18, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={themeTokens.chartGrid} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <YAxis tick={{ fontSize: 10, fill: themeTokens.axisTick }} width={42} />
                  <Tooltip content={<TransportTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="pl_over_1_sites" name="PL >1%" stroke={QUALITY_COLORS.packetLoss} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="latency_over_5_sites" name="Latency >5ms" stroke={QUALITY_COLORS.latency} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="jitter_not_clear_sites" name="Jitter NOT-CLEAR" stroke={QUALITY_COLORS.jitter} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="thi_fail_sites" name="THI Fail" stroke={QUALITY_COLORS.p1} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <ChartEmpty />}
          </ChartCard>

          <ChartCard
            title="High Priority Transport"
            icon={ShieldAlert}
            action={<span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-300">P1 / P2 queue</span>}
          >
            {latestPriority.length ? (
              <div className="space-y-2">
                {latestPriority.map((site) => (
                  <div key={site.site_id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/50 p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs font-bold text-[var(--text-primary)]">{site.site_id}</p>
                        <p className="truncate text-[11px] text-[var(--text-muted)]">{asDisplay(site.site_name)}</p>
                      </div>
                      <PriorityBadge value={site.priority_level} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <span className={site.pl_over_threshold ? 'text-red-300' : 'text-[var(--text-muted)]'}>PL {formatMetric(site.avg_packet_loss, 2, '%')}</span>
                      <span className={site.latency_over_threshold ? 'text-red-300' : 'text-[var(--text-muted)]'}>LAT {formatMetric(site.latency, 2, 'ms')}</span>
                      <span className="text-[var(--text-muted)]">Score {site.priority_score}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <ChartEmpty label="Tidak ada site prioritas untuk filter ini." />}
          </ChartCard>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="PL & Latency Distribution" icon={Waves}>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {distributions.by_packet_loss.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={distributions.by_packet_loss} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={themeTokens.chartGrid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                    <YAxis tick={{ fontSize: 10, fill: themeTokens.axisTick }} width={42} />
                    <Tooltip content={<TransportTooltip />} />
                    <Bar dataKey="records" name="PL records" fill={QUALITY_COLORS.total} radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="records" position="top" formatter={formatNumber} fill="var(--text-muted)" fontSize={10} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <ChartEmpty />}
              {distributions.by_latency.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={distributions.by_latency} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={themeTokens.chartGrid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                    <YAxis tick={{ fontSize: 10, fill: themeTokens.axisTick }} width={42} />
                    <Tooltip content={<TransportTooltip />} />
                    <Bar dataKey="records" name="Latency records" fill={QUALITY_COLORS.latency} radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="records" position="top" formatter={formatNumber} fill="var(--text-muted)" fontSize={10} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <ChartEmpty />}
            </div>
          </ChartCard>

          <ChartCard title="Issue Breakdown" icon={BarChart3}>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={(breakdowns.by_nop || []).slice(0, 8)} layout="vertical" margin={{ top: 6, right: 18, left: 58, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={themeTokens.chartGrid} vertical={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <YAxis type="category" dataKey="label" width={88} tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <Tooltip content={<TransportTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="p1_sites" name="P1" stackId="issues" fill={QUALITY_COLORS.p1} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="p2_sites" name="P2" stackId="issues" fill={QUALITY_COLORS.p2} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={(breakdowns.by_kabupaten || []).slice(0, 8)} layout="vertical" margin={{ top: 6, right: 18, left: 82, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={themeTokens.chartGrid} vertical={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <YAxis type="category" dataKey="label" width={112} tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <Tooltip content={<TransportTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="pl_over_1_sites" name="PL > 1%" fill={QUALITY_COLORS.packetLoss} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="latency_over_5_sites" name="LAT > 5ms" fill={QUALITY_COLORS.latency} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </section>

        <section className="glass-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Gauge className="size-4 text-[var(--primary-light)]" />
              <h2 className="text-sm font-semibold tracking-wide text-[var(--text-primary)]">Priority Site List</h2>
              <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] font-mono text-[var(--text-muted)]">
                {formatNumber(prioritySites.total)} rows
              </span>
            </div>
            <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-[10px] text-[var(--text-muted)]">
              <Route className="size-3" />
              PL &gt; {PL_THRESHOLD}% or latency &gt; {LATENCY_THRESHOLD}ms or FAIL status
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  {['Site ID', 'Site Name', 'NOP', 'Kabupaten', 'Transport Type', 'PL', 'Lat', 'Jitter', 'FLAG PL', 'THI', 'Distribution PL', 'Distribution Lat', 'Priority', 'Action Hint'].map((head) => (
                    <th key={head} className="sticky top-0 z-10 whitespace-nowrap bg-[var(--bg-elevated)] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {prioritySites.items.map((row) => (
                  <tr
                    key={row.site_id}
                    className={`transition-colors hover:bg-[var(--bg-hover)]/45 ${row.priority_level === 'P1' ? 'bg-red-500/[0.045]' : ''
                      }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-bold text-[var(--text-primary)]">{row.site_id}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-xs text-[var(--text-secondary)]">{asDisplay(row.site_name)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-secondary)]">{asDisplay(row.nop)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-secondary)]">{asDisplay(row.kabupaten)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-secondary)]">{asDisplay(row.transport_type)}</td>
                    <td className="whitespace-nowrap px-3 py-2"><MetricCell value={row.avg_packet_loss} bad={row.pl_over_threshold} suffix="%" /></td>
                    <td className="whitespace-nowrap px-3 py-2"><MetricCell value={row.latency} bad={row.latency_over_threshold} suffix="ms" /></td>
                    <td className="whitespace-nowrap px-3 py-2"><MetricCell value={row.jitter} digits={3} /></td>
                    <td className="whitespace-nowrap px-3 py-2"><StatusBadge value={row.flag_pl_status} fail={row.flag_pl_fail} /></td>
                    <td className="whitespace-nowrap px-3 py-2"><StatusBadge value={row.thi_status} fail={row.thi_fail} /></td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-secondary)]">{asDisplay(row.distribution_pl)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-secondary)]">{asDisplay(row.distribution_lat)}</td>
                    <td className="whitespace-nowrap px-3 py-2"><PriorityBadge value={row.priority_level} /></td>
                    <td className="min-w-[180px] px-3 py-2 text-xs text-[var(--text-muted)]">{asDisplay(row.action_hint)}</td>
                  </tr>
                ))}
                {!prioritySites.items.length && (
                  <tr>
                    <td colSpan={14} className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">
                      Tidak ada priority site untuk filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
            <p className="text-xs text-[var(--text-muted)]">
              Page {prioritySites.page || page} of {prioritySites.total_pages || 1}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-light)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="size-3" />
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(prioritySites.total_pages || current, current + 1))}
                disabled={!prioritySites.total_pages || page >= prioritySites.total_pages}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-light)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight className="size-3" />
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function TransportQualityPage() {
  return (
    <TransportQualityErrorBoundary>
      <TransportQualityDashboard />
    </TransportQualityErrorBoundary>
  );
}
