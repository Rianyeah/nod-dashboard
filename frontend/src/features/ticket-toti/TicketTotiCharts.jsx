import { BarChart3, MapPinned, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from 'recharts';

import { DashboardChartEmpty } from '@/components/dashboard-charts/DashboardChartEmpty';
import { DashboardChartLegend } from '@/components/dashboard-charts/DashboardChartLegend';
import { DashboardChartTooltipContent } from '@/components/dashboard-charts/DashboardChartTooltipContent';
import { DASHBOARD_CHART_COLORS } from '@/components/dashboard-charts/dashboardChartUtils';
import { DashboardChartPanel } from '@/components/ui/DashboardPrimitives';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/utils/formatters';

const trendConfig = {
  total: { label: 'Total Ticket TOTI', color: DASHBOARD_CHART_COLORS.info },
  vandalism: { label: 'Vandalisme', color: DASHBOARD_CHART_COLORS.danger },
};

const clusterConfig = {
  tickets: { label: 'Ticket', color: DASHBOARD_CHART_COLORS.neutral },
};

const mitraConfig = {
  tickets: { label: 'Ticket', color: DASHBOARD_CHART_COLORS.warning },
};

function Tooltip({ config }) {
  return (
    <ChartTooltip
      cursor={{ fill: 'var(--chart-cursor)' }}
      content={<DashboardChartTooltipContent config={config} valueFormatter={formatNumber} />}
    />
  );
}

function DistributionChart({ data, config, color }) {
  if (!data?.length) return <DashboardChartEmpty className="h-[250px]" />;
  return (
    <ChartContainer config={config} className="h-[250px] w-full aspect-auto">
      <BarChart
        accessibilityLayer
        layout="vertical"
        data={data}
        margin={{ top: 4, right: 26, bottom: 4, left: 12 }}
      >
        <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tick={{ fill: 'var(--chart-axis)', fontSize: 10 }}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={104}
          tickLine={false}
          axisLine={false}
          tick={{ fill: 'var(--chart-axis)', fontSize: 10 }}
          tickFormatter={(value) => String(value).length > 16 ? `${String(value).slice(0, 15)}…` : value}
        />
        <Tooltip config={config} />
        <Bar dataKey="tickets" fill={color} radius={[0, 4, 4, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}

export default function TicketTotiCharts({ dashboard, loading = false }) {
  if (loading) {
    return (
      <section className="grid gap-4 xl:grid-cols-2" aria-label="Memuat chart Ticket TOTI">
        <Skeleton className="h-[312px] xl:col-span-2" />
        <Skeleton className="h-[312px]" />
        <Skeleton className="h-[312px]" />
      </section>
    );
  }

  return (
    <section className="grid min-w-0 gap-4 xl:grid-cols-2">
      <DashboardChartPanel
        title="Trend Ticket TOTI & Vandalisme"
        description={dashboard?.trend_granularity === 'month' ? 'Agregasi per bulan' : 'Agregasi per hari'}
        icon={TrendingUp}
        className="xl:col-span-2"
      >
        {dashboard?.trend?.length ? (
          <ChartContainer config={trendConfig} className="h-[260px] w-full aspect-auto" data-testid="ticket-toti-trend-chart">
            <ComposedChart accessibilityLayer data={dashboard.trend} margin={{ top: 12, right: 18, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 5" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--chart-axis)', fontSize: 10 }} />
              <YAxis tickLine={false} axisLine={false} width={42} tick={{ fill: 'var(--chart-axis)', fontSize: 10 }} />
              <Tooltip config={trendConfig} />
              <DashboardChartLegend />
              <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} maxBarSize={34} isAnimationActive={false} />
              <Line
                type="monotone"
                dataKey="vandalism"
                stroke="var(--color-vandalism)"
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: 'var(--color-vandalism)' }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ChartContainer>
        ) : (
          <DashboardChartEmpty className="h-[260px]" label="Belum ada tren Ticket TOTI pada periode ini." />
        )}
      </DashboardChartPanel>

      <DashboardChartPanel title="Distribusi Cluster" icon={MapPinned}>
        <DistributionChart
          data={dashboard?.cluster_distribution}
          config={clusterConfig}
          color="var(--color-tickets)"
        />
      </DashboardChartPanel>

      <DashboardChartPanel title="Distribusi Tower Provider" icon={BarChart3}>
        <DistributionChart
          data={dashboard?.mitra_distribution}
          config={mitraConfig}
          color="var(--color-tickets)"
        />
      </DashboardChartPanel>
    </section>
  );
}
