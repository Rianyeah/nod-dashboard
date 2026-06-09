import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BellRing,
  CircleCheck,
  Gauge,
  HardDrive,
  Network,
  Radio,
  ShieldAlert,
  Signal,
  TicketCheck,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Breadcrumb from '../components/Breadcrumb';
import Header from '../components/Header';
import { useDashboardSidebar } from '../hooks/useDashboardSidebar';
import { useDashboardThemeTokens } from '../hooks/useDashboardThemeTokens';
import {
  DashboardChartPanel,
  DashboardChartTooltip,
  DashboardKpiCard,
} from '../components/ui/DashboardPrimitives';
import {
  fetchFilterOptions,
  fetchImpactServiceFilters,
  fetchLatestPeriod,
  fetchOverview,
  fetchTicketingFilters,
  fetchTransportQualityFilters,
} from '../services/api';
import {
  formatNumber,
  formatPayload,
  formatPercent,
  formatRevenue,
  formatRevenueShort,
} from '../utils/formatters';

const MONTH_LABELS = {
  1: 'Januari',
  2: 'Februari',
  3: 'Maret',
  4: 'April',
  5: 'Mei',
  6: 'Juni',
  7: 'Juli',
  8: 'Agustus',
  9: 'September',
  10: 'Oktober',
  11: 'November',
  12: 'Desember',
};

const TONES = {
  success: {
    text: 'text-emerald-300',
    border: 'border-emerald-500/25',
    bg: 'bg-emerald-500/10',
    fill: '#10B981',
  },
  warning: {
    text: 'text-amber-300',
    border: 'border-amber-500/25',
    bg: 'bg-amber-500/10',
    fill: '#F59E0B',
  },
  danger: {
    text: 'text-red-300',
    border: 'border-red-500/25',
    bg: 'bg-red-500/10',
    fill: '#EF4444',
  },
  info: {
    text: 'text-sky-300',
    border: 'border-sky-500/25',
    bg: 'bg-sky-500/10',
    fill: '#60A5FA',
  },
};

const HOME_DEFAULT_NOP = 'SIDOARJO';
const PRIORITY_TONE_RANK = {
  danger: 0,
  warning: 1,
  success: 2,
  info: 3,
};

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatDateLabel(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}`.slice(0, 10) + 'T00:00:00'));
}

function formatPeriodLabel(bulan, tahun) {
  if (!bulan || !tahun) return 'Latest period';
  return `${MONTH_LABELS[bulan] || bulan} ${tahun}`;
}

function formatMonthLabel(value) {
  if (!value) return '';
  const [year, month] = String(value).split('-');
  const monthLabel = MONTH_LABELS[Number(month)] || month;
  return `${monthLabel?.slice(0, 3)} ${year}`;
}

function formatShortDateLabel(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${value}`.slice(0, 10) + 'T00:00:00'));
}

function normalizeNopOption(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/^NOP\s+/i, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
  return normalized || null;
}

function mergeNopOptions(...groups) {
  const unique = new Map();
  groups.flat().forEach((value) => {
    const normalized = normalizeNopOption(value);
    if (normalized && normalized !== 'UNKNOWN') unique.set(normalized, normalized);
  });
  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b));
}

function formatPayloadAxisTick(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const gb = number / 1_048_576;
  if (gb >= 1_000) return `${(gb / 1_000).toFixed(1)}TB`;
  return `${Math.round(gb)}GB`;
}

function getAvailabilityTone(value) {
  const availability = asNumber(value, null);
  if (availability == null) return 'info';
  if (availability >= 99.5) return 'success';
  if (availability >= 95) return 'warning';
  return 'danger';
}

function getCountTone(value, warningAt = 1, dangerAt = 10) {
  const count = asNumber(value, 0);
  if (count >= dangerAt) return 'danger';
  if (count >= warningAt) return 'warning';
  return 'success';
}

function getTicketTone(rate) {
  const value = asNumber(rate, 0);
  if (value > 10) return 'danger';
  if (value > 5) return 'warning';
  return 'success';
}

function getMomTone(value) {
  if (value == null) return 'text-[var(--text-muted)]';
  if (value < 0) return 'text-red-300';
  if (value > 0) return 'text-emerald-300';
  return 'text-[var(--text-muted)]';
}

function getTrendDelta(trendRows, keyName) {
  if (!trendRows?.length || trendRows.length < 2) return null;
  const current = asNumber(trendRows[trendRows.length - 1]?.[keyName], null);
  const previous = asNumber(trendRows[trendRows.length - 2]?.[keyName], null);
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function getRevenueDelta(trendRows) {
  return getTrendDelta(trendRows, 'total_revenue');
}

function formatSignedPercent(value) {
  if (value == null) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1).replace('.', ',')}%`;
}

function getLatestDailyRow(rows) {
  const validRows = (rows || [])
    .filter((row) => row?.tanggal)
    .sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)));
  return validRows[validRows.length - 1] || null;
}

function formatOutageHours(minutes) {
  const value = asNumber(minutes, 0) / 60;
  return `${value.toFixed(value >= 10 ? 0 : 1)}h`;
}

function buildPaddedDomain(rows, keyName, options = {}) {
  const values = (rows || [])
    .map((row) => asNumber(row?.[keyName], null))
    .filter((value) => value != null);
  if (!values.length) return ['auto', 'auto'];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, Math.abs(max) * 0.08, 1);
  const lower = Math.max(options.minLimit ?? -Infinity, min - span * 0.18);
  const upper = Math.min(options.maxLimit ?? Infinity, max + span * 0.18);
  return [Math.floor(lower), Math.ceil(upper)];
}

function buildAvailabilityDomain(rows) {
  const values = (rows || [])
    .map((row) => asNumber(row?.avg_availability, null))
    .filter((value) => value != null);
  if (!values.length) return [95, 100];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, 0.15);
  const padding = Math.max(spread * 0.35, 0.08);
  const lower = Math.max(0, Math.floor((min - padding) * 10) / 10);
  const upper = Math.min(100, Math.ceil((max + padding) * 10) / 10);

  if (lower === upper) {
    return [Math.max(0, lower - 0.1), Math.min(100, upper + 0.1)];
  }
  return [lower, upper];
}

function buildLastUpdateRows(overview, bulan, tahun) {
  const period = overview?.period || {};
  return [
    { label: 'Availability', value: formatPeriodLabel(period.bulan || bulan, period.tahun || tahun) },
    { label: 'Reporting', value: formatMonthLabel(period.trx_month) || formatPeriodLabel(bulan, tahun) },
    { label: 'Impact', value: formatDateLabel(period.impact_end_date) },
    { label: 'Transport', value: formatDateLabel(period.transport_date) },
    { label: 'Ticket FC', value: formatDateLabel(overview?.ticketing?.summary?.last_created_at || period.ticketing_end_date) },
  ];
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const revenue = payload.find((item) => item.dataKey === 'total_revenue');
  const payloadData = payload.find((item) => item.dataKey === 'total_payload');
  const availability = payload.find((item) => item.dataKey === 'avg_availability');
  return (
    <DashboardChartTooltip
      active={active}
      label={label}
      labelFormatter={formatMonthLabel}
      payload={[
        revenue && { ...revenue, name: 'Revenue', value: formatRevenue(revenue.value), color: 'var(--primary-light)' },
        payloadData && { ...payloadData, name: 'Payload', value: formatPayload(payloadData.value), color: 'var(--success)' },
        availability && { ...availability, name: 'Availability', value: formatPercent(availability.value), color: 'var(--warning)' },
      ].filter(Boolean)}
    />
  );
}

function MetricCard({ title, value, subtitle, icon: Icon, tone = 'info' }) {
  return (
    <DashboardKpiCard title={title} value={value} subtitle={subtitle} icon={Icon} tone={tone} />
  );
}

function formatPotentialPercent(value) {
  const number = asNumber(value, 0);
  return `${number.toFixed(1).replace('.', ',')}%`;
}

function PotentialItem({ label, metric, tone = 'info' }) {
  const colors = TONES[tone] || TONES.info;
  const total = asNumber(metric?.total, 0);
  return (
    <div
      className={`flex min-h-[82px] items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]/45 ${colors.border} ${colors.bg}`}
    >
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
        <p className={`mt-1 truncate font-mono text-[24px] font-bold leading-none ${colors.text}`}>{formatNumber(total)}</p>
        <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{formatPotentialPercent(metric?.percentage)} dari total site</p>
      </div>
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors.fill }} />
    </div>
  );
}

function ClassBreakdownLegend({ rows = [] }) {
  const palette = ['#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#64748B'];
  const visibleRows = rows.slice(0, 6);
  return (
    <div className="min-h-[82px] rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3">
      <p className="truncate text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Class Site</p>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {visibleRows.map((row, index) => (
          <div key={row.label || index} className="flex min-w-0 items-center gap-1.5 text-[11px]">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: palette[index % palette.length] }} />
            <span className="truncate text-[var(--text-secondary)]">{row.label || 'Unknown'}</span>
            <span className="ml-auto shrink-0 font-mono text-sm font-semibold text-[var(--text-primary)]">{formatNumber(row.total)}</span>
          </div>
        ))}
        {!visibleRows.length && (
          <p className="col-span-2 text-[10px] text-[var(--text-muted)]">Class site belum tersedia.</p>
        )}
      </div>
    </div>
  );
}

function ChartEmpty({ label }) {
  return (
    <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]/35">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

function MiniChartEmpty({ label }) {
  return (
    <div className="flex h-[82px] items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]/35">
      <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

function ModuleMiniTooltip({ active, payload, label, labelFormatter, formatters = {} }) {
  if (!active || !payload?.length) return null;
  return (
    <DashboardChartTooltip
      active={active}
      label={label}
      labelFormatter={labelFormatter}
      payload={payload.map((item) => ({
        ...item,
        value: formatters[item.dataKey] ? formatters[item.dataKey](item.value) : formatNumber(item.value),
      }))}
    />
  );
}

function MiniLegend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--text-muted)]">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1">
          <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function ReportingMiniChart({ rows }) {
  const chartRows = (rows || []).slice(-6);
  if (!chartRows.length) return <MiniChartEmpty label="Trend reporting belum tersedia." />;

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={82}>
        <ComposedChart data={chartRows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis dataKey="trx_month" tickFormatter={formatMonthLabel} interval="preserveStartEnd" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="revenue" hide />
          <YAxis yAxisId="payload" hide />
          <Tooltip
            content={(
              <ModuleMiniTooltip
                labelFormatter={formatMonthLabel}
                formatters={{ total_revenue: formatRevenue, total_payload: formatPayload }}
              />
            )}
          />
          <Bar yAxisId="revenue" dataKey="total_revenue" name="Revenue" fill="#60A5FA" radius={[3, 3, 0, 0]} opacity={0.78} />
          <Line yAxisId="payload" type="monotone" dataKey="total_payload" name="Payload" stroke="#10B981" strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
      <MiniLegend items={[
        { label: 'Revenue', color: '#60A5FA' },
        { label: 'Payload', color: '#10B981' },
      ]} />
    </div>
  );
}

function ImpactServiceDailyChart({ rows }) {
  const chartRows = (rows || []).slice(-8);
  if (!chartRows.length) return <MiniChartEmpty label="Trend harian impact belum tersedia." />;

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={82}>
        <ComposedChart data={chartRows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis dataKey="tanggal" tickFormatter={formatShortDateLabel} interval="preserveStartEnd" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
          <YAxis hide />
          <Tooltip content={<ModuleMiniTooltip labelFormatter={formatShortDateLabel} />} />
          <Bar dataKey="open" name="OPEN" stackId="impact" fill="#EF4444" radius={[3, 3, 0, 0]} />
          <Bar dataKey="clear" name="CLEAR" stackId="impact" fill="#10B981" radius={[3, 3, 0, 0]} />
          <Line type="monotone" dataKey="total" name="Total" stroke="#F59E0B" strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
      <MiniLegend items={[
        { label: 'OPEN', color: '#EF4444' },
        { label: 'CLEAR', color: '#10B981' },
        { label: 'Total', color: '#F59E0B' },
      ]} />
    </div>
  );
}

function TransportQualityMiniChart({ rows }) {
  const chartRows = (rows || []).slice(-8);
  if (!chartRows.length) return <MiniChartEmpty label="Trend transport belum tersedia." />;

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={82}>
        <ComposedChart data={chartRows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" tickFormatter={formatShortDateLabel} interval="preserveStartEnd" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="count" hide />
          <YAxis yAxisId="latency" hide />
          <Tooltip content={<ModuleMiniTooltip labelFormatter={formatShortDateLabel} />} />
          <Bar yAxisId="count" dataKey="p1_sites" name="P1 Sites" fill="#EF4444" radius={[3, 3, 0, 0]} opacity={0.82} />
          <Line yAxisId="count" type="monotone" dataKey="pl_over_1_sites" name="PL > 1%" stroke="#F59E0B" strokeWidth={2} dot={false} connectNulls />
          <Line yAxisId="latency" type="monotone" dataKey="latency_over_5_sites" name="Latency > 5ms" stroke="#60A5FA" strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
      <MiniLegend items={[
        { label: 'P1', color: '#EF4444' },
        { label: 'PL > 1%', color: '#F59E0B' },
        { label: 'Latency', color: '#60A5FA' },
      ]} />
    </div>
  );
}

function TicketFaultCenterMiniChart({ rows }) {
  const chartRows = (rows || []).slice(-8);
  if (!chartRows.length) return <MiniChartEmpty label="Trend ticket belum tersedia." />;

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={82}>
        <ComposedChart data={chartRows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" interval="preserveStartEnd" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
          <YAxis hide />
          <Tooltip content={<ModuleMiniTooltip />} />
          <Bar dataKey="bps" name="BPS" stackId="ticket" fill="#10B981" radius={[3, 3, 0, 0]} />
          <Bar dataKey="ts" name="TS" stackId="ticket" fill="#60A5FA" radius={[3, 3, 0, 0]} />
          <Line type="monotone" dataKey="total" name="Total" stroke="#F59E0B" strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
      <MiniLegend items={[
        { label: 'BPS', color: '#10B981' },
        { label: 'TS', color: '#60A5FA' },
        { label: 'Total', color: '#F59E0B' },
      ]} />
    </div>
  );
}

function ModulePanel({ title, icon: Icon, children, action }) {
  return (
    <DashboardChartPanel title={title} icon={Icon} action={action} className="flex min-h-[244px] flex-col">
      <div className="flex flex-1 flex-col justify-between gap-4">{children}</div>
    </DashboardChartPanel>
  );
}

function MetricLine({ label, value, tone = 'text-[var(--text-primary)]' }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="truncate text-[var(--text-muted)]">{label}</span>
      <span className={`shrink-0 font-mono font-semibold ${tone}`}>{value}</span>
    </div>
  );
}

function InsightRow({ label, value, detail, tone = 'info', to }) {
  const colors = TONES[tone] || TONES.info;
  return (
    <Link
      to={to}
      className={`rounded-lg border p-3 transition-colors hover:bg-[var(--bg-hover)]/45 ${colors.border} ${colors.bg}`}
    >
      <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <p className={`mt-1 truncate font-mono text-sm font-bold ${colors.text}`}>{value}</p>
      <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{detail}</p>
    </Link>
  );
}

function ExecutiveInsightPanel({ availability, latestImpactDaily, transport, ticketingSummary, worstSites }) {
  const worstSite = (worstSites || [])[0];
  const ticketCategory = ticketingSummary?.ticket_category || {};

  return (
    <section className="glass-card min-w-0 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldAlert className="size-4 shrink-0 text-[var(--primary-light)]" />
          <h2 className="truncate text-sm font-semibold text-[var(--text-primary)]">Executive Insight</h2>
        </div>
        <Link to="/site-map" className="rounded-lg border border-[var(--border-light)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)]">
          Open Site Map
        </Link>
      </div>
      <div className="grid min-h-[260px] grid-cols-1 content-start gap-2">
        <InsightRow
          label="Network exposure"
          value={`${formatNumber(availability?.site_critical)} critical availability`}
          detail={worstSite ? `${worstSite.site_id} at ${formatPercent(worstSite.avg_availability)}` : `${formatNumber(availability?.site_degraded)} degraded sites`}
          tone={getCountTone(availability?.site_critical, 1, 5)}
          to="/site-map"
        />
        <InsightRow
          label="Impact Service"
          value={`${formatNumber(latestImpactDaily?.total)} latest alarm`}
          detail={`Open: ${formatNumber(latestImpactDaily?.open)} Clear: ${formatNumber(latestImpactDaily?.clear)} | ${formatShortDateLabel(latestImpactDaily?.tanggal) || '-'}`}
          tone={getCountTone(latestImpactDaily?.open, 1, 50)}
          to="/impact-service"
        />
        <InsightRow
          label="Ticket Fault Center"
          value={`BPS: ${formatNumber(ticketCategory.bps)} TS: ${formatNumber(ticketCategory.ts)}`}
          detail={`${formatPercent(ticketingSummary?.out_sla_rate)} OUT SLA rate`}
          tone={getTicketTone(ticketingSummary?.out_sla_rate)}
          to="/ticketing"
        />
        <InsightRow
          label="Transport Quality"
          value={`${formatNumber(transport?.priority_sites)} priority sites`}
          detail={`${formatNumber(transport?.p1_sites)} P1, ${formatNumber(transport?.p2_sites)} P2`}
          tone={getCountTone(transport?.p1_sites, 1, 8)}
          to="/transport-quality"
        />
      </div>
    </section>
  );
}

function buildPrioritySignals(overview, latestImpactDaily) {
  const availability = overview?.availability || {};
  const transport = overview?.transport_quality || {};
  const ticketing = overview?.ticketing?.summary || {};
  const worstSites = overview?.worst_sites || [];
  const transportPrioritySites = overview?.transport_priority_sites?.items || [];
  const ticketingTopSites = overview?.ticketing?.top_sites || [];
  const signals = [];

  if (asNumber(availability.site_critical) > 0) {
    signals.push({
      title: `${formatNumber(availability.site_critical)} critical availability sites`,
      detail: 'Network Availability',
      tone: 'danger',
      to: '/site-map',
    });
  }
  if (asNumber(latestImpactDaily?.open) > 0) {
    signals.push({
      title: `${formatNumber(latestImpactDaily?.open)} OPEN alarm`,
      detail: `Impact Service | ${formatShortDateLabel(latestImpactDaily?.tanggal)}`,
      tone: getCountTone(latestImpactDaily?.open, 1, 50),
      to: '/impact-service',
    });
  }
  if (asNumber(transport.p1_sites) > 0) {
    signals.push({
      title: `${formatNumber(transport.p1_sites)} P1 transport sites`,
      detail: 'Transport Quality',
      tone: getCountTone(transport.p1_sites, 1, 8),
      to: '/transport-quality',
    });
  }
  if (asNumber(ticketing.out_sla_tickets) > 0) {
    signals.push({
      title: `${formatNumber(ticketing.out_sla_tickets)} OUT SLA tickets`,
      detail: 'Ticket Fault Center',
      tone: getTicketTone(ticketing.out_sla_rate),
      to: '/ticketing',
    });
  }
  worstSites.slice(0, 2).forEach((site) => {
    signals.push({
      title: `${site.site_id} at ${formatPercent(site.avg_availability)}`,
      detail: site.kabupaten || 'Worst Sites',
      tone: getAvailabilityTone(site.avg_availability),
      to: '/site-map',
    });
  });
  transportPrioritySites.slice(0, 2).forEach((site) => {
    signals.push({
      title: `${site.site_id} - ${site.priority_level}`,
      detail: 'Transport Priority',
      tone: site.priority_level === 'P1' ? 'danger' : 'warning',
      to: '/transport-quality',
    });
  });
  ticketingTopSites.slice(0, 2).forEach((site) => {
    signals.push({
      title: `${site.site_id} - ${formatNumber(site.tickets)} tickets`,
      detail: 'Ticket FC Site',
      tone: getTicketTone(site.out_sla_rate),
      to: '/ticketing',
    });
  });

  return signals
    .sort((a, b) => PRIORITY_TONE_RANK[a.tone] - PRIORITY_TONE_RANK[b.tone])
    .slice(0, 6);
}

export default function HomePage() {
  const { setLastUpdates } = useDashboardSidebar();
  const themeTokens = useDashboardThemeTokens();
  const [bulan, setBulan] = useState(() => Number(import.meta.env.VITE_DEFAULT_BULAN) || null);
  const [tahun, setTahun] = useState(() => Number(import.meta.env.VITE_DEFAULT_TAHUN) || null);
  const [nop, setNop] = useState(null);
  const [nopOptions, setNopOptions] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchFilterOptions().catch(() => ({ nop: [] })),
      fetchImpactServiceFilters().catch(() => ({ nops: [] })),
      fetchTransportQualityFilters().catch(() => ({ nops: [] })),
      fetchTicketingFilters().catch(() => ({ nops: [] })),
      fetchLatestPeriod().catch(() => null),
    ])
      .then(([siteOptions, impactOptions, transportOptions, ticketingOptions, latest]) => {
        if (cancelled) return;
        const mergedNops = mergeNopOptions(
          siteOptions?.nop,
          impactOptions?.nops,
          transportOptions?.nops,
          ticketingOptions?.nops,
        );
        setNopOptions(mergedNops);
        if (mergedNops.includes(HOME_DEFAULT_NOP)) {
          setNop(HOME_DEFAULT_NOP);
        }
        if (latest?.bulan && latest?.tahun) {
          setBulan(Number(latest.bulan));
          setTahun(Number(latest.tahun));
        } else {
          const fallbackDate = new Date();
          setBulan((current) => current || fallbackDate.getMonth() + 1);
          setTahun((current) => current || fallbackDate.getFullYear());
        }
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!bulan || !tahun) return;
    let cancelled = false;

    Promise.resolve()
      .then(() => {
        if (cancelled) return null;
        setLoading(true);
        setError('');
        return fetchOverview({ bulan, tahun, nop });
      })
      .then((data) => {
        if (!cancelled && data) setOverview(data);
      })
      .catch((err) => {
        console.error('Failed to load Home overview:', err);
        if (!cancelled) setError('Gagal memuat Home overview.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [bulan, nop, tahun]);

  useEffect(() => {
    setLastUpdates(buildLastUpdateRows(overview, bulan, tahun));
  }, [bulan, overview, setLastUpdates, tahun]);

  const availability = overview?.availability || {};
  const reporting = overview?.reporting || {};
  const trendRows = (overview?.reporting_trend || []).slice(-6);
  const impact = overview?.impact_service || {};
  const impactDailyTrend = overview?.impact_daily_trend || [];
  const latestImpactDaily = getLatestDailyRow(impactDailyTrend);
  const transport = overview?.transport_quality || {};
  const ticketingSummary = overview?.ticketing?.summary || {};
  const ticketCategory = ticketingSummary.ticket_category || {};
  const ticketingTrend = overview?.ticketing?.trend || [];
  const sitePotential = overview?.site_potential || {};
  const worstAvailabilitySites = overview?.worst_sites || [];
  const worstRevenueSites = overview?.worst_revenue_sites || [];

  const revenueDelta = getRevenueDelta(overview?.reporting_trend || []);
  const availabilityDelta = getTrendDelta(trendRows, 'avg_availability');
  const payloadDelta = getTrendDelta(trendRows, 'total_payload');
  const prioritySignals = buildPrioritySignals(overview, latestImpactDaily);
  const homeRevenueDomain = buildPaddedDomain(trendRows, 'total_revenue');
  const homePayloadDomain = buildPaddedDomain(trendRows, 'total_payload');
  const homeAvailabilityDomain = buildAvailabilityDomain(trendRows);

  const scorecards = [
    {
      title: 'Total Sites',
      value: formatNumber(availability.total_site_dengan_data || reporting.total_sites),
      subtitle: formatPeriodLabel(bulan, tahun),
      icon: Network,
      tone: 'info',
    },
    {
      title: 'Network Availability',
      value: formatPercent(availability.avg_availability),
      subtitle: `${formatSignedPercent(availabilityDelta)} MoM`,
      icon: Signal,
      tone: getAvailabilityTone(availability.avg_availability),
    },
    {
      title: 'Revenue',
      value: formatRevenue(reporting.total_revenue),
      subtitle: `${formatSignedPercent(revenueDelta)} MoM`,
      icon: BarChart3,
      tone: revenueDelta == null || revenueDelta >= 0 ? 'success' : 'warning',
    },
    {
      title: 'Payload',
      value: formatPayload(reporting.total_payload),
      subtitle: `${formatSignedPercent(payloadDelta)} MoM`,
      icon: HardDrive,
      tone: 'info',
    },
    {
      title: 'Ticket Fault Center',
      value: formatNumber(ticketingSummary.total_tickets),
      subtitle: `BPS: ${formatNumber(ticketCategory.bps)} TS: ${formatNumber(ticketCategory.ts)}`,
      icon: TicketCheck,
      tone: getTicketTone(ticketingSummary.out_sla_rate),
    },
    {
      title: 'Today Impact Service',
      value: formatNumber(latestImpactDaily?.total ?? impact.total_alarms),
      subtitle: `Open: ${formatNumber(latestImpactDaily?.open ?? impact.open_alarms)} Clear: ${formatNumber(latestImpactDaily?.clear ?? impact.clear_alarms)}`,
      icon: BellRing,
      tone: getCountTone(latestImpactDaily?.open ?? impact.open_alarms, 1, 50),
    },
    {
      title: 'Transport Quality',
      value: formatNumber(transport.priority_sites),
      subtitle: `${formatNumber(transport.p1_sites)} P1, ${formatNumber(transport.p2_sites)} P2`,
      icon: Radio,
      tone: getCountTone(transport.p1_sites, 1, 8),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Header
        bulan={bulan}
        tahun={tahun}
        nop={nop}
        nopOptions={nopOptions}
        onBulanChange={setBulan}
        onTahunChange={setTahun}
        onNopChange={setNop}
      />
      <Breadcrumb />

      <main className="flex-1 space-y-4 overflow-y-auto p-4">
        <section className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Command Center</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {formatPeriodLabel(bulan, tahun)} {nop ? `- ${nop}` : '- Semua NOP'}
            </p>
          </div>
        </section>

        {error && (
          <section className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </section>
        )}

        {overview?.errors && Object.keys(overview.errors).length > 0 && (
          <section className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
            Partial data: {Object.keys(overview.errors).join(', ')}
          </section>
        )}

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          {loading && !overview
            ? Array.from({ length: 7 }, (_, index) => <div key={index} className="skeleton h-[104px] rounded-xl" />)
            : scorecards.map((card) => <MetricCard key={card.title} {...card} />)}
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2">
            <Gauge className="size-4 text-[var(--primary-light)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Data Potensi Site</h2>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
            <PotentialItem label="Site Lithium" metric={sitePotential.site_lithium} tone="success" />
            <PotentialItem label="Site VRLA" metric={sitePotential.site_vrla} tone="info" />
            <PotentialItem label="ENVA Validated" metric={sitePotential.enva_validated} tone="success" />
            <PotentialItem label="Radio IP" metric={sitePotential.radio_ip} tone="warning" />
            <ClassBreakdownLegend rows={sitePotential.class_breakdown || []} />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.65fr)]">
          <DashboardChartPanel
            title="Performance Trend"
            icon={TrendingUp}
            action={(
              <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-sky-400" /> Revenue</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-400" /> Payload</span>
                <span className="flex items-center gap-1"><span className="h-0.5 w-4 rounded-full bg-amber-400" /> Availability</span>
              </div>
            )}
          >
            {trendRows.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={trendRows} margin={{ top: 8, right: 60, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="homeRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60A5FA" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#60A5FA" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="homePayloadGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={themeTokens.chartGrid} vertical={false} />
                  <XAxis dataKey="trx_month" tickFormatter={formatMonthLabel} tick={{ fontSize: 10, fill: themeTokens.axisTick }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="revenue" domain={homeRevenueDomain} tickFormatter={formatRevenueShort} tick={{ fontSize: 10, fill: themeTokens.axisTick }} tickLine={false} axisLine={false} width={54} />
                  <YAxis yAxisId="payload" orientation="right" domain={homePayloadDomain} tickFormatter={formatPayloadAxisTick} tick={{ fontSize: 10, fill: themeTokens.axisTick }} tickLine={false} axisLine={false} width={42} />
                  <YAxis yAxisId="availability" orientation="right" domain={homeAvailabilityDomain} tickCount={5} allowDataOverflow tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10, fill: themeTokens.warning }} tickLine={false} axisLine={false} width={42} />
                  <Tooltip content={<TrendTooltip />} />
                  <Area yAxisId="revenue" type="monotone" dataKey="total_revenue" stroke="#60A5FA" strokeWidth={2} fill="url(#homeRevenueGradient)" />
                  <Area yAxisId="payload" type="monotone" dataKey="total_payload" stroke="#10B981" strokeWidth={2} fill="url(#homePayloadGradient)" />
                  <Line yAxisId="availability" type="monotone" dataKey="avg_availability" stroke="#F59E0B" strokeWidth={3} dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty label="Performance trend belum tersedia." />
            )}
          </DashboardChartPanel>

          <ExecutiveInsightPanel
            availability={availability}
            latestImpactDaily={latestImpactDaily}
            transport={transport}
            ticketingSummary={ticketingSummary}
            worstSites={worstAvailabilitySites}
          />
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2">
            <Activity className="size-4 text-[var(--primary-light)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Module Overview</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
            <ModulePanel
              title="Reporting"
              icon={BarChart3}
              action={<Link to="/reporting" className="text-xs font-semibold text-[var(--primary-light)] hover:text-sky-300">View Detail</Link>}
            >
              <div className="space-y-2">
                <MetricLine label="Revenue" value={formatRevenue(reporting.total_revenue)} tone="text-emerald-300" />
                <MetricLine label="Payload" value={formatPayload(reporting.total_payload)} tone="text-sky-300" />
                <MetricLine label="Availability" value={formatPercent(reporting.avg_availability)} tone="text-amber-300" />
                <MetricLine label="Total Sites" value={formatNumber(reporting.total_sites)} />
              </div>
              <ReportingMiniChart rows={trendRows} />
            </ModulePanel>

            <ModulePanel
              title="Impact Service"
              icon={BellRing}
              action={<Link to="/impact-service" className="text-xs font-semibold text-[var(--primary-light)] hover:text-sky-300">View Detail</Link>}
            >
              <div className="space-y-2">
                <MetricLine label="OPEN Alarm" value={formatNumber(impact.open_alarms)} tone="text-red-300" />
                <MetricLine label="CLEAR Alarm" value={formatNumber(impact.clear_alarms)} tone="text-emerald-300" />
                <MetricLine label="Impacted Site" value={formatNumber(impact.impacted_sites)} tone="text-amber-300" />
                <MetricLine label="SOW TSEL" value={formatNumber(impact.sow_tsel)} />
                <MetricLine label="Last data" value={formatShortDateLabel(latestImpactDaily?.tanggal || overview?.period?.impact_end_date)} />
              </div>
              <ImpactServiceDailyChart rows={impactDailyTrend} />
            </ModulePanel>

            <ModulePanel
              title="Transport Quality"
              icon={Radio}
              action={<Link to="/transport-quality" className="text-xs font-semibold text-[var(--primary-light)] hover:text-sky-300">View Detail</Link>}
            >
              <div className="space-y-2">
                <MetricLine label="P1 Sites" value={formatNumber(transport.p1_sites)} tone="text-red-300" />
                <MetricLine label="P2 Sites" value={formatNumber(transport.p2_sites)} tone="text-amber-300" />
                <MetricLine label="PL > 1%" value={formatNumber(transport.pl_over_1_sites)} />
                <MetricLine label="Latency > 5ms" value={formatNumber(transport.latency_over_5_sites)} />
              </div>
              <TransportQualityMiniChart rows={overview?.transport_trend || []} />
            </ModulePanel>

            <ModulePanel
              title="Ticket Fault Center"
              icon={TicketCheck}
              action={<Link to="/ticketing" className="text-xs font-semibold text-[var(--primary-light)] hover:text-sky-300">View Detail</Link>}
            >
              <div className="space-y-2">
                <MetricLine label="Total Tickets" value={formatNumber(ticketingSummary.total_tickets)} tone="text-sky-300" />
                <MetricLine label="OUT SLA Rate" value={formatPercent(ticketingSummary.out_sla_rate)} tone="text-red-300" />
                <MetricLine label="Closed Rate" value={formatPercent(ticketingSummary.closed_rate)} tone="text-emerald-300" />
                <MetricLine label="Backup Rate" value={formatPercent(ticketingSummary.backup_sukses_rate)} />
              </div>
              <TicketFaultCenterMiniChart rows={ticketingTrend} />
            </ModulePanel>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
          <section className="glass-card overflow-hidden">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-[var(--primary-light)]" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Worst Sites</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 divide-y divide-[var(--border)] md:grid-cols-2 md:divide-x md:divide-y-0">
              <div>
                <div className="border-b border-[var(--border)] px-4 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Top 10 Worst Availability</p>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {worstAvailabilitySites.slice(0, 10).map((site) => (
                    <Link key={site.site_id} to="/site-map" className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]/45">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs font-bold text-[var(--text-primary)]">{site.site_id}</p>
                        <p className="truncate text-[11px] text-[var(--text-muted)]">{site.site_name || site.kabupaten || '-'}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`font-mono text-xs font-semibold ${TONES[getAvailabilityTone(site.avg_availability)].text}`}>
                          {formatPercent(site.avg_availability)}
                        </p>
                        <p className="mt-1 whitespace-nowrap text-[10px] text-[var(--text-muted)]">
                          {formatOutageHours(site.total_outage_menit)} | {formatNumber(site.jumlah_cell)} cells
                        </p>
                      </div>
                    </Link>
                  ))}
                  {!worstAvailabilitySites.length && (
                    <p className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">Worst availability belum tersedia.</p>
                  )}
                </div>
              </div>
              <div>
                <div className="border-b border-[var(--border)] px-4 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Top 10 Worst Revenue</p>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {worstRevenueSites.slice(0, 10).map((site) => (
                    <Link key={site.site_id} to="/reporting" className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]/45">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs font-bold text-[var(--text-primary)]">{site.site_id}</p>
                        <p className="truncate text-[11px] text-[var(--text-muted)]">{site.site_name || site.kabupaten || `Payload ${formatPayload(site.total_payload)}`}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-xs font-semibold text-amber-300">
                          {formatRevenue(site.total_revenue)}
                        </p>
                        <p className={`mt-1 whitespace-nowrap font-mono text-[10px] font-semibold ${getMomTone(site.mom_percentage)}`}>
                          MoM {formatSignedPercent(site.mom_percentage)}
                        </p>
                      </div>
                    </Link>
                  ))}
                  {!worstRevenueSites.length && (
                    <p className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">Worst revenue belum tersedia.</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="glass-card overflow-hidden">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-[var(--primary-light)]" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Priority Signals</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 p-3">
              {prioritySignals.map((signal) => {
                const colors = TONES[signal.tone] || TONES.info;
                return (
                  <Link key={`${signal.title}-${signal.detail}`} to={signal.to} className={`rounded-lg border p-2.5 transition-colors hover:bg-[var(--bg-hover)]/45 ${colors.border} ${colors.bg}`}>
                    <div className="mb-1.5 flex items-center gap-2">
                      {signal.tone === 'success' ? <CircleCheck className={`size-3.5 ${colors.text}`} /> : <AlertTriangle className={`size-3.5 ${colors.text}`} />}
                      <span className="truncate text-[9px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">{signal.detail}</span>
                    </div>
                    <p className={`truncate font-mono text-xs font-bold ${colors.text}`}>{signal.title}</p>
                  </Link>
                );
              })}
              {!prioritySignals.length && (
                <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                  Tidak ada priority signal aktif.
                </div>
              )}
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
