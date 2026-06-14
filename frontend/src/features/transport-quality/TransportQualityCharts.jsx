import {
  Activity,
  BarChart3,
  ShieldAlert,
  Waves,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';

import { DashboardChartEmpty } from '@/components/dashboard-charts/DashboardChartEmpty';
import {
  EndBarValueLabel,
  InsideBarValueLabel,
  TopBarValueLabel,
} from '@/components/dashboard-charts/DashboardChartLabels';
import { DashboardChartLegend } from '@/components/dashboard-charts/DashboardChartLegend';
import { DashboardChartTooltipContent } from '@/components/dashboard-charts/DashboardChartTooltipContent';
import {
  DASHBOARD_BAR_RADIUS,
  DASHBOARD_CHART_MARGIN,
} from '@/components/dashboard-charts/dashboardChartUtils';
import {
  DashboardChartPanel,
  DashboardStatusBadge,
} from '@/components/ui/DashboardPrimitives';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';

import {
  TRANSPORT_CHART_COLORS,
  transportQualityChartConfig,
} from './transportQualityChartConfig';

function asDisplay(value) {
  if (value == null || value === '') return '-';
  return String(value);
}

function formatMetric(value, digits = 2, suffix = '') {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return `${Number(value).toFixed(digits).replace('.', ',')}${suffix}`;
}

function PriorityBadge({ value }) {
  const priority = String(value || 'Normal').toUpperCase();
  const tone = priority === 'P1' ? 'danger' : priority === 'P2' ? 'warning' : 'success';
  return <DashboardStatusBadge tone={tone}>{priority}</DashboardStatusBadge>;
}

function ChartCard({ title, icon, children, action }) {
  return (
    <DashboardChartPanel title={title} icon={icon} action={action}>
      {children}
    </DashboardChartPanel>
  );
}

function TransportTooltip({ labelFormatter, seriesLabelFormatter }) {
  return (
    <ChartTooltip
      cursor={{ fill: 'var(--chart-cursor)' }}
      content={(
        <DashboardChartTooltipContent
          config={transportQualityChartConfig}
          labelFormatter={labelFormatter}
          seriesLabelFormatter={seriesLabelFormatter}
        />
      )}
    />
  );
}

export function TransportQualityCharts({
  trend,
  distributions,
  breakdowns,
  latestPriority,
  formatDateLabel,
}) {
  const nopBreakdown = (breakdowns.by_nop || []).slice(0, 8);
  const kabupatenBreakdown = (breakdowns.by_kabupaten || []).slice(0, 8);

  return (
    <>
      <section className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,0.7fr)]">
        <ChartCard title="Weekly Quality Trend" icon={Activity}>
          {trend.length ? (
            <ChartContainer
              config={transportQualityChartConfig}
              className="h-[300px] w-full aspect-auto"
              data-testid="transport-weekly-trend-chart"
            >
              <LineChart accessibilityLayer data={trend} margin={DASHBOARD_CHART_MARGIN}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatDateLabel} tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={42} />
                <TransportTooltip labelFormatter={formatDateLabel} />
                <DashboardChartLegend />
                <Line type="monotone" dataKey="pl_over_1_sites" stroke="var(--color-pl_over_1_sites)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="latency_over_5_sites" stroke="var(--color-latency_over_5_sites)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="jitter_not_clear_sites" stroke="var(--color-jitter_not_clear_sites)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="thi_fail_sites" stroke="var(--color-thi_fail_sites)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            </ChartContainer>
          ) : <DashboardChartEmpty className="h-[300px]" />}
        </ChartCard>

        <ChartCard
          title="High Priority Transport"
          icon={ShieldAlert}
          action={<span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-300">P1 / P2 queue</span>}
        >
          {latestPriority.length ? (
            <div className="flex flex-col gap-2">
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
          ) : <DashboardChartEmpty label="Tidak ada site prioritas untuk filter ini." />}
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="PL & Latency Distribution" icon={Waves}>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {distributions.by_packet_loss.length ? (
              <ChartContainer
                config={transportQualityChartConfig}
                className="h-[260px] w-full aspect-auto"
                data-testid="transport-packet-loss-chart"
              >
                <BarChart accessibilityLayer data={distributions.by_packet_loss} margin={DASHBOARD_CHART_MARGIN}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={42} />
                  <TransportTooltip seriesLabelFormatter={() => 'PL records'} />
                  <Bar dataKey="records" fill={TRANSPORT_CHART_COLORS.total} radius={DASHBOARD_BAR_RADIUS} isAnimationActive={false}>
                    <LabelList dataKey="records" content={<TopBarValueLabel />} />
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : <DashboardChartEmpty className="h-[260px]" />}

            {distributions.by_latency.length ? (
              <ChartContainer
                config={transportQualityChartConfig}
                className="h-[260px] w-full aspect-auto"
                data-testid="transport-latency-chart"
              >
                <BarChart accessibilityLayer data={distributions.by_latency} margin={DASHBOARD_CHART_MARGIN}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={42} />
                  <TransportTooltip seriesLabelFormatter={() => 'Latency records'} />
                  <Bar dataKey="records" fill={TRANSPORT_CHART_COLORS.latency} radius={DASHBOARD_BAR_RADIUS} isAnimationActive={false}>
                    <LabelList dataKey="records" content={<TopBarValueLabel />} />
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : <DashboardChartEmpty className="h-[260px]" />}
          </div>
        </ChartCard>

        <ChartCard title="Issue Breakdown" icon={BarChart3}>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {nopBreakdown.length ? (
              <ChartContainer
                config={transportQualityChartConfig}
                className="h-[260px] w-full aspect-auto"
                data-testid="transport-nop-breakdown-chart"
              >
                <BarChart accessibilityLayer data={nopBreakdown} layout="vertical" margin={{ top: 6, right: 28, left: 58, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" width={88} interval={0} tickLine={false} axisLine={false} />
                  <TransportTooltip />
                  <DashboardChartLegend />
                  <Bar dataKey="p1_sites" stackId="issues" fill="var(--color-p1_sites)" radius={DASHBOARD_BAR_RADIUS} isAnimationActive={false}>
                    <LabelList dataKey="p1_sites" content={<InsideBarValueLabel />} />
                  </Bar>
                  <Bar dataKey="p2_sites" stackId="issues" fill="var(--color-p2_sites)" radius={DASHBOARD_BAR_RADIUS} isAnimationActive={false}>
                    <LabelList dataKey="p2_sites" content={<InsideBarValueLabel color="#3B2100" />} />
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : <DashboardChartEmpty className="h-[260px]" />}

            {kabupatenBreakdown.length ? (
              <ChartContainer
                config={transportQualityChartConfig}
                className="h-[260px] w-full aspect-auto"
                data-testid="transport-kabupaten-breakdown-chart"
              >
                <BarChart accessibilityLayer data={kabupatenBreakdown} layout="vertical" margin={{ top: 6, right: 58, left: 82, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" width={112} interval={0} tickLine={false} axisLine={false} />
                  <TransportTooltip />
                  <DashboardChartLegend />
                  <Bar dataKey="pl_over_1_sites" fill="var(--color-pl_over_1_sites)" radius={DASHBOARD_BAR_RADIUS} isAnimationActive={false}>
                    <LabelList dataKey="pl_over_1_sites" content={<EndBarValueLabel />} />
                  </Bar>
                  <Bar dataKey="latency_over_5_sites" fill="var(--color-latency_over_5_sites)" radius={DASHBOARD_BAR_RADIUS} isAnimationActive={false}>
                    <LabelList dataKey="latency_over_5_sites" content={<EndBarValueLabel />} />
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : <DashboardChartEmpty className="h-[260px]" />}
          </div>
        </ChartCard>
      </section>
    </>
  );
}
