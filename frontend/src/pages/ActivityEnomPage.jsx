/* eslint-disable react-hooks/set-state-in-effect */
import { Component, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Filter,
  Layers3,
  MapPin,
  Search,
  SlidersHorizontal,
  Trophy,
  TrendingUp,
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
  DashboardInput,
  DashboardKpiCard,
  DashboardSelect,
  DashboardStatusBadge,
  DashboardTableShell,
} from '../components/ui/DashboardPrimitives';
import {
  fetchActivityEnomActivities,
  fetchActivityEnomActivityDetail,
  fetchActivityEnomBreakdowns,
  fetchActivityEnomFilters,
  fetchActivityEnomSummary,
  fetchActivityEnomTopActivities,
  fetchActivityEnomTrend,
} from '../services/api';
import { formatNumber } from '../utils/formatters';

const TABLE_LIMIT = 20;
const COLORS = {
  total: '#60A5FA',
  open: '#EF4444',
  close: '#10B981',
  sites: '#A78BFA',
  category: '#F59E0B',
  muted: '#94A3B8',
};
const MONTH_FORMATTER = new Intl.DateTimeFormat('id-ID', { month: 'long' });
const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });

const SORT_OPTIONS = [
  { value: 'create_date', label: 'Bulan' },
  { value: 'site_id', label: 'Site ID' },
  { value: 'site_name', label: 'Site Name' },
  { value: 'nop', label: 'NOP' },
  { value: 'kabupaten', label: 'Kabupaten' },
  { value: 'part', label: 'Kategori' },
  { value: 'activity', label: 'Activity' },
  { value: 'status', label: 'Status' },
  { value: 'week_done', label: 'Week Done' },
  { value: 'date_done', label: 'Date Done' },
];

class ActivityEnomErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Activity ENOM render failed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--bg-base)] p-6 text-[var(--text-primary)]">
          <section className="glass-card mx-auto mt-16 max-w-xl p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10">
                <ClipboardList className="size-5 text-amber-300" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Activity ENOM</h1>
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

function asDisplay(value) {
  if (value == null || value === '') return '-';
  return String(value);
}

function formatDateLabel(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`));
}

function formatMonthLabel(value, withYear = false) {
  if (!value) return '-';
  const formatter = withYear ? MONTH_YEAR_FORMATTER : MONTH_FORMATTER;
  return formatter.format(new Date(`${value}T00:00:00`));
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return '0%';
  return `${Number(value).toFixed(1).replace('.', ',')}%`;
}

function ChartEmpty({ label = 'Data belum tersedia untuk filter ini.' }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]/40">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

function ActivityTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <DashboardChartTooltip
      active={active}
      payload={payload}
      label={label}
      labelFormatter={(value) => (String(value).includes('-') ? formatMonthLabel(value, true) : value)}
      valueFormatter={formatNumber}
    />
  );
}

function StatusBadge({ value }) {
  const status = String(value || '').toUpperCase();
  const tone = status === 'OPEN' ? 'danger' : status === 'CLOSE' ? 'success' : 'neutral';
  return <DashboardStatusBadge tone={tone}>{status || '-'}</DashboardStatusBadge>;
}

function RankingPanel({ rows }) {
  if (!rows?.length) return <ChartEmpty />;

  return (
    <div className="h-[260px] overflow-y-auto pr-1 xl:h-[552px]">
      <div className="space-y-2">
        {rows.map((row, index) => {
          const rate = Math.max(0, Math.min(100, Number(row.completion_rate || 0)));
          return (
            <div key={row.label} className="border-b border-[var(--border)] pb-2 last:border-b-0">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border-light)] bg-[var(--bg-elevated)] font-mono text-[11px] font-semibold text-[var(--text-muted)]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-[var(--text-primary)]" title={row.label}>
                      {row.label}
                    </p>
                    <p className="font-mono text-sm font-bold text-emerald-300">{formatPercent(rate)}</p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                    <div
                      className="h-full rounded-full bg-emerald-400"
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-2 text-[10px] text-[var(--text-muted)]">
                    <span>Total <b className="font-mono text-[var(--text-secondary)]">{formatNumber(row.total)}</b></span>
                    <span>Open <b className="font-mono text-red-300">{formatNumber(row.open)}</b></span>
                    <span>Close <b className="font-mono text-emerald-300">{formatNumber(row.close)}</b></span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityDetailModal({ detail, loading, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const fields = [
    ['Source Row', detail?.source_row_number],
    ['Bulan', detail?.create_date ? formatMonthLabel(detail.create_date, true) : '-'],
    ['Site ID', detail?.site_id],
    ['Site Name', detail?.site_name],
    ['NOP', detail?.nop],
    ['Kabupaten', detail?.kabupaten],
    ['Kategori', detail?.part],
    ['Activity', detail?.activity],
    ['Status', detail?.status],
    ['Week Done', detail?.week_done],
    ['Date Done', detail?.date_done ? formatDateLabel(detail.date_done) : '-'],
    ['Baseline Activity', detail?.baseline_activity],
    ['Info', detail?.info],
    ['Analisis', detail?.analisis],
    ['Remark 1', detail?.remark_1],
    ['Remark 2', detail?.remark_2],
    ['Milestone', detail?.milestone],
    ['XCEK', detail?.xcek],
    ['Workshop', detail?.workshop],
    ['Target Workshop', detail?.target_workshop],
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--overlay-scrim)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Activity ENOM detail"
        className="glass-card max-h-[86vh] w-full max-w-4xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Activity Detail</p>
            <h2 className="mt-1 truncate text-lg font-bold text-[var(--text-primary)]">
              {loading ? 'Loading activity...' : asDisplay(detail?.activity)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
            aria-label="Close activity detail"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[calc(86vh-82px)] overflow-y-auto p-5">
          {loading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {Array.from({ length: 10 }, (_, index) => <div key={index} className="skeleton h-14 rounded-lg" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {fields.map(([label, value]) => (
                <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/45 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
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

function ActivityEnomDashboard() {
  const navigate = useNavigate();
  const themeTokens = useDashboardThemeTokens();
  const [filterOptions, setFilterOptions] = useState({ months: [], nops: [], categories: [], default_month: null });
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedNop, setSelectedNop] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('create_date');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [breakdowns, setBreakdowns] = useState({
    breakdown_title: 'NOP Contribution',
    ranking_title: 'Ranking NOP',
    contribution: [],
    ranking: [],
    by_category: [],
    by_status: [],
    by_week_done: [],
  });
  const [topActivities, setTopActivities] = useState([]);
  const [activities, setActivities] = useState({ items: [], total: 0, page: 1, limit: TABLE_LIMIT, total_pages: 0 });
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedActivityId, setSelectedActivityId] = useState(null);
  const [selectedActivityDetail, setSelectedActivityDetail] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchActivityEnomFilters()
      .then((data) => {
        if (cancelled) return;
        const months = Array.isArray(data?.months) ? data.months : [];
        const defaultMonth = data?.default_month || months[0]?.value || '';
        setFilterOptions({
          months,
          nops: Array.isArray(data?.nops) ? data.nops : [],
          categories: Array.isArray(data?.categories) ? data.categories : [],
          default_month: data?.default_month || null,
        });
        setSelectedMonth(defaultMonth);
        setFiltersLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to load Activity ENOM filters:', err);
        if (!cancelled) {
          setError('Gagal memuat filter Activity ENOM.');
          setLoading(false);
          setFiltersLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [selectedMonth, selectedNop, selectedCategory, statusFilter, search, sortBy, sortDir]);

  const baseParams = useMemo(() => ({
    month_date: selectedMonth,
    nop: selectedNop || undefined,
    category: selectedCategory || undefined,
  }), [selectedCategory, selectedMonth, selectedNop]);

  const tableParams = useMemo(() => ({
    ...baseParams,
    status: statusFilter || undefined,
    q: search.trim() || undefined,
    page,
    limit: TABLE_LIMIT,
    sort_by: sortBy,
    sort_dir: sortDir,
  }), [baseParams, page, search, sortBy, sortDir, statusFilter]);

  useEffect(() => {
    if (!selectedMonth) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchActivityEnomSummary(baseParams),
      fetchActivityEnomTrend(baseParams),
      fetchActivityEnomBreakdowns(baseParams),
      fetchActivityEnomTopActivities({ ...baseParams, limit: 10 }),
      fetchActivityEnomActivities(tableParams),
    ])
      .then(([nextSummary, nextTrend, nextBreakdowns, nextTopActivities, nextActivities]) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setTrend(nextTrend || []);
        setBreakdowns(nextBreakdowns || {});
        setTopActivities(nextTopActivities || []);
        setActivities(nextActivities || { items: [], total: 0, page: 1, limit: TABLE_LIMIT, total_pages: 0 });
      })
      .catch((err) => {
        console.error('Failed to load Activity ENOM dashboard:', err);
        if (!cancelled) setError('Gagal memuat data Activity ENOM.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [baseParams, selectedMonth, tableParams]);

  useEffect(() => {
    if (!selectedActivityId || !selectedMonth) return;
    let cancelled = false;
    setModalLoading(true);
    setSelectedActivityDetail(null);
    fetchActivityEnomActivityDetail(selectedActivityId, baseParams)
      .then((detail) => {
        if (!cancelled) setSelectedActivityDetail(detail);
      })
      .catch((err) => {
        console.error('Failed to load Activity ENOM detail:', err);
        if (!cancelled) setSelectedActivityId(null);
      })
      .finally(() => {
        if (!cancelled) setModalLoading(false);
      });
    return () => { cancelled = true; };
  }, [baseParams, selectedActivityId, selectedMonth]);

  const closeModal = useCallback(() => {
    setSelectedActivityId(null);
    setSelectedActivityDetail(null);
  }, []);

  const monthOptions = useMemo(() => (
    (filterOptions.months || []).map((month) => ({
      value: month.value,
      label: formatMonthLabel(month.value),
    }))
  ), [filterOptions.months]);

  const contributionTitle = selectedNop ? 'Kabupaten Contribution' : 'NOP Contribution';
  const rankingTitle = selectedNop ? 'Ranking Kabupaten' : 'Ranking NOP';
  const totalPages = activities.total_pages || 0;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg-base)]">
      <header className="border-b border-[var(--border)] bg-[var(--bg-header)] px-6 py-4 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border-light)] text-[var(--text-muted)] transition-colors hover:border-[var(--primary)]/30 hover:bg-[var(--primary)]/10 hover:text-[var(--primary-light)]"
              aria-label="Back to home"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="flex size-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10">
              <ClipboardList className="size-5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight text-[var(--text-primary)]">Activity ENOM</h1>
              <p className="truncate text-xs text-[var(--text-muted)]">
                Proker operational activity - {formatMonthLabel(selectedMonth, true)}
              </p>
            </div>
          </div>
          <div className="grid w-full gap-2 md:w-auto md:grid-cols-3">
            <DashboardSelect id="activity-enom-month" label="Bulan" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} options={monthOptions} placeholder={null} />
            <DashboardSelect id="activity-enom-nop" label="NOP" value={selectedNop} onChange={(event) => setSelectedNop(event.target.value)} options={filterOptions.nops} placeholder="Semua NOP" />
            <DashboardSelect id="activity-enom-category" label="Kategori" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} options={filterOptions.categories} placeholder="Semua Kategori" />
          </div>
        </div>
      </header>

      <Breadcrumb />

      <main className="flex-1 space-y-4 overflow-y-auto p-4">
        {error && (
          <section className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </section>
        )}

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {loading && !summary ? (
            Array.from({ length: 5 }, (_, index) => <div key={index} className="skeleton h-[96px] rounded-xl" />)
          ) : (
            <>
              <DashboardKpiCard title="Total Activity" value={formatNumber(summary?.total_activity)} subtitle="filtered records" icon={ClipboardList} accent={COLORS.total} glow="rgba(96,165,250,0.14)" />
              <DashboardKpiCard title="Impacted Site" value={formatNumber(summary?.impacted_sites)} subtitle="distinct site_id" icon={Users} accent={COLORS.sites} glow="rgba(167,139,250,0.14)" />
              <DashboardKpiCard title="OPEN Activity" value={formatNumber(summary?.open_activity)} subtitle="status OPEN" icon={Activity} accent={COLORS.open} glow="rgba(239,68,68,0.14)" />
              <DashboardKpiCard title="CLOSE Activity" value={formatNumber(summary?.close_activity)} subtitle="status CLOSE" icon={CheckCircle2} accent={COLORS.close} glow="rgba(16,185,129,0.14)" />
              <DashboardKpiCard title="Completion Rate" value={formatPercent(summary?.completion_rate)} subtitle="close / total" icon={TrendingUp} accent={COLORS.category} glow="rgba(245,158,11,0.14)" />
            </>
          )}
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <DashboardChartPanel title="Monthly Activity Trend" icon={TrendingUp} className="xl:col-span-2">
            {trend.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={trend} margin={{ top: 12, right: 18, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={themeTokens.chartGrid} vertical={false} />
                  <XAxis dataKey="create_date" tickFormatter={formatMonthLabel} tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <YAxis tick={{ fontSize: 10, fill: themeTokens.axisTick }} width={44} />
                  <Tooltip content={<ActivityTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="open" name="OPEN" stackId="status" fill={COLORS.open} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="close" name="CLOSE" stackId="status" fill={COLORS.close} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="total" position="top" formatter={formatNumber} fill="var(--text-muted)" fontSize={10} />
                  </Bar>
                  <Line type="monotone" dataKey="total" name="Total Trend" stroke={COLORS.total} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <ChartEmpty />}
          </DashboardChartPanel>

          <DashboardChartPanel title={rankingTitle} icon={Trophy} className="xl:row-span-2">
            <RankingPanel rows={breakdowns.ranking || []} />
          </DashboardChartPanel>

          <DashboardChartPanel title={contributionTitle} icon={selectedNop ? MapPin : BarChart3}>
            {(breakdowns.contribution || []).length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={(breakdowns.contribution || []).slice(0, 10)} layout="vertical" margin={{ top: 6, right: 18, left: 76, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={themeTokens.chartGrid} vertical={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <YAxis type="category" dataKey="label" width={112} tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <Tooltip content={<ActivityTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="open" name="OPEN" stackId="status" fill={COLORS.open} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="close" name="CLOSE" stackId="status" fill={COLORS.close} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartEmpty />}
          </DashboardChartPanel>

          <DashboardChartPanel title="Week Done Progress" icon={SlidersHorizontal}>
            {(breakdowns.by_week_done || []).length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={breakdowns.by_week_done} margin={{ top: 12, right: 18, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={themeTokens.chartGrid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <YAxis tick={{ fontSize: 10, fill: themeTokens.axisTick }} width={44} />
                  <Tooltip content={<ActivityTooltip />} />
                  <Bar dataKey="close" name="CLOSE" fill={COLORS.close} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="close" position="top" formatter={formatNumber} fill="var(--text-muted)" fontSize={10} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartEmpty />}
          </DashboardChartPanel>

          <DashboardChartPanel title="Kategori Distribution" icon={Layers3}>
            {(breakdowns.by_category || []).length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={breakdowns.by_category} layout="vertical" margin={{ top: 6, right: 18, left: 50, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={themeTokens.chartGrid} vertical={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <YAxis type="category" dataKey="label" width={82} tick={{ fontSize: 10, fill: themeTokens.axisTick }} />
                  <Tooltip content={<ActivityTooltip />} />
                  <Bar dataKey="total" name="Total" fill={COLORS.category} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartEmpty />}
          </DashboardChartPanel>

          <DashboardChartPanel title="Top Activity" icon={FileText} className="xl:col-span-2">
            {topActivities.length ? (
              <div className="overflow-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2">Activity</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Sites</th>
                      <th className="px-3 py-2 text-right">OPEN</th>
                      <th className="px-3 py-2 text-right">CLOSE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {topActivities.map((row) => (
                      <tr key={row.activity} className="hover:bg-[var(--bg-hover)]/50">
                        <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{row.activity}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(row.total)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(row.sites)}</td>
                        <td className="px-3 py-2 text-right font-mono text-red-300">{formatNumber(row.open)}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-300">{formatNumber(row.close)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <ChartEmpty />}
          </DashboardChartPanel>
        </section>

        <DashboardTableShell
          title="Activity Detail Table"
          icon={ClipboardList}
          count={`${formatNumber(activities.total)} rows`}
          action={(
            <div className="flex flex-wrap items-end gap-2">
              <DashboardInput
                id="activity-enom-search"
                label=""
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search site, activity, kabupaten..."
                inputClassName="min-w-[220px] pl-8"
              />
              <div className="pointer-events-none relative -ml-[222px] mb-2 mr-[198px] hidden md:block">
                <Search className="size-3.5 text-[var(--text-muted)]" />
              </div>
              <DashboardSelect id="activity-enom-status" label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} options={['OPEN', 'CLOSE']} placeholder="Semua Status" className="min-w-[130px]" />
              <DashboardSelect id="activity-enom-sort-by" label="Sort By" value={sortBy} onChange={(event) => setSortBy(event.target.value)} options={SORT_OPTIONS} placeholder={null} className="min-w-[150px]" />
              <DashboardSelect id="activity-enom-sort-dir" label="Direction" value={sortDir} onChange={(event) => setSortDir(event.target.value)} options={[{ value: 'desc', label: 'Desc' }, { value: 'asc', label: 'Asc' }]} placeholder={null} className="min-w-[110px]" />
              <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-2 text-[10px] text-[var(--text-muted)]">
                <Filter className="size-3" />
                {selectedNop || 'Semua NOP'}
              </span>
            </div>
          )}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  {['Bulan', 'Site ID', 'Site Name', 'NOP', 'Kabupaten', 'Kategori', 'Activity', 'Status', 'Week Done', 'Date Done'].map((head) => (
                    <th key={head} className="sticky top-0 z-10 whitespace-nowrap bg-[var(--bg-elevated)] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {loading && !activities.items.length ? (
                  Array.from({ length: 8 }, (_, index) => (
                    <tr key={index}>
                      <td colSpan={10} className="px-3 py-2"><div className="skeleton h-9 rounded-lg" /></td>
                    </tr>
                  ))
                ) : activities.items.length ? (
                  activities.items.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedActivityId(row.id)}
                      className="cursor-pointer transition-colors hover:bg-[var(--bg-hover)]/60"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--text-secondary)]">{formatMonthLabel(row.create_date)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-semibold text-[var(--primary-light)]">{asDisplay(row.site_id)}</td>
                      <td className="min-w-[180px] px-3 py-2.5 text-xs text-[var(--text-primary)]">{asDisplay(row.site_name)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--text-secondary)]">{asDisplay(row.nop)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--text-secondary)]">{asDisplay(row.kabupaten)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--text-secondary)]">{asDisplay(row.part)}</td>
                      <td className="min-w-[240px] px-3 py-2.5 text-xs font-medium text-[var(--text-primary)]">{asDisplay(row.activity)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5"><StatusBadge value={row.status} /></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--text-secondary)]">{asDisplay(row.week_done)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--text-secondary)]">{row.date_done ? formatDateLabel(row.date_done) : '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">
                      Tidak ada activity untuk filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
            <p className="text-xs text-[var(--text-muted)]">
              Page {activities.page || page} of {totalPages || 1}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || loading}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-light)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="size-3" />
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => (totalPages ? Math.min(totalPages, current + 1) : current + 1))}
                disabled={loading || (totalPages > 0 && page >= totalPages)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-light)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight className="size-3" />
              </button>
            </div>
          </div>
        </DashboardTableShell>

        {!filtersLoaded && <div className="skeleton h-10 rounded-lg" />}
      </main>

      {selectedActivityId && (
        <ActivityDetailModal detail={selectedActivityDetail} loading={modalLoading} onClose={closeModal} />
      )}
    </div>
  );
}

export default function ActivityEnomPage() {
  return (
    <ActivityEnomErrorBoundary>
      <ActivityEnomDashboard />
    </ActivityEnomErrorBoundary>
  );
}
