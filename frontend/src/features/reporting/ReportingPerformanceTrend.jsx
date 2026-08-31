import { useMemo } from 'react';
import {
  Area,
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


export default function ReportingPerformanceTrend({ rows = [], selectedPeriod, themeTokens }) {
  const revenueDomain = useMemo(() => paddedDomain(rows, 'total_revenue'), [rows]);
  const payloadDomain = useMemo(() => paddedDomain(rows, 'total_payload'), [rows]);
  if (!rows.length) return null;

  return (
    <DashboardChartPanel title="Performance Trend" icon={TrendingUp}>
      <ResponsiveContainer width="100%" height={230}>
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
          <ReferenceArea x1={selectedPeriod.start} x2={selectedPeriod.end} fill="var(--primary)" fillOpacity={0.08} />
          <XAxis dataKey="trx_month" tickFormatter={monthLabel} tick={{ fontSize: 10, fill: themeTokens.axisTick }} tickLine={false} />
          <YAxis yAxisId="revenue" domain={revenueDomain} tickFormatter={(value) => `${Math.round(value / 1e9)}M`} tick={{ fontSize: 10, fill: themeTokens.axisTick }} width={42} tickLine={false} axisLine={false} />
          <YAxis yAxisId="payload" orientation="right" domain={payloadDomain} tickFormatter={(value) => formatPayload(value).replace(/\s/g, '')} tick={{ fontSize: 10, fill: themeTokens.axisTick }} width={42} tickLine={false} axisLine={false} />
          <YAxis yAxisId="availability" orientation="right" domain={['dataMin - 0.2', 100]} hide />
          <Tooltip content={<TrendTooltip />} />
          <Area yAxisId="revenue" dataKey="total_revenue" stroke={reportingChartConfig.total_revenue.color} strokeWidth={2} fill="url(#reportingRevenue)" isAnimationActive={false} />
          <Area yAxisId="payload" dataKey="total_payload" stroke={reportingChartConfig.total_payload.color} strokeWidth={2} fill="url(#reportingPayload)" isAnimationActive={false} />
          <Line yAxisId="availability" dataKey="avg_availability" stroke={reportingChartConfig.avg_availability.color} strokeWidth={3} dot={{ r: 2 }} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </DashboardChartPanel>
  );
}
