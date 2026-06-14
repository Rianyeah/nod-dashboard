import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Radio,
  Banknote,
  HardDrive,
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  TrendingUp,
  Battery,
  Layers,
  FileDown,
} from 'lucide-react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import Breadcrumb from '../components/Breadcrumb';
import {
  DashboardCombobox,
  DashboardFilterBar,
  DashboardPeriodPicker,
} from '../components/dashboard-filters/DashboardFilters';
import { useDashboardThemeTokens } from '../hooks/useDashboardThemeTokens';
import { DashboardChartPanel, DashboardChartTooltip, DashboardKpiCard } from '../components/ui/DashboardPrimitives';
import {
  fetchReportingAvailableMonths,
  fetchReportingScorecards,
  fetchRevenueByKabupaten,
  fetchSiteClassByKabupaten,
  fetchBatteryByKabupaten,
  fetchRevenueTrend,
  fetchFilterOptions,
} from '../services/api';
import {
  formatRevenue,
  formatRevenueShort,
  formatPayload,
  formatTraffic,
  formatPercent,
  formatNumber,
} from '../utils/formatters';

const REVENUE_TARGET = 90_000_000_000;
const REPORTING_DEFAULT_NOP = 'SIDOARJO';

function normalizeReportingNop(value) {
  return String(value || '')
    .trim()
    .replace(/^NOP\s+/i, '')
    .toUpperCase();
}

function getDelta(current, previous) {
  if (current == null || previous == null) return null;
  const currentNumber = Number(current);
  const previousNumber = Number(previous);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(previousNumber)) return null;
  return currentNumber - previousNumber;
}

function getRelativeChange(current, previous) {
  const currentNumber = Number(current);
  const previousNumber = Number(previous);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(previousNumber) || previousNumber === 0) {
    return null;
  }
  return ((currentNumber - previousNumber) / Math.abs(previousNumber)) * 100;
}

function formatSignedDelta(delta, formatter) {
  if (delta == null) return null;
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : '';
  return `${sign}${formatter(Math.abs(delta))}`;
}

function formatRelativePercent(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '-';
  const number = Number(value);
  const sign = number > 0 ? '+' : number < 0 ? '-' : '';
  return `${sign}${Math.abs(number).toFixed(digits).replace('.', ',')}%`;
}

function formatPayloadAxisTick(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  const gb = num / 1_048_576;
  if (gb >= 1_000) return `${(gb / 1_000).toFixed(1).replace('.', ',')}TB`;
  return `${Math.round(gb).toLocaleString('id-ID')}GB`;
}

function formatAvailabilityAxisTick(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  const fixed = num.toFixed(1).replace(/\.0$/, '');
  return `${fixed}%`;
}

function DeltaValue({ delta, formatter }) {
  const label = formatSignedDelta(delta, formatter);
  if (!label) return null;

  const colorClass = delta < 0 ? 'text-red-400' : delta > 0 ? 'text-emerald-400' : 'text-[var(--text-muted)]';
  return (
    <span className={`block text-[10px] leading-4 font-semibold ${colorClass}`}>
      {label}
    </span>
  );
}

function buildRevenueTotals(rows) {
  if (!rows.length) return null;
  const totals = rows.reduce(
    (acc, row) => {
      acc.total_sites += row.total_sites;
      acc.rev += row.rev;
      acc.rev_voice += row.rev_voice;
      acc.rev_bb += row.rev_bb;
      acc.rev_dig += row.rev_dig;
      acc.rev_sms += row.rev_sms;
      acc.rev_ir += row.rev_ir;
      acc.payload += row.payload;
      acc.traffic += row.traffic;
      acc.ticket_swfm_bps += row.ticket_swfm_bps || 0;
      acc.ticket_swfm_ts += row.ticket_swfm_ts || 0;
      acc.proker_open += row.proker_open || 0;
      acc.proker_closed += row.proker_closed || 0;
      if (row.avg_availability != null) {
        acc._avail_sum += row.avg_availability * row.total_sites;
        acc._avail_count += row.total_sites;
      }
      return acc;
    },
    {
      total_sites: 0,
      rev: 0,
      rev_voice: 0,
      rev_bb: 0,
      rev_dig: 0,
      rev_sms: 0,
      rev_ir: 0,
      payload: 0,
      traffic: 0,
      ticket_swfm_bps: 0,
      ticket_swfm_ts: 0,
      proker_open: 0,
      proker_closed: 0,
      _avail_sum: 0,
      _avail_count: 0,
    },
  );
  totals.avg_availability = totals._avail_count > 0 ? totals._avail_sum / totals._avail_count : null;
  return totals;
}

function getRevenueContributorInsight(currentTotals, previousTotals) {
  if (!currentTotals || !previousTotals) return 'Kontributor belum tersedia untuk periode pembanding.';

  const details = [
    ['Revenue Voice', 'rev_voice'],
    ['Revenue BB', 'rev_bb'],
    ['Revenue Digital', 'rev_dig'],
    ['Revenue SMS', 'rev_sms'],
    ['Revenue IR', 'rev_ir'],
  ]
    .map(([label, key]) => ({
      label,
      delta: getDelta(currentTotals[key], previousTotals[key]),
    }))
    .filter((item) => item.delta != null)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const top = details[0];
  if (!top) return 'Belum ada detail kontributor revenue.';

  const direction = top.delta >= 0 ? 'naik' : 'turun';
  return `Kontributor terbesar: ${top.label} ${direction} ${formatSignedDelta(top.delta, formatRevenueShort)}.`;
}

function getAvailabilityTrendInsight({ trendData, currentIndex, currentAvailability, areaRows }) {
  if (currentAvailability == null) {
    return {
      title: 'Availability belum tersedia',
      body: 'Data availability belum masuk untuk periode terpilih.',
      chip: 'Perlu validasi data',
    };
  }

  let declinePairs = 0;
  for (let i = currentIndex; i > 0; i -= 1) {
    const current = Number(trendData[i]?.avg_availability);
    const previous = Number(trendData[i - 1]?.avg_availability);
    if (!Number.isFinite(current) || !Number.isFinite(previous) || current >= previous) break;
    declinePairs += 1;
  }
  const monthsInTrend = declinePairs > 0 ? declinePairs + 1 : 1;

  const weakestAreas = areaRows
    .filter((row) => row.avg_availability != null)
    .toSorted((a, b) => Number(a.avg_availability) - Number(b.avg_availability))
    .slice(0, 3)
    .map((row) => `${row.kabupaten} (${Number(row.avg_availability).toFixed(2)}%)`);

  return {
    title: declinePairs > 0
      ? `Availability turun ${monthsInTrend} bulan berturut-turut`
      : 'Availability stabil bulan ini',
    body: weakestAreas.length
      ? `Area perlu monitoring: ${weakestAreas.join(', ')}.`
      : 'Tidak ada area prioritas yang menonjol pada data kabupaten/kota.',
    chip: declinePairs > 0 ? 'Perlu monitoring' : 'SLA terjaga',
  };
}

function getPayloadPeakInsight({ trendData, currentIndex, currentPayload }) {
  if (currentPayload == null) {
    return {
      title: 'Payload belum tersedia',
      body: 'Data payload belum masuk untuk periode terpilih.',
      chip: 'Pantau data',
    };
  }

  const windowRows = trendData.slice(Math.max(0, currentIndex - 5), currentIndex + 1);
  const maxPayload = Math.max(...windowRows.map((row) => Number(row.total_payload)).filter(Number.isFinite));
  const isPeak = Number(currentPayload) >= maxPayload;

  return {
    title: isPeak
      ? `Payload ${formatPayload(currentPayload)} - tertinggi 6 bulan`
      : `Payload ${formatPayload(currentPayload)} masih di bawah puncak 6 bulan`,
    body: isPeak
      ? 'Review kapasitas jika pertumbuhan berlanjut.'
      : 'Masih dalam rentang kapasitas enam bulan terakhir.',
    chip: isPeak ? 'Perlu antisipasi' : 'Dalam kendali',
  };
}

/* ─── Scorecard Component ──────────────────────────────── */
function Scorecard({
  title,
  value,
  metadata = [],
  momRate,
  momDigits = 1,
  icon: Icon,
  accent,
  glow,
  delay = 0,
}) {
  const momTone = momRate == null
    ? 'text-[var(--text-muted)]'
    : momRate < 0
      ? 'text-red-400'
      : momRate > 0
        ? 'text-emerald-400'
        : 'text-[var(--text-secondary)]';

  return (
    <DashboardKpiCard
      title={title}
      value={value}
      icon={Icon}
      accent={accent}
      glow={glow}
      className="animate-fade-in cursor-default"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="mt-2 font-mono text-[28px] font-bold leading-none tabular-nums tracking-tight" style={{ color: accent }}>
        {value}
      </p>
      <div className="mt-2 min-h-8 space-y-0.5 text-[10px] leading-4">
        {momRate !== undefined && (
          <p className={`font-mono font-semibold tabular-nums ${momTone}`}>
            {formatRelativePercent(momRate, momDigits)} MoM
          </p>
        )}
        {metadata.map((item) => (
          <p key={item.label} className="text-[var(--text-secondary)]">
            {item.label}: <span className="font-mono font-semibold text-[var(--text-primary)]">{item.value}</span>
          </p>
        ))}
      </div>
    </DashboardKpiCard>
  );
}

/* ─── Site Class Badge ─────────────────────────────────── */
const CLASS_COLORS = {
  diamond: { bg: 'rgba(96, 165, 250, 0.15)', text: '#60A5FA' },
  platinum: { bg: 'rgba(168, 162, 158, 0.15)', text: '#A8A29E' },
  gold: { bg: 'rgba(251, 191, 36, 0.15)', text: '#FBBF24' },
  silver: { bg: 'rgba(148, 163, 184, 0.15)', text: '#94A3B8' },
  bronze: { bg: 'rgba(217, 119, 6, 0.15)', text: '#D97706' },
};

function ClassBadge({ value, type }) {
  const colors = CLASS_COLORS[type] || { bg: 'rgba(255,255,255,0.06)', text: 'var(--text-secondary)' };
  return (
    <span
      className="inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-md text-xs font-semibold font-mono tabular-nums"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {value}
    </span>
  );
}

/* ─── Battery Badge ────────────────────────────────────── */
const BATTERY_COLORS = {
  lithium: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10B981' },
  vrla: { bg: 'rgba(245, 158, 11, 0.15)', text: '#F59E0B' },
  tidak_ada: { bg: 'rgba(239, 68, 68, 0.12)', text: '#EF4444' },
};

function BatteryBadge({ value, type }) {
  const colors = BATTERY_COLORS[type] || { bg: 'rgba(255,255,255,0.06)', text: 'var(--text-secondary)' };
  return (
    <span
      className="inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-md text-xs font-semibold font-mono tabular-nums"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {value}
    </span>
  );
}

/* ─── Availability Badge ───────────────────────────────── */
function AvailabilityBadge({ value }) {
  if (value == null) return <span className="text-[var(--text-muted)]">—</span>;
  const v = Number(value);
  let bg, text;
  if (v >= 99.5) { bg = 'rgba(16, 185, 129, 0.15)'; text = '#10B981'; }
  else if (v >= 95) { bg = 'rgba(245, 158, 11, 0.15)'; text = '#F59E0B'; }
  else { bg = 'rgba(239, 68, 68, 0.12)'; text = '#EF4444'; }
  return (
    <span
      className="inline-flex items-center justify-center min-w-[52px] px-2 py-0.5 rounded-md text-xs font-semibold font-mono tabular-nums"
      style={{ backgroundColor: bg, color: text }}
    >
      {v.toFixed(2)}%
    </span>
  );
}

/* ─── Table Section Wrapper ────────────────────────────── */
function TableSection({ title, icon: Icon, action, children, delay = 0 }) {
  return (
    <div
      className="glass-card overflow-hidden animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-[var(--primary-light)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-wide">{title}</h2>
        </div>
        {action}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

/* ─── Trend Chart Custom Tooltip ───────────────────────── */
function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const rev = payload.find(p => p.dataKey === 'total_revenue');
  const pld = payload.find(p => p.dataKey === 'total_payload');
  const avail = payload.find(p => p.dataKey === 'avg_availability');
  return (
    <DashboardChartTooltip
      active={active}
      label={label}
      payload={[
        rev && { ...rev, name: 'Revenue', value: formatRevenue(rev.value), color: 'var(--primary-light)' },
        pld && { ...pld, name: 'Payload', value: formatPayload(pld.value), color: 'var(--success)' },
        avail && avail.value != null && { ...avail, name: 'Availability', value: `${Number(avail.value).toFixed(2)}%`, color: 'var(--warning)' },
      ].filter(Boolean)}
    />
  );
}

const INSIGHT_TONES = {
  success: {
    shell: 'border-emerald-500/45 bg-emerald-50/80 dark:bg-emerald-500/10',
    text: 'text-emerald-700 dark:text-emerald-300',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    labelText: 'text-slate-600',
    summaryText: 'text-slate-900',
    detailText: 'text-slate-700',
  },
  warning: {
    shell: 'border-amber-500/45 bg-amber-50/80 dark:bg-amber-500/10',
    text: 'text-amber-700 dark:text-amber-300',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    labelText: 'text-slate-600',
    summaryText: 'text-slate-900',
    detailText: 'text-slate-700',
  },
  info: {
    shell: 'border-blue-500/45 bg-blue-50/80 dark:bg-blue-500/10',
    text: 'text-blue-700 dark:text-blue-300',
    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    labelText: 'text-slate-600',
    summaryText: 'text-slate-900',
    detailText: 'text-slate-700',
  },
};

function InsightCard({ label, title, summary, detail, chip, tone = 'info', icon: Icon = TrendingUp }) {
  const colors = INSIGHT_TONES[tone] || INSIGHT_TONES.info;
  return (
    <article className={`rounded-lg border p-3 ${colors.shell}`}>
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 size-4 shrink-0 ${colors.text}`} />
        <div className="min-w-0">
          <p className={`text-[10px] font-semibold uppercase tracking-wider ${colors.labelText}`}>{label}</p>
          <h3 className={`mt-0.5 text-sm font-bold leading-5 ${colors.text}`}>{title}</h3>
          <p className={`mt-1 text-xs font-semibold leading-5 ${colors.summaryText}`}>{summary}</p>
          {detail && <p className={`mt-0.5 text-[11px] font-medium leading-5 ${colors.detailText}`}>{detail}</p>}
          {chip && (
            <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors.chip}`}>
              {chip}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function ExecutiveInsightPanel({ insights }) {
  return (
    <section className="reporting-executive-insight glass-card p-4 animate-fade-in">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">Executive Insight</p>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{insights.periodLabel}</h3>
        </div>
        <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">Auto-generated dari data</span>
      </div>
      <div className="insight-card-grid grid grid-cols-1 lg:grid-cols-3 gap-3">
        {insights.cards.map((item) => (
          <InsightCard key={item.label} {...item} />
        ))}
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════════ */
function availabilityDomainMin(dataMin) {
  const value = Number.isFinite(dataMin) ? dataMin : 95;
  return Math.max(0, Math.floor(value * 10) / 10 - 0.1);
}

function availabilityDomainMax(dataMax) {
  const value = Number.isFinite(dataMax) ? dataMax : 100;
  return Math.min(100, Math.ceil(value * 10) / 10 + 0.1);
}

function getPaddedDomain(rows, key) {
  const values = rows
    .map(row => Number(row?.[key]))
    .filter(Number.isFinite);

  if (!values.length) return [0, 'auto'];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const fallbackPad = Math.max(Math.abs(max) * 0.04, 1);
  const padding = range > 0 ? range * 0.18 : fallbackPad;
  const lower = Math.max(0, min - padding);
  const upper = max + padding;

  return [Math.floor(lower), Math.ceil(upper)];
}

export default function NetworkReportingPage() {
  const themeTokens = useDashboardThemeTokens();
  const navigate = useNavigate();

  // State
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedNop, setSelectedNop] = useState(null);
  const [nopOptions, setNopOptions] = useState([]);
  const [filtersReady, setFiltersReady] = useState(false);
  const [scorecards, setScorecards] = useState(null);
  const [previousScorecards, setPreviousScorecards] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [previousRevenueData, setPreviousRevenueData] = useState([]);
  const [siteClassData, setSiteClassData] = useState([]);
  const [batteryData, setBatteryData] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTable, setActiveTable] = useState('revenue');
  const [showRevenueDetails, setShowRevenueDetails] = useState(false);

  const previousMonth = useMemo(() => {
    const selectedIndex = availableMonths.indexOf(selectedMonth);
    if (selectedIndex < 0) return null;
    return availableMonths[selectedIndex + 1] || null;
  }, [availableMonths, selectedMonth]);

  // Load shared filter options on mount
  useEffect(() => {
    let cancelled = false;
    fetchFilterOptions()
      .then((options) => {
        if (cancelled) return;
        const nops = options?.nop || [];
        setNopOptions(nops);
        const defaultNop = nops.find(
          (item) => normalizeReportingNop(item) === REPORTING_DEFAULT_NOP,
        );
        setSelectedNop((current) => current ?? defaultNop ?? null);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setFiltersReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Load available months on mount
  useEffect(() => {
    let cancelled = false;
    fetchReportingAvailableMonths()
      .then((months) => {
        if (cancelled) return;
        setAvailableMonths(months);
        if (months.length > 0) setSelectedMonth(months[0]); // latest
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, []);

  // Load trend data whenever the reporting NOP changes
  useEffect(() => {
    if (!filtersReady) return undefined;
    let cancelled = false;
    fetchRevenueTrend(selectedNop)
      .then((data) => {
        if (!cancelled) setTrendData(data);
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [filtersReady, selectedNop]);

  // Load battery data whenever the reporting NOP changes
  useEffect(() => {
    if (!filtersReady) return undefined;
    let cancelled = false;
    fetchBatteryByKabupaten(selectedNop)
      .then((data) => {
        if (!cancelled) setBatteryData(data);
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [filtersReady, selectedNop]);

  // Load period-dependent data when selectedMonth changes
  useEffect(() => {
    if (!selectedMonth || !filtersReady) return;
    let cancelled = false;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    Promise.all([
      fetchReportingScorecards(selectedMonth, selectedNop),
      fetchRevenueByKabupaten(selectedMonth, selectedNop),
      fetchSiteClassByKabupaten(selectedMonth, selectedNop),
      previousMonth ? fetchReportingScorecards(previousMonth, selectedNop) : Promise.resolve(null),
      previousMonth ? fetchRevenueByKabupaten(previousMonth, selectedNop) : Promise.resolve([]),
    ])
      .then(([sc, rev, cls, prevSc, prevRev]) => {
        if (cancelled) return;
        setScorecards(sc);
        setRevenueData(rev);
        setSiteClassData(cls);
        setPreviousScorecards(prevSc);
        setPreviousRevenueData(prevRev || []);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [filtersReady, selectedMonth, selectedNop, previousMonth]);

  // Compute totals for revenue table
  const revenueTotals = useMemo(() => {
    return buildRevenueTotals(revenueData);
  }, [revenueData]);

  const previousRevenueTotals = useMemo(() => {
    return buildRevenueTotals(previousRevenueData);
  }, [previousRevenueData]);

  const revenuePreviousByKabupaten = useMemo(() => {
    return new Map(previousRevenueData.map((row) => [row.kabupaten, row]));
  }, [previousRevenueData]);

  // Compute totals for site class table
  const siteClassTotals = useMemo(() => {
    if (!siteClassData.length) return null;
    return siteClassData.reduce(
      (acc, row) => {
        acc.diamond += row.diamond;
        acc.platinum += row.platinum;
        acc.gold += row.gold;
        acc.silver += row.silver;
        acc.bronze += row.bronze;
        acc.total += row.total;
        return acc;
      },
      { diamond: 0, platinum: 0, gold: 0, silver: 0, bronze: 0, total: 0 },
    );
  }, [siteClassData]);

  // Compute totals for battery table
  const batteryTotals = useMemo(() => {
    if (!batteryData.length) return null;
    return batteryData.reduce(
      (acc, row) => {
        acc.lithium += row.lithium;
        acc.vrla += row.vrla;
        acc.tidak_ada += row.tidak_ada;
        acc.total += row.total;
        return acc;
      },
      { lithium: 0, vrla: 0, tidak_ada: 0, total: 0 },
    );
  }, [batteryData]);

  const revenueDomain = useMemo(() => getPaddedDomain(trendData, 'total_revenue'), [trendData]);
  const payloadDomain = useMemo(() => getPaddedDomain(trendData, 'total_payload'), [trendData]);

  // Format month label
  const formatMonthLabel = useCallback((val) => {
    if (!val) return '';
    const [y, m] = val.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
  }, []);

  const handleExportPdf = useCallback(() => {
    const previousTitle = document.title;
    const periodLabel = formatMonthLabel(selectedMonth) || 'Reporting';
    const nopLabel = selectedNop ? selectedNop.replace('NOP ', '') : 'Semua NOP';

    document.title = `Network Reporting - ${periodLabel} - ${nopLabel}`;
    window.print();
    document.title = previousTitle;
  }, [formatMonthLabel, selectedMonth, selectedNop]);

  const performanceInsights = useMemo(() => {
    const selectedIndex = trendData.findIndex((row) => row.trx_month === selectedMonth);
    const currentIndex = selectedIndex >= 0 ? selectedIndex : trendData.length - 1;
    const current = trendData[currentIndex];
    const previous = trendData[currentIndex - 1];

    const currentRevenue = current?.total_revenue ?? scorecards?.total_revenue;
    const currentPayload = current?.total_payload ?? scorecards?.total_payload;
    const revenueMom = getRelativeChange(currentRevenue, previous?.total_revenue);
    const payloadMom = getRelativeChange(currentPayload, previous?.total_payload);
    const availability = current?.avg_availability ?? scorecards?.avg_availability;
    const availabilityMom = getRelativeChange(availability, previous?.avg_availability);
    const targetDelta = currentRevenue == null ? null : currentRevenue - REVENUE_TARGET;
    const targetPercent = currentRevenue == null ? null : (currentRevenue / REVENUE_TARGET - 1) * 100;
    const revenueTargetMet = targetDelta != null && targetDelta >= 0;
    let monthsAboveTarget = 0;
    for (let i = currentIndex; i >= 0; i -= 1) {
      if (Number(trendData[i]?.total_revenue) < REVENUE_TARGET) break;
      monthsAboveTarget += 1;
    }

    const availabilityInsight = getAvailabilityTrendInsight({
      trendData,
      currentIndex,
      currentAvailability: availability,
      areaRows: revenueData,
    });
    const payloadInsight = getPayloadPeakInsight({
      trendData,
      currentIndex,
      currentPayload,
    });
    const selectedNopLabel = selectedNop ? selectedNop.replace('NOP ', '') : 'Semua NOP';

    return {
      periodLabel: `${formatMonthLabel(selectedMonth)} - ${selectedNopLabel}`,
      cards: [
        {
          label: 'Revenue',
          title: revenueTargetMet
            ? 'Revenue melampaui target'
            : 'Revenue di bawah target',
          summary: currentRevenue == null
            ? 'Data revenue belum tersedia untuk periode terpilih.'
            : `${formatRevenue(currentRevenue)} | ${formatRelativePercent(revenueMom)} MoM`,
          detail: currentRevenue == null
            ? null
            : `${revenueTargetMet ? 'Target terlampaui' : 'Gap terhadap target'} ${targetPercent == null ? '-' : `${Math.abs(targetPercent).toFixed(1).replace('.', ',')}%`}. ${getRevenueContributorInsight(revenueTotals, previousRevenueTotals)}`,
          chip: revenueTargetMet
            ? `${monthsAboveTarget || 1} bulan di atas target`
            : `Gap ${formatRevenueShort(Math.abs(targetDelta || 0))}`,
          tone: revenueTargetMet ? 'success' : 'warning',
          icon: revenueTargetMet ? CheckCircle2 : AlertTriangle,
        },
        {
          label: 'Availability',
          title: availabilityInsight.title,
          summary: `${availability == null ? '-' : formatPercent(availability)} | ${formatRelativePercent(availabilityMom, 2)} MoM`,
          detail: availabilityInsight.body,
          chip: availabilityInsight.chip,
          tone: availability == null || availability < 99.5 ? 'warning' : 'success',
          icon: availability == null || availability < 99.5 ? AlertTriangle : CheckCircle2,
        },
        {
          label: 'Payload Peak',
          title: payloadInsight.title,
          summary: currentPayload == null
            ? 'Data payload belum tersedia untuk periode terpilih.'
            : `${formatPayload(currentPayload)} | ${formatRelativePercent(payloadMom)} MoM`,
          detail: currentPayload == null
            ? null
            : `YTD ${formatPayload(scorecards?.payload_ytd)}. ${payloadInsight.body}`,
          chip: payloadInsight.chip,
          tone: 'info',
          icon: BarChart3,
        },
      ],
    };
  }, [
    formatMonthLabel,
    previousRevenueTotals,
    revenueData,
    revenueTotals,
    scorecards,
    selectedMonth,
    selectedNop,
    trendData,
  ]);

  const thClass = 'px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-elevated)] whitespace-nowrap sticky top-0 z-10';
  const tdClass = 'px-3 py-2 text-sm text-[var(--text-secondary)] whitespace-nowrap font-mono tabular-nums';
  const trHoverClass = 'hover:bg-[var(--bg-hover)]/50 transition-colors';

  return (
    <div className="reporting-export-root h-screen flex flex-col overflow-hidden bg-[var(--bg-base)]">
      {/* Header */}
      <header className="relative bg-gradient-to-r from-[var(--bg-base)] via-[var(--bg-surface)] to-[var(--bg-base)] border-b border-[var(--border)]">
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />
        <div className="absolute top-0 left-1/4 w-96 h-1 bg-gradient-to-r from-transparent via-[var(--primary)]/30 to-transparent blur-sm" />

        <div className="relative z-10 px-3 py-3 flex flex-col gap-3 xl:px-6 xl:flex-row xl:items-center xl:justify-between">
          {/* Left — Logo & Title */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => navigate('/home')}
              className="w-9 h-9 bg-[var(--bg-elevated)] rounded-xl flex items-center justify-center border border-[var(--border-light)] hover:bg-[var(--bg-hover)] hover:border-[var(--primary)]/30 transition-all duration-200"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
            <div className="w-9 h-9 bg-[var(--primary)]/15 rounded-xl flex items-center justify-center border border-[var(--primary)]/20">
              <BarChart3 className="w-5 h-5 text-[var(--primary-light)]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-tight text-[var(--text-primary)]">
                NETWORK REPORTING
              </h1>
              <p className="text-[11px] text-[var(--text-muted)] tracking-wide">
                Revenue, Payload & Infrastructure Analytics
              </p>
            </div>
          </div>

          {/* Right — Period Selector */}
          <div className="reporting-header-controls flex w-full flex-wrap items-end gap-2 xl:w-auto xl:flex-nowrap xl:gap-3">
            <button
              type="button"
              onClick={handleExportPdf}
              aria-label="Export reporting to PDF"
              className="reporting-no-print inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-light)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-all duration-200 hover:border-[var(--primary)]/35 hover:bg-[var(--bg-hover)] hover:text-[var(--primary-light)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/35"
            >
              <FileDown className="size-3.5" />
              Export PDF
            </button>
            <DashboardFilterBar className="w-full border-0 bg-transparent p-0 shadow-none sm:w-auto">
              <DashboardCombobox
                id="reporting-nop"
                label="NOP"
                value={selectedNop || ''}
                onChange={(value) => setSelectedNop(value || null)}
                options={nopOptions.map((option) => ({
                  value: option,
                  label: option.replace(/^NOP\s+/i, ''),
                }))}
                allLabel="Semua NOP"
              />
              <DashboardPeriodPicker
                id="reporting-period"
                label="Periode"
                value={selectedMonth || ''}
                onChange={setSelectedMonth}
                options={availableMonths.map((month) => ({
                  value: month,
                  label: formatMonthLabel(month),
                }))}
                includeAll={false}
              />
            </DashboardFilterBar>
          </div>
        </div>
      </header>
      <Breadcrumb />

      {/* Main Content — Scrollable */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Scorecards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {loading ? (
            [1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-[80px] rounded-xl" />)
          ) : (
            <>
              <Scorecard
                title="Total Site"
                value={formatNumber(scorecards?.total_sites)}
                metadata={[
                  { label: 'EPM', value: formatNumber(scorecards?.epm_sites) },
                  { label: 'Site (non EPM)', value: formatNumber(scorecards?.non_epm_sites) },
                ]}
                icon={Radio}
                accent="var(--primary)"
                glow="rgba(59, 130, 246, 0.15)"
                delay={0}
              />
              <Scorecard
                title="Total Revenue"
                value={formatRevenue(scorecards?.total_revenue)}
                momRate={getRelativeChange(scorecards?.total_revenue, previousScorecards?.total_revenue)}
                metadata={[
                  { label: 'YTD', value: formatRevenue(scorecards?.revenue_ytd) },
                ]}
                icon={Banknote}
                accent="#10B981"
                glow="rgba(16, 185, 129, 0.15)"
                delay={80}
              />
              <Scorecard
                title="Total Payload"
                value={formatPayload(scorecards?.total_payload)}
                momRate={getRelativeChange(scorecards?.total_payload, previousScorecards?.total_payload)}
                metadata={[
                  { label: 'YTD', value: formatPayload(scorecards?.payload_ytd) },
                ]}
                icon={HardDrive}
                accent="var(--info)"
                glow="rgba(6, 182, 212, 0.15)"
                delay={160}
              />
              <Scorecard
                title="Availability"
                value={formatPercent(scorecards?.avg_availability)}
                momRate={getRelativeChange(scorecards?.avg_availability, previousScorecards?.avg_availability)}
                momDigits={2}
                icon={Activity}
                accent={
                  scorecards?.avg_availability >= 99.5
                    ? 'var(--success)'
                    : scorecards?.avg_availability >= 95
                      ? 'var(--warning)'
                      : 'var(--danger)'
                }
                glow={
                  scorecards?.avg_availability >= 99.5
                    ? 'rgba(16, 185, 129, 0.15)'
                    : scorecards?.avg_availability >= 95
                      ? 'rgba(245, 158, 11, 0.15)'
                      : 'rgba(239, 68, 68, 0.15)'
                }
                delay={240}
              />
            </>
          )}
        </div>

        {trendData.length > 0 && (
          <ExecutiveInsightPanel insights={performanceInsights} />
        )}

        {/* Performance Trend Chart */}
        {trendData.length > 0 && (
          <DashboardChartPanel
            title="Performance Trend"
            icon={TrendingUp}
            className="animate-fade-in"
            action={(
              <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[var(--primary)]" /> Revenue
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" /> Payload
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-4 h-0.5 rounded-full" style={{ backgroundColor: '#D97706' }} /> Availability
                </span>
              </div>
            )}
            style={{ animationDelay: '300ms' }}
          >
            <div className="chart min-w-0">
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={trendData} margin={{ top: 5, right: 60, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="pldGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34D399" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#34D399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={themeTokens.chartGrid} vertical={false} />
                  <XAxis
                    dataKey="trx_month"
                    tickFormatter={formatMonthLabel}
                    tick={{ fontSize: 10, fill: themeTokens.axisTick }}
                    axisLine={{ stroke: themeTokens.chartGridStrong }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="rev"
                    domain={revenueDomain}
                    tickFormatter={(v) => `${(v / 1e9).toFixed(0)}M`}
                    tick={{ fontSize: 10, fill: themeTokens.axisTick }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                  />
                  <YAxis
                    yAxisId="pld"
                    orientation="right"
                    domain={payloadDomain}
                    tickFormatter={formatPayloadAxisTick}
                    tick={{ fontSize: 10, fill: themeTokens.axisTick }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                  />
                  <YAxis
                    yAxisId="avail"
                    orientation="right"
                    tickFormatter={formatAvailabilityAxisTick}
                    tick={{ fontSize: 10, fill: themeTokens.warning }}
                    axisLine={false}
                    tickLine={false}
                    domain={[availabilityDomainMin, availabilityDomainMax]}
                    width={34}
                  />
                  <Tooltip content={<TrendTooltip />} />
                  <Area
                    yAxisId="rev"
                    type="monotone"
                    dataKey="total_revenue"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    fill="url(#revGrad)"
                  />
                  <Area
                    yAxisId="pld"
                    type="monotone"
                    dataKey="total_payload"
                    stroke="#34D399"
                    strokeWidth={2}
                    fill="url(#pldGrad)"
                  />
                  <Line
                    yAxisId="avail"
                    type="monotone"
                    dataKey="avg_availability"
                    stroke="#D97706"
                    strokeWidth={4}
                    strokeLinecap="round"
                    dot={{ fill: '#D97706', r: 3, strokeWidth: 0 }}
                    activeDot={{ fill: '#D97706', r: 5, strokeWidth: 2, stroke: 'var(--bg-surface)' }}
                    connectNulls
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </DashboardChartPanel>
        )}

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-[var(--bg-elevated)] rounded-xl p-1 w-fit">
          {[
            { key: 'revenue', label: 'Performance Table', icon: Banknote },
            { key: 'siteclass', label: 'Site Class', icon: Layers },
            { key: 'battery', label: 'Battery Type', icon: Battery },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTable(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${activeTable === tab.key
                  ? 'bg-[var(--primary)]/15 text-[var(--primary-light)] border border-[var(--primary)]/20'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }`}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Performance Table */}
        {activeTable === 'revenue' && (
          <TableSection
            title="Performance Table"
            icon={Banknote}
            delay={400}
            action={
              <button
                type="button"
                onClick={() => setShowRevenueDetails((value) => !value)}
                aria-expanded={showRevenueDetails}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-light)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--primary-light)] hover:border-[var(--primary)]/30 transition-colors"
              >
                {showRevenueDetails ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                Detail Revenue
              </button>
            }
          >
            {loading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton h-10 rounded-lg" />)}
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className={thClass}>Kabupaten/Kota</th>
                    <th className={`${thClass} text-right`}>Sites</th>
                    <th className={`${thClass} text-right`}>Revenue Total</th>
                    <th className={`${thClass} text-right`}>Payload</th>
                    <th className={`${thClass} text-right`}>Traffic</th>
                    <th className={`${thClass} text-center`}>Availability</th>
                    <th className={`${thClass} text-right`}>Ticket SWFM</th>
                    <th className={`${thClass} text-right`}>Proker Activity</th>
                    {showRevenueDetails && (
                      <>
                        <th className={`${thClass} text-right`}>Rev Voice</th>
                        <th className={`${thClass} text-right`}>Rev BB</th>
                        <th className={`${thClass} text-right`}>Rev Digital</th>
                        <th className={`${thClass} text-right`}>Rev SMS</th>
                        <th className={`${thClass} text-right`}>Rev IR</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {revenueData.map((row, i) => {
                    const previousRow = revenuePreviousByKabupaten.get(row.kabupaten);
                    return (
                      <tr key={row.kabupaten} className={trHoverClass} style={{ animationDelay: `${i * 40}ms` }}>
                        <td className={`${tdClass} text-[var(--text-primary)] font-semibold font-sans`}>{row.kabupaten}</td>
                        <td className={`${tdClass} text-right`}>{formatNumber(row.total_sites)}</td>
                        <td className={`${tdClass} text-right text-emerald-400 font-semibold`}>
                          {formatRevenueShort(row.rev)}
                          <DeltaValue delta={getDelta(row.rev, previousRow?.rev)} formatter={formatRevenueShort} />
                        </td>
                        <td className={`${tdClass} text-right text-cyan-400`}>
                          {formatPayload(row.payload)}
                          <DeltaValue delta={getDelta(row.payload, previousRow?.payload)} formatter={formatPayload} />
                        </td>
                        <td className={`${tdClass} text-right`}>{formatTraffic(row.traffic)}</td>
                        <td className={`${tdClass} text-center`}>
                          <AvailabilityBadge value={row.avg_availability} />
                          <DeltaValue delta={getDelta(row.avg_availability, previousRow?.avg_availability)} formatter={formatPercent} />
                        </td>
                        <td className={`${tdClass} text-right`}>
                          BPS: {formatNumber(row.ticket_swfm_bps)} TS: {formatNumber(row.ticket_swfm_ts)}
                        </td>
                        <td className={`${tdClass} text-right`}>
                          Open: {formatNumber(row.proker_open)} Closed: {formatNumber(row.proker_closed)}
                        </td>
                        {showRevenueDetails && (
                          <>
                            <td className={`${tdClass} text-right`}>{formatRevenueShort(row.rev_voice)}</td>
                            <td className={`${tdClass} text-right`}>{formatRevenueShort(row.rev_bb)}</td>
                            <td className={`${tdClass} text-right`}>{formatRevenueShort(row.rev_dig)}</td>
                            <td className={`${tdClass} text-right`}>{formatRevenueShort(row.rev_sms)}</td>
                            <td className={`${tdClass} text-right`}>{formatRevenueShort(row.rev_ir)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                {revenueTotals && (
                  <tfoot>
                    <tr className="bg-[var(--bg-elevated)] border-t-2 border-[var(--primary)]/20">
                      <td className={`${tdClass} text-[var(--text-primary)] font-bold font-sans`}>TOTAL</td>
                      <td className={`${tdClass} text-right font-bold text-[var(--text-primary)]`}>{formatNumber(revenueTotals.total_sites)}</td>
                      <td className={`${tdClass} text-right font-bold text-emerald-400`}>
                        {formatRevenueShort(revenueTotals.rev)}
                        <DeltaValue delta={getDelta(revenueTotals.rev, previousRevenueTotals?.rev)} formatter={formatRevenueShort} />
                      </td>
                      <td className={`${tdClass} text-right font-bold text-cyan-400`}>
                        {formatPayload(revenueTotals.payload)}
                        <DeltaValue delta={getDelta(revenueTotals.payload, previousRevenueTotals?.payload)} formatter={formatPayload} />
                      </td>
                      <td className={`${tdClass} text-right font-bold`}>{formatTraffic(revenueTotals.traffic)}</td>
                      <td className={`${tdClass} text-center font-bold`}>
                        <AvailabilityBadge value={revenueTotals.avg_availability} />
                        <DeltaValue delta={getDelta(revenueTotals.avg_availability, previousRevenueTotals?.avg_availability)} formatter={formatPercent} />
                      </td>
                      <td className={`${tdClass} text-right font-bold`}>
                        BPS: {formatNumber(revenueTotals.ticket_swfm_bps)} TS: {formatNumber(revenueTotals.ticket_swfm_ts)}
                      </td>
                      <td className={`${tdClass} text-right font-bold`}>
                        Open: {formatNumber(revenueTotals.proker_open)} Closed: {formatNumber(revenueTotals.proker_closed)}
                      </td>
                      {showRevenueDetails && (
                        <>
                          <td className={`${tdClass} text-right font-bold`}>{formatRevenueShort(revenueTotals.rev_voice)}</td>
                          <td className={`${tdClass} text-right font-bold`}>{formatRevenueShort(revenueTotals.rev_bb)}</td>
                          <td className={`${tdClass} text-right font-bold`}>{formatRevenueShort(revenueTotals.rev_dig)}</td>
                          <td className={`${tdClass} text-right font-bold`}>{formatRevenueShort(revenueTotals.rev_sms)}</td>
                          <td className={`${tdClass} text-right font-bold`}>{formatRevenueShort(revenueTotals.rev_ir)}</td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </TableSection>
        )}

        {/* Site Class Table */}
        {activeTable === 'siteclass' && (
          <TableSection title="Site Class Distribution by Kabupaten/Kota" icon={Layers} delay={400}>
            {loading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton h-10 rounded-lg" />)}
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className={thClass}>Kabupaten/Kota</th>
                    <th className={`${thClass} text-center`}>Diamond</th>
                    <th className={`${thClass} text-center`}>Platinum</th>
                    <th className={`${thClass} text-center`}>Gold</th>
                    <th className={`${thClass} text-center`}>Silver</th>
                    <th className={`${thClass} text-center`}>Bronze</th>
                    <th className={`${thClass} text-right`}>Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {siteClassData.map((row) => (
                    <tr key={row.kabupaten} className={trHoverClass}>
                      <td className={`${tdClass} text-[var(--text-primary)] font-semibold font-sans`}>{row.kabupaten}</td>
                      <td className={`${tdClass} text-center`}><ClassBadge value={row.diamond} type="diamond" /></td>
                      <td className={`${tdClass} text-center`}><ClassBadge value={row.platinum} type="platinum" /></td>
                      <td className={`${tdClass} text-center`}><ClassBadge value={row.gold} type="gold" /></td>
                      <td className={`${tdClass} text-center`}><ClassBadge value={row.silver} type="silver" /></td>
                      <td className={`${tdClass} text-center`}><ClassBadge value={row.bronze} type="bronze" /></td>
                      <td className={`${tdClass} text-right font-bold text-[var(--text-primary)]`}>{row.total}</td>
                    </tr>
                  ))}
                </tbody>
                {siteClassTotals && (
                  <tfoot>
                    <tr className="bg-[var(--bg-elevated)] border-t-2 border-[var(--primary)]/20">
                      <td className={`${tdClass} text-[var(--text-primary)] font-bold font-sans`}>TOTAL</td>
                      <td className={`${tdClass} text-center`}><ClassBadge value={siteClassTotals.diamond} type="diamond" /></td>
                      <td className={`${tdClass} text-center`}><ClassBadge value={siteClassTotals.platinum} type="platinum" /></td>
                      <td className={`${tdClass} text-center`}><ClassBadge value={siteClassTotals.gold} type="gold" /></td>
                      <td className={`${tdClass} text-center`}><ClassBadge value={siteClassTotals.silver} type="silver" /></td>
                      <td className={`${tdClass} text-center`}><ClassBadge value={siteClassTotals.bronze} type="bronze" /></td>
                      <td className={`${tdClass} text-right font-bold text-[var(--text-primary)]`}>{siteClassTotals.total}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </TableSection>
        )}

        {/* Battery Type Table */}
        {activeTable === 'battery' && (
          <TableSection title="Battery Type Distribution by Kabupaten/Kota" icon={Battery} delay={400}>
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className={thClass}>Kabupaten/Kota</th>
                  <th className={`${thClass} text-center`}>Lithium</th>
                  <th className={`${thClass} text-center`}>VRLA</th>
                  <th className={`${thClass} text-center`}>Tidak Ada</th>
                  <th className={`${thClass} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {batteryData.map((row) => (
                  <tr key={row.kabupaten} className={trHoverClass}>
                    <td className={`${tdClass} text-[var(--text-primary)] font-semibold font-sans`}>{row.kabupaten}</td>
                    <td className={`${tdClass} text-center`}><BatteryBadge value={row.lithium} type="lithium" /></td>
                    <td className={`${tdClass} text-center`}><BatteryBadge value={row.vrla} type="vrla" /></td>
                    <td className={`${tdClass} text-center`}><BatteryBadge value={row.tidak_ada} type="tidak_ada" /></td>
                    <td className={`${tdClass} text-right font-bold text-[var(--text-primary)]`}>{row.total}</td>
                  </tr>
                ))}
              </tbody>
              {batteryTotals && (
                <tfoot>
                  <tr className="bg-[var(--bg-elevated)] border-t-2 border-[var(--primary)]/20">
                    <td className={`${tdClass} text-[var(--text-primary)] font-bold font-sans`}>TOTAL</td>
                    <td className={`${tdClass} text-center`}><BatteryBadge value={batteryTotals.lithium} type="lithium" /></td>
                    <td className={`${tdClass} text-center`}><BatteryBadge value={batteryTotals.vrla} type="vrla" /></td>
                    <td className={`${tdClass} text-center`}><BatteryBadge value={batteryTotals.tidak_ada} type="tidak_ada" /></td>
                    <td className={`${tdClass} text-right font-bold text-[var(--text-primary)]`}>{batteryTotals.total}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </TableSection>
        )}

        {/* Spacer */}
        <div className="h-4" />
      </main>
    </div>
  );
}
