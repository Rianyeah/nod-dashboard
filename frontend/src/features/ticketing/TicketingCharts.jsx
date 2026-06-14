import { useState } from 'react';
import {
  BarChart3,
  HelpCircle,
  ListChecks,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Label,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  Sector,
  XAxis,
  YAxis,
} from 'recharts';

import { DashboardChartEmpty } from '@/components/dashboard-charts/DashboardChartEmpty';
import {
  EndBarValueLabel,
  TopBarValueLabel,
} from '@/components/dashboard-charts/DashboardChartLabels';
import { DashboardChartLegend } from '@/components/dashboard-charts/DashboardChartLegend';
import { DashboardChartTooltipContent } from '@/components/dashboard-charts/DashboardChartTooltipContent';
import {
  DASHBOARD_BAR_RADIUS,
  sumChartValues,
} from '@/components/dashboard-charts/dashboardChartUtils';
import { DashboardChartPanel } from '@/components/ui/DashboardPrimitives';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { formatNumber } from '@/utils/formatters';

import {
  getSlaStatusColor,
  ticketingChartConfig,
} from './ticketingChartConfig';

export function HelpHint({ text }) {
  return (
    <span
      tabIndex={0}
      role="img"
      aria-label={text}
      title={text}
      className="inline-flex size-5 items-center justify-center rounded-full border border-[var(--border-light)] text-[var(--text-muted)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/35"
    >
      <HelpCircle className="size-3.5" />
    </span>
  );
}

function renderActivePieShape(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={(outerRadius || 0) + 7}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  );
}

function DonutCenterLabel({ viewBox, total }) {
  if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null;
  return (
    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
      <tspan x={viewBox.cx} y={viewBox.cy - 4} className="fill-foreground font-mono text-xl font-bold">
        {formatNumber(total)}
      </tspan>
      <tspan x={viewBox.cx} y={viewBox.cy + 15} className="fill-muted-foreground text-[9px] font-semibold uppercase">
        Total
      </tspan>
    </text>
  );
}

function ChartCard({ title, icon, children, action }) {
  return (
    <DashboardChartPanel title={title} icon={icon} action={action}>
      {children}
    </DashboardChartPanel>
  );
}

function StandardTooltip({ valueFormatter = formatNumber, ...props }) {
  return (
    <ChartTooltip
      cursor={{ fill: 'var(--chart-cursor)' }}
      content={(
        <DashboardChartTooltipContent
          config={ticketingChartConfig}
          valueFormatter={valueFormatter}
          {...props}
        />
      )}
    />
  );
}

export function TicketingCharts({ dashboard }) {
  const [activeSlaIndex, setActiveSlaIndex] = useState(null);
  const slaDistribution = dashboard?.sla_distribution || [];
  const slaTotal = sumChartValues(slaDistribution, 'tickets');

  return (
    <>
      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)_minmax(280px,0.65fr)]">
        <ChartCard title="Daily Trend Ticket by Kategori" icon={TrendingUp}>
          {dashboard?.trend?.length ? (
            <ChartContainer config={ticketingChartConfig} className="h-[220px] w-full aspect-auto" data-testid="ticketing-daily-trend-chart">
              <LineChart accessibilityLayer data={dashboard.trend} margin={{ top: 12, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={38} />
                <StandardTooltip />
                <DashboardChartLegend />
                <Line type="monotone" dataKey="bps" stroke="var(--color-bps)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="ts" stroke="var(--color-ts)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            </ChartContainer>
          ) : <DashboardChartEmpty />}
        </ChartCard>

        <ChartCard title="SLA Status Distribution" icon={ShieldCheck}>
          {slaDistribution.length ? (
            <div className="grid min-h-[220px] grid-cols-1 items-center gap-2 sm:grid-cols-[150px_minmax(0,1fr)]">
              <ChartContainer
                config={ticketingChartConfig}
                className="mx-auto h-[220px] w-full max-w-[180px] overflow-visible aspect-auto"
                data-testid="ticketing-sla-donut-chart"
              >
                <PieChart accessibilityLayer>
                  <ChartTooltip
                    content={(
                      <DashboardChartTooltipContent
                        config={ticketingChartConfig}
                        hideLabel
                        seriesLabelFormatter={(_, item) => item?.payload?.label ?? item?.name}
                      />
                    )}
                  />
                  <Pie
                    data={slaDistribution}
                    dataKey="tickets"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={2}
                    cornerRadius={8}
                    strokeWidth={0}
                    activeIndex={activeSlaIndex}
                    activeShape={renderActivePieShape}
                    onMouseEnter={(_, index) => setActiveSlaIndex(index)}
                    onMouseLeave={() => setActiveSlaIndex(null)}
                    isAnimationActive={false}
                  >
                    {slaDistribution.map((entry, index) => (
                      <Cell
                        key={entry.label}
                        fill={getSlaStatusColor(entry.label)}
                        tabIndex={0}
                        onFocus={() => setActiveSlaIndex(index)}
                        onBlur={() => setActiveSlaIndex(null)}
                      />
                    ))}
                    <Label content={<DonutCenterLabel total={slaTotal} />} />
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div aria-label="SLA status values" className="grid gap-2">
                {slaDistribution.map((entry) => (
                  <div key={entry.label} className="flex min-w-0 items-center gap-2 text-xs">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: getSlaStatusColor(entry.label) }} />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground" title={entry.label}>{entry.label}</span>
                    <span className="font-mono text-sm font-bold tabular-nums text-foreground">{formatNumber(entry.tickets)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <DashboardChartEmpty />}
        </ChartCard>

        <ChartCard title="Visiting Site vs Backup Genset" icon={BarChart3}>
          {dashboard?.visiting_backup_distribution?.length ? (
            <ChartContainer config={ticketingChartConfig} className="h-[220px] w-full aspect-auto" data-testid="ticketing-visiting-backup-chart">
              <BarChart accessibilityLayer data={dashboard.visiting_backup_distribution.slice(0, 6)} layout="vertical" margin={{ top: 6, right: 58, left: 12, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" width={92} interval={0} tickLine={false} axisLine={false} />
                <StandardTooltip />
                <DashboardChartLegend />
                <Bar dataKey="visiting_site" fill="var(--color-visiting_site)" radius={DASHBOARD_BAR_RADIUS} isAnimationActive={false}>
                  <LabelList dataKey="visiting_site" content={<EndBarValueLabel />} />
                </Bar>
                <Bar dataKey="backup_genset" fill="var(--color-backup_genset)" radius={DASHBOARD_BAR_RADIUS} isAnimationActive={false}>
                  <LabelList dataKey="backup_genset" content={<EndBarValueLabel />} />
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : <DashboardChartEmpty />}
        </ChartCard>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <ChartCard title={dashboard?.location_breakdown_title || 'Kabupaten/Kota Distribution'} icon={BarChart3}>
          {dashboard?.location_breakdown?.length ? (
            <ChartContainer config={ticketingChartConfig} className="h-[220px] w-full aspect-auto" data-testid="ticketing-location-chart">
              <BarChart accessibilityLayer data={dashboard.location_breakdown} layout="vertical" margin={{ top: 6, right: 58, left: 12, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" width={100} interval={0} tickLine={false} axisLine={false} />
                <StandardTooltip />
                <Bar dataKey="tickets" fill="var(--color-tickets)" radius={DASHBOARD_BAR_RADIUS} isAnimationActive={false}>
                  <LabelList dataKey="tickets" content={<EndBarValueLabel />} />
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : <DashboardChartEmpty />}
        </ChartCard>

        <ChartCard
          title="RC Category Pareto"
          icon={ListChecks}
          action={<HelpHint text="Pareto menampilkan kontribusi kumulatif ticket per RC Category." />}
        >
          {dashboard?.rc_category_pareto?.length ? (
            <ChartContainer config={ticketingChartConfig} className="h-[220px] w-full aspect-auto" data-testid="ticketing-pareto-chart">
              <ComposedChart accessibilityLayer data={dashboard.rc_category_pareto} margin={{ top: 18, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={12} />
                <YAxis yAxisId="tickets" tickLine={false} axisLine={false} width={38} />
                <YAxis yAxisId="percentage" orientation="right" domain={[0, 100]} tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} width={42} />
                <StandardTooltip
                  valueFormatter={(value, name) => (
                    name === 'cumulative_rate'
                      ? `${Number(value).toFixed(1).replace('.', ',')}%`
                      : formatNumber(value)
                  )}
                />
                <DashboardChartLegend />
                <Bar yAxisId="tickets" dataKey="tickets" fill="var(--color-tickets)" radius={DASHBOARD_BAR_RADIUS} isAnimationActive={false}>
                  <LabelList dataKey="tickets" content={<TopBarValueLabel />} />
                </Bar>
                <Line yAxisId="percentage" type="monotone" dataKey="cumulative_rate" stroke="var(--color-cumulative_rate)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
              </ComposedChart>
            </ChartContainer>
          ) : <DashboardChartEmpty />}
        </ChartCard>
      </section>
    </>
  );
}
