import { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';

import { DashboardChartPanel, DashboardChartTooltip } from '../../components/ui/DashboardPrimitives.jsx';
import { formatPayload, formatRevenue } from '../../utils/formatters.js';
import { reportingChartConfig } from './reportingChartConfig.js';
import { enrichRevenueBandTrend } from './reportingTrendState.js';


const REVENUE_BAND_COLORS = {
  u30: '#b75c72',
  u60: '#b9853f',
};


function paddedDomain(rows, key) {
  const values = rows.map((row) => Number(row?.[key])).filter(Number.isFinite);
  if (!values.length) return [0, 'auto'];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.18, Math.abs(max) * 0.04, 1);
  return [Math.max(0, Math.floor(min - padding)), Math.ceil(max + padding)];
}


function monthLabel(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`));
}


function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <DashboardChartTooltip
      active={active}
      label={monthLabel(label)}
      payload={payload.map((item) => ({
        ...item,
        name: reportingChartConfig[item.dataKey]?.label || item.name,
        value: item.dataKey === 'total_revenue'
          ? formatRevenue(item.value)
          : item.dataKey === 'total_payload'
            ? formatPayload(item.value)
            : item.value == null ? '-' : `${Number(item.value).toFixed(2)}%`,
      }))}
    />
  );
}


function RevenueBandTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  const delta = row.at_risk_delta;
  return (
    <DashboardChartTooltip
      active={active}
      label={monthLabel(label)}
      payload={[
        { dataKey: 'u30_sites', name: 'U30', value: row.u30_sites ?? '-', color: REVENUE_BAND_COLORS.u30 },
        { dataKey: 'u60_sites', name: 'U60', value: row.u60_sites ?? '-', color: REVENUE_BAND_COLORS.u60 },
        { dataKey: 'at_risk_sites', name: 'At risk', value: row.at_risk_sites ?? '-', color: 'var(--text-primary)' },
        {
          dataKey: 'at_risk_delta',
          name: 'MoM site',
          value: delta == null ? '-' : `${delta > 0 ? '+' : ''}${delta}`,
          color: delta > 0 ? 'var(--danger)' : delta < 0 ? 'var(--success)' : 'var(--text-muted)',
        },
      ]}
    />
  );
}


function TrendLegend() {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-[10px] text-[var(--text-muted)]" aria-label="Legenda Performance Trend">
      {Object.entries(reportingChartConfig).map(([key, item]) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <span className="w-3 border-t-2" style={{ borderColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}


function PerformanceChart({ rows, selectedPeriod, themeTokens, height = 250 }) {
  const revenueDomain = useMemo(() => paddedDomain(rows, 'total_revenue'), [rows]);
  const payloadDomain = useMemo(() => paddedDomain(rows, 'total_payload'), [rows]);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 4, right: 58, left: 6, bottom: 0 }}>
        <defs>
          <linearGradient id="reportingRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={reportingChartConfig.total_revenue.color} stopOpacity={0.14} />
            <stop offset="95%" stopColor={reportingChartConfig.total_revenue.color} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="reportingPayload" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={reportingChartConfig.total_payload.color} stopOpacity={0.12} />
            <stop offset="95%" stopColor={reportingChartConfig.total_payload.color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={themeTokens.chartGrid} vertical={false} />
        {selectedPeriod ? <ReferenceArea x1={selectedPeriod.start} x2={selectedPeriod.end} fill="var(--primary)" fillOpacity={0.08} /> : null}
        <XAxis dataKey="trx_month" tickFormatter={monthLabel} tick={{ fontSize: 10, fill: themeTokens.axisTick }} tickLine={false} />
        <YAxis yAxisId="revenue" domain={revenueDomain} tickFormatter={(value) => `${Math.round(value / 1e9)}M`} tick={{ fontSize: 10, fill: themeTokens.axisTick }} width={42} tickLine={false} axisLine={false} />
        <YAxis yAxisId="payload" orientation="right" domain={payloadDomain} tickFormatter={(value) => formatPayload(value).replace(/\s/g, '')} tick={{ fontSize: 10, fill: themeTokens.axisTick }} width={42} tickLine={false} axisLine={false} />
        <YAxis yAxisId="availability" orientation="right" domain={['dataMin - 0.2', 100]} hide />
        <Tooltip content={<TrendTooltip />} />
        <Area type="monotone" yAxisId="revenue" dataKey="total_revenue" stroke={reportingChartConfig.total_revenue.color} strokeWidth={2} strokeLinecap="round" fill="url(#reportingRevenue)" isAnimationActive={false} />
        <Area type="monotone" yAxisId="payload" dataKey="total_payload" stroke={reportingChartConfig.total_payload.color} strokeWidth={2} strokeLinecap="round" fill="url(#reportingPayload)" isAnimationActive={false} />
        <Line type="monotone" yAxisId="availability" dataKey="avg_availability" stroke={reportingChartConfig.avg_availability.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" dot={{ r: 2 }} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}


function RevenueBandLegend() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
      {[
        ['U30', REVENUE_BAND_COLORS.u30],
        ['U60', REVENUE_BAND_COLORS.u60],
      ].map(([label, color]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ backgroundColor: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}


function RevenueBandChart({ rows, themeTokens, height = 218 }) {
  const available = rows.some((row) => row.u30_sites != null && row.u60_sites != null);
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold text-[var(--text-secondary)]">U30 & U60 Trend</p>
        <RevenueBandLegend />
      </div>
      {available ? (
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={themeTokens.chartGrid} vertical={false} />
            <XAxis dataKey="trx_month" tickFormatter={monthLabel} tick={{ fontSize: 9, fill: themeTokens.axisTick }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: themeTokens.axisTick }} tickLine={false} axisLine={false} width={28} />
            <Tooltip content={<RevenueBandTooltip />} />
            <Bar dataKey="u30_sites" name="U30" stackId="risk" fill={REVENUE_BAND_COLORS.u30} isAnimationActive={false} />
            <Bar dataKey="u60_sites" name="U60" stackId="risk" fill={REVENUE_BAND_COLORS.u60} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-[var(--border)] px-4 text-center text-xs text-[var(--text-muted)]" style={{ height }}>
          Threshold revenue belum tersedia untuk periode trend.
        </div>
      )}
    </div>
  );
}


export default function ReportingPerformanceTrend({ rows = [], selectedPeriod, themeTokens }) {
  const [mobileView, setMobileView] = useState('performance');
  const trendRows = useMemo(() => enrichRevenueBandTrend(rows), [rows]);
  if (!rows.length) return null;

  return (
    <DashboardChartPanel title="Performance Trend" icon={TrendingUp} action={<TrendLegend />}>
      <div className="reporting-trend-desktop hidden gap-4 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(260px,3fr)]">
        <PerformanceChart rows={rows} selectedPeriod={selectedPeriod} themeTokens={themeTokens} />
        <RevenueBandChart rows={trendRows} themeTokens={themeTokens} />
      </div>

      <div className="reporting-trend-mobile lg:hidden">
        <div className="mb-3 inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-0.5" role="tablist" aria-label="Pilihan chart trend">
          {[
            ['performance', 'Performance'],
            ['risk', 'U30 & U60'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mobileView === value}
              onClick={() => setMobileView(value)}
              className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${mobileView === value ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {mobileView === 'performance' ? (
          <PerformanceChart rows={rows} selectedPeriod={selectedPeriod} themeTokens={themeTokens} />
        ) : (
          <RevenueBandChart rows={trendRows} themeTokens={themeTokens} />
        )}
      </div>
    </DashboardChartPanel>
  );
}
