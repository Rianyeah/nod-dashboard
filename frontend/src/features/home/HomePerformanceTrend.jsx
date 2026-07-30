import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  XAxis,
  YAxis,
} from 'recharts';

import { DashboardChartEmpty } from '@/components/dashboard-charts/DashboardChartEmpty';
import { DashboardChartError } from '@/components/dashboard-charts/DashboardChartError';
import { DashboardChartTooltipContent } from '@/components/dashboard-charts/DashboardChartTooltipContent';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { formatPayload, formatPercent, formatRevenue } from '@/utils/formatters';

import { homeChartConfig } from './homeChartConfig';
import { resolveHomePerformanceTrendState } from './homePerformanceTrendState';

function formatMonth(value) {
  if (!value) return '';
  const [year, month] = String(value).split('-');
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${labels[Number(month) - 1] || month} ${year}`;
}

export function HomePerformanceTrend({
  rows,
  moduleError,
  selectedPeriod,
  revenueDomain,
  payloadDomain,
  availabilityDomain,
}) {
  const state = resolveHomePerformanceTrendState({ rows, moduleError });

  if (state.status === 'error') {
    return (
      <DashboardChartError
        label="Performance Trend gagal dimuat dari modul Reporting."
        className="h-[260px]"
      />
    );
  }
  if (state.status === 'empty') {
    return (
      <DashboardChartEmpty
        label="Performance trend belum tersedia untuk filter ini."
        className="h-[260px]"
      />
    );
  }

  return (
    <ChartContainer
      config={homeChartConfig}
      className="h-[260px] min-w-0 w-full aspect-auto"
      data-testid="home-performance-trend"
    >
      <ComposedChart
        accessibilityLayer
        data={state.rows}
        margin={{ top: 8, right: 48, left: 4, bottom: 0 }}
      >
        <defs>
          <linearGradient id="homeRevenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={homeChartConfig.total_revenue.color} stopOpacity={0.14} />
            <stop offset="95%" stopColor={homeChartConfig.total_revenue.color} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="homePayloadGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={homeChartConfig.total_payload.color} stopOpacity={0.10} />
            <stop offset="95%" stopColor={homeChartConfig.total_payload.color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 5" />
        <ReferenceArea
          x1={selectedPeriod?.start}
          x2={selectedPeriod?.end}
          fill="var(--chart-accent)"
          fillOpacity={0.045}
          strokeOpacity={0}
        />
        <XAxis
          dataKey="trx_month"
          axisLine={false}
          tickLine={false}
          tickFormatter={formatMonth}
          tick={{ fill: 'var(--chart-axis)', fontSize: 10 }}
        />
        <YAxis yAxisId="revenue" hide domain={revenueDomain} />
        <YAxis yAxisId="payload" hide domain={payloadDomain} />
        <YAxis
          yAxisId="availability"
          orientation="right"
          domain={availabilityDomain}
          tickCount={5}
          axisLine={false}
          tickLine={false}
          tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
          tick={{ fill: 'var(--chart-axis)', fontSize: 10 }}
          width={48}
        />
        <ChartTooltip
          content={(
            <DashboardChartTooltipContent
              config={homeChartConfig}
              labelFormatter={formatMonth}
              valueFormatter={(value, key) => {
                if (key === 'total_revenue') return formatRevenue(value);
                if (key === 'total_payload') return formatPayload(value);
                return formatPercent(value);
              }}
            />
          )}
        />
        <Area
          yAxisId="revenue"
          type="monotone"
          dataKey="total_revenue"
          stroke={homeChartConfig.total_revenue.color}
          strokeWidth={2}
          fill="url(#homeRevenueGradient)"
          isAnimationActive={false}
        />
        <Area
          yAxisId="payload"
          type="monotone"
          dataKey="total_payload"
          stroke={homeChartConfig.total_payload.color}
          strokeWidth={2}
          fill="url(#homePayloadGradient)"
          isAnimationActive={false}
        />
        <Line
          yAxisId="availability"
          type="monotone"
          dataKey="avg_availability"
          stroke={homeChartConfig.avg_availability.color}
          strokeWidth={2.5}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
