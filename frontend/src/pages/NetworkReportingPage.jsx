import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Radio,
  DollarSign,
  HardDrive,
  Activity,
  ChevronDown,
  ArrowLeft,
  TrendingUp,
  Battery,
  Layers,
  MapPin,
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

/* ─── Scorecard Component ──────────────────────────────── */
function Scorecard({ title, value, subtitle, icon: Icon, accent, glow, delay = 0 }) {
  return (
    <div
      className="glass-card p-4 animate-fade-in cursor-default group"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-3">
        <div
          className="size-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110"
          style={{ backgroundColor: glow, boxShadow: `0 0 16px ${glow}` }}
        >
          <Icon className="size-5" style={{ color: accent }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-widest">
            {title}
          </p>
          <p className="text-xl font-bold font-mono tracking-tight" style={{ color: accent }}>
            {value}
          </p>
          {subtitle && (
            <p className="text-[10px] text-[var(--text-muted)] truncate">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
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
function TableSection({ title, icon: Icon, children, delay = 0 }) {
  return (
    <div
      className="glass-card overflow-hidden animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
        <Icon className="size-4 text-[var(--primary-light)]" />
        <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-wide">{title}</h2>
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
    <div className="glass-card p-3 !border-[var(--primary)]/20 text-xs space-y-1">
      <p className="font-semibold text-[var(--text-primary)]">{label}</p>
      {rev && (
        <p className="text-[var(--primary-light)]">
          Revenue: {formatRevenue(rev.value)}
        </p>
      )}
      {pld && (
        <p className="text-emerald-400">
          Payload: {formatPayload(pld.value)}
        </p>
      )}
      {avail && avail.value != null && (
        <p className="text-amber-400">
          Availability: {Number(avail.value).toFixed(2)}%
        </p>
      )}
    </div>
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
  const navigate = useNavigate();

  // State
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedNop, setSelectedNop] = useState(null);
  const [nopOptions, setNopOptions] = useState([]);
  const [scorecards, setScorecards] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [siteClassData, setSiteClassData] = useState([]);
  const [batteryData, setBatteryData] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTable, setActiveTable] = useState('revenue');

  // Load shared filter options on mount
  useEffect(() => {
    let cancelled = false;
    fetchFilterOptions()
      .then((options) => {
        if (cancelled) return;
        setNopOptions(options?.nop || []);
      })
      .catch(console.error);
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
    fetchRevenueTrend(selectedNop)
      .then(setTrendData)
      .catch(console.error);
  }, [selectedNop]);

  // Load battery data whenever the reporting NOP changes
  useEffect(() => {
    fetchBatteryByKabupaten(selectedNop)
      .then(setBatteryData)
      .catch(console.error);
  }, [selectedNop]);

  // Load period-dependent data when selectedMonth changes
  useEffect(() => {
    if (!selectedMonth) return;
    let cancelled = false;

    setLoading(true);
    Promise.all([
      fetchReportingScorecards(selectedMonth, selectedNop),
      fetchRevenueByKabupaten(selectedMonth, selectedNop),
      fetchSiteClassByKabupaten(selectedMonth, selectedNop),
    ])
      .then(([sc, rev, cls]) => {
        if (cancelled) return;
        setScorecards(sc);
        setRevenueData(rev);
        setSiteClassData(cls);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedMonth, selectedNop]);

  // Compute totals for revenue table
  const revenueTotals = useMemo(() => {
    if (!revenueData.length) return null;
    const totals = revenueData.reduce(
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
        if (row.avg_availability != null) {
          acc._avail_sum += row.avg_availability * row.total_sites;
          acc._avail_count += row.total_sites;
        }
        return acc;
      },
      { total_sites: 0, rev: 0, rev_voice: 0, rev_bb: 0, rev_dig: 0, rev_sms: 0, rev_ir: 0, payload: 0, traffic: 0, _avail_sum: 0, _avail_count: 0 },
    );
    totals.avg_availability = totals._avail_count > 0 ? totals._avail_sum / totals._avail_count : null;
    return totals;
  }, [revenueData]);

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

  const thClass = 'px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-elevated)] whitespace-nowrap sticky top-0 z-10';
  const tdClass = 'px-3 py-2 text-sm text-[var(--text-secondary)] whitespace-nowrap font-mono tabular-nums';
  const trHoverClass = 'hover:bg-[var(--bg-hover)]/50 transition-colors';

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--bg-base)]">
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

        <div className="relative z-10 px-6 py-3 flex items-center justify-between">
          {/* Left — Logo & Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-9 h-9 bg-[var(--bg-elevated)] rounded-xl flex items-center justify-center border border-[var(--border-light)] hover:bg-[var(--bg-hover)] hover:border-[var(--primary)]/30 transition-all duration-200"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
            <div className="w-9 h-9 bg-[var(--primary)]/15 rounded-xl flex items-center justify-center border border-[var(--primary)]/20">
              <BarChart3 className="w-5 h-5 text-[var(--primary-light)]" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-[var(--text-primary)]">
                NETWORK REPORTING
              </h1>
              <p className="text-[11px] text-[var(--text-muted)] tracking-wide">
                Revenue, Payload & Infrastructure Analytics
              </p>
            </div>
          </div>

          {/* Right — Period Selector */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <div className="relative">
                <select
                  id="reporting-nop"
                  value={selectedNop || ''}
                  onChange={(e) => setSelectedNop(e.target.value || null)}
                  className="appearance-none bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-light)] rounded-lg pl-3 pr-8 py-2 text-sm cursor-pointer hover:bg-[var(--bg-hover)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 focus:border-[var(--primary)]/40 backdrop-blur-sm min-w-[140px]"
                >
                  <option value="">Semua NOP</option>
                  {nopOptions.map((n) => (
                    <option key={n} value={n}>{n.replace('NOP ', '')}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none opacity-50 text-[var(--text-muted)]" />
              </div>
            </div>
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium">
              Periode
            </span>
            <div className="relative">
              <select
                id="reporting-period"
                value={selectedMonth || ''}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="appearance-none bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-light)] rounded-lg pl-3 pr-8 py-2 text-sm cursor-pointer hover:bg-[var(--bg-hover)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 focus:border-[var(--primary)]/40 backdrop-blur-sm min-w-[140px]"
              >
                {availableMonths.map((m) => (
                  <option key={m} value={m}>{formatMonthLabel(m)}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none opacity-50 text-[var(--text-muted)]" />
            </div>
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
                subtitle="site dengan data traktor"
                icon={Radio}
                accent="var(--primary)"
                glow="rgba(59, 130, 246, 0.15)"
                delay={0}
              />
              <Scorecard
                title="Total Revenue"
                value={formatRevenue(scorecards?.total_revenue)}
                subtitle={`${formatRevenueShort(scorecards?.total_revenue)} total`}
                icon={DollarSign}
                accent="#10B981"
                glow="rgba(16, 185, 129, 0.15)"
                delay={80}
              />
              <Scorecard
                title="Total Payload"
                value={formatPayload(scorecards?.total_payload)}
                subtitle="total data usage"
                icon={HardDrive}
                accent="var(--info)"
                glow="rgba(6, 182, 212, 0.15)"
                delay={160}
              />
              <Scorecard
                title="Availability"
                value={formatPercent(scorecards?.avg_availability)}
                subtitle="rata-rata availability jaringan"
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

        {/* Performance Trend Chart */}
        {trendData.length > 0 && (
          <div className="glass-card p-4 animate-fade-in" style={{ animationDelay: '300ms' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-[var(--primary-light)]" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-wide">Performance Trend</h2>
              </div>
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
            </div>
            <ResponsiveContainer width="100%" height={200}>
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
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="trx_month"
                  tickFormatter={formatMonthLabel}
                  tick={{ fontSize: 10, fill: '#64748B' }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="rev"
                  domain={revenueDomain}
                  tickFormatter={(v) => `${(v / 1e9).toFixed(0)}M`}
                  tick={{ fontSize: 10, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                  width={50}
                />
                <YAxis
                  yAxisId="pld"
                  orientation="right"
                  domain={payloadDomain}
                  tickFormatter={(v) => `${(v / 1_048_576).toFixed(0)}GB`}
                  tick={{ fontSize: 10, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                  width={50}
                />
                <YAxis
                  yAxisId="avail"
                  orientation="right"
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 10, fill: '#D97706' }}
                  axisLine={false}
                  tickLine={false}
                  domain={[availabilityDomainMin, availabilityDomainMax]}
                  width={45}
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
        )}

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-[var(--bg-elevated)] rounded-xl p-1 w-fit">
          {[
            { key: 'revenue', label: 'Revenue & Payload', icon: DollarSign },
            { key: 'siteclass', label: 'Site Class', icon: Layers },
            { key: 'battery', label: 'Battery Type', icon: Battery },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTable(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                activeTable === tab.key
                  ? 'bg-[var(--primary)]/15 text-[var(--primary-light)] border border-[var(--primary)]/20'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Revenue & Payload Table */}
        {activeTable === 'revenue' && (
          <TableSection title="Revenue & Payload by Kabupaten/Kota" icon={DollarSign} delay={400}>
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
                    <th className={`${thClass} text-right`}>Rev Voice</th>
                    <th className={`${thClass} text-right`}>Rev BB</th>
                    <th className={`${thClass} text-right`}>Rev Digital</th>
                    <th className={`${thClass} text-right`}>Rev SMS</th>
                    <th className={`${thClass} text-right`}>Rev IR</th>
                    <th className={`${thClass} text-right`}>Payload</th>
                    <th className={`${thClass} text-right`}>Traffic</th>
                    <th className={`${thClass} text-center`}>Availability</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {revenueData.map((row, i) => (
                    <tr key={row.kabupaten} className={trHoverClass} style={{ animationDelay: `${i * 40}ms` }}>
                      <td className={`${tdClass} text-[var(--text-primary)] font-semibold font-sans`}>{row.kabupaten}</td>
                      <td className={`${tdClass} text-right`}>{formatNumber(row.total_sites)}</td>
                      <td className={`${tdClass} text-right text-emerald-400 font-semibold`}>{formatRevenueShort(row.rev)}</td>
                      <td className={`${tdClass} text-right`}>{formatRevenueShort(row.rev_voice)}</td>
                      <td className={`${tdClass} text-right`}>{formatRevenueShort(row.rev_bb)}</td>
                      <td className={`${tdClass} text-right`}>{formatRevenueShort(row.rev_dig)}</td>
                      <td className={`${tdClass} text-right`}>{formatRevenueShort(row.rev_sms)}</td>
                      <td className={`${tdClass} text-right`}>{formatRevenueShort(row.rev_ir)}</td>
                      <td className={`${tdClass} text-right text-cyan-400`}>{formatPayload(row.payload)}</td>
                      <td className={`${tdClass} text-right`}>{formatTraffic(row.traffic)}</td>
                      <td className={`${tdClass} text-center`}><AvailabilityBadge value={row.avg_availability} /></td>
                    </tr>
                  ))}
                </tbody>
                {revenueTotals && (
                  <tfoot>
                    <tr className="bg-[var(--bg-elevated)] border-t-2 border-[var(--primary)]/20">
                      <td className={`${tdClass} text-[var(--text-primary)] font-bold font-sans`}>TOTAL</td>
                      <td className={`${tdClass} text-right font-bold text-[var(--text-primary)]`}>{formatNumber(revenueTotals.total_sites)}</td>
                      <td className={`${tdClass} text-right font-bold text-emerald-400`}>{formatRevenueShort(revenueTotals.rev)}</td>
                      <td className={`${tdClass} text-right font-bold`}>{formatRevenueShort(revenueTotals.rev_voice)}</td>
                      <td className={`${tdClass} text-right font-bold`}>{formatRevenueShort(revenueTotals.rev_bb)}</td>
                      <td className={`${tdClass} text-right font-bold`}>{formatRevenueShort(revenueTotals.rev_dig)}</td>
                      <td className={`${tdClass} text-right font-bold`}>{formatRevenueShort(revenueTotals.rev_sms)}</td>
                      <td className={`${tdClass} text-right font-bold`}>{formatRevenueShort(revenueTotals.rev_ir)}</td>
                      <td className={`${tdClass} text-right font-bold text-cyan-400`}>{formatPayload(revenueTotals.payload)}</td>
                      <td className={`${tdClass} text-right font-bold`}>{formatTraffic(revenueTotals.traffic)}</td>
                      <td className={`${tdClass} text-center font-bold`}><AvailabilityBadge value={revenueTotals.avg_availability} /></td>
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
                  {siteClassData.map((row, i) => (
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
