import {
  BarChart3,
  FileText,
  Layers3,
  MapPin,
  SlidersHorizontal,
  Trophy,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
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
import { DashboardChartPanel } from '@/components/ui/DashboardPrimitives';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { formatNumber } from '@/utils/formatters';

import {
  ACTIVITY_CHART_COLORS,
  activityEnomChartConfig,
} from './activityEnomChartConfig';

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return '0%';
  return `${Number(value).toFixed(1).replace('.', ',')}%`;
}

function ActivityChartTooltip({ formatMonthLabel }) {
  return (
    <ChartTooltip
      cursor={{ fill: 'var(--chart-cursor)' }}
      content={(
        <DashboardChartTooltipContent
          config={activityEnomChartConfig}
          labelFormatter={(value) => (
            String(value).includes('-') ? formatMonthLabel(value, true) : value
          )}
        />
      )}
    />
  );
}

function RankingPanel({ rows }) {
  if (!rows?.length) return <DashboardChartEmpty className="h-[260px] xl:h-[608px]" />;

  return (
    <div className="h-[260px] overflow-y-auto pr-1 xl:h-[608px]">
      <div className="flex flex-col gap-2">
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
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${rate}%` }} />
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

export function ActivityEnomCharts({
  trend,
  breakdowns,
  selectedNop,
  rankingTitle,
  contributionTitle,
  formatMonthLabel,
  topActivities = [],
}) {
  const contribution = (breakdowns.contribution || []).slice(0, 10);

  return (
    <section
      data-testid="activity-dashboard-chart-grid"
      className="grid grid-cols-1 gap-4 xl:grid-cols-3"
    >
      <div data-testid="activity-monthly-trend-panel" className="min-w-0 xl:col-span-2">
        <DashboardChartPanel title="Monthly Activity Trend" icon={TrendingUp} className="h-full">
          {trend.length ? (
            <ChartContainer config={activityEnomChartConfig} className="h-[260px] w-full aspect-auto" data-testid="activity-monthly-trend-chart">
              <ComposedChart accessibilityLayer data={trend} margin={DASHBOARD_CHART_MARGIN}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis dataKey="create_date" tickFormatter={formatMonthLabel} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={44} />
                <ActivityChartTooltip formatMonthLabel={formatMonthLabel} />
                <DashboardChartLegend />
                <Bar dataKey="open" stackId="status" fill="var(--color-open)" radius={DASHBOARD_BAR_RADIUS} isAnimationActive={false}>
                  <LabelList dataKey="open" content={<InsideBarValueLabel />} />
                </Bar>
                <Bar dataKey="close" stackId="status" fill="var(--color-close)" radius={DASHBOARD_BAR_RADIUS} isAnimationActive={false}>
                  <LabelList dataKey="close" content={<InsideBarValueLabel color="#052E24" />} />
                  <LabelList dataKey="total" content={<TopBarValueLabel />} />
                </Bar>
                <Line type="monotone" dataKey="total" stroke="var(--color-total)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              </ComposedChart>
            </ChartContainer>
          ) : <DashboardChartEmpty className="h-[260px]" />}
        </DashboardChartPanel>
      </div>

      <div data-testid="activity-ranking-panel" className="min-w-0 xl:row-span-2">
        <DashboardChartPanel title={rankingTitle} icon={Trophy} className="h-full">
          <RankingPanel rows={breakdowns.ranking || []} />
        </DashboardChartPanel>
      </div>

      <div data-testid="activity-contribution-panel" className="min-w-0">
        <DashboardChartPanel title={contributionTitle} icon={selectedNop ? MapPin : BarChart3} className="h-full">
          {contribution.length ? (
            <ChartContainer config={activityEnomChartConfig} className="h-[260px] w-full aspect-auto" data-testid="activity-contribution-chart">
              <BarChart accessibilityLayer data={contribution} layout="vertical" margin={{ top: 6, right: 28, left: 76, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" width={112} interval={0} tickLine={false} axisLine={false} />
                <ActivityChartTooltip formatMonthLabel={formatMonthLabel} />
                <DashboardChartLegend />
                <Bar dataKey="open" stackId="status" fill="var(--color-open)" radius={DASHBOARD_BAR_RADIUS} isAnimationActive={false}>
                  <LabelList dataKey="open" content={<InsideBarValueLabel />} />
                </Bar>
                <Bar dataKey="close" stackId="status" fill="var(--color-close)" radius={DASHBOARD_BAR_RADIUS} isAnimationActive={false}>
                  <LabelList dataKey="close" content={<InsideBarValueLabel color="#052E24" />} />
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : <DashboardChartEmpty className="h-[260px]" />}
        </DashboardChartPanel>
      </div>

      <div data-testid="activity-category-panel" className="min-w-0">
        <DashboardChartPanel title="Kategori Distribution" icon={Layers3} className="h-full">
          {(breakdowns.by_category || []).length ? (
            <ChartContainer config={activityEnomChartConfig} className="h-[260px] w-full aspect-auto" data-testid="activity-category-chart">
              <BarChart accessibilityLayer data={breakdowns.by_category} layout="vertical" margin={{ top: 6, right: 52, left: 50, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" width={82} interval={0} tickLine={false} axisLine={false} />
                <ActivityChartTooltip formatMonthLabel={formatMonthLabel} />
                <Bar dataKey="total" fill={ACTIVITY_CHART_COLORS.category} radius={DASHBOARD_BAR_RADIUS} isAnimationActive={false}>
                  <LabelList dataKey="total" content={<EndBarValueLabel />} />
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : <DashboardChartEmpty className="h-[260px]" />}
        </DashboardChartPanel>
      </div>

      <div data-testid="activity-top-activity-panel" className="min-w-0 xl:col-span-2">
        <DashboardChartPanel title="Top Activity" icon={FileText} className="h-full">
          {topActivities.length ? (
            <div data-testid="activity-top-activity-table" className="h-[260px] overflow-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-card)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
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
          ) : <DashboardChartEmpty className="h-[260px]" />}
        </DashboardChartPanel>
      </div>

      <div data-testid="activity-week-done-panel" className="min-w-0">
        <DashboardChartPanel title="Week Done Progress" icon={SlidersHorizontal} className="h-full">
          {(breakdowns.by_week_done || []).length ? (
            <ChartContainer config={activityEnomChartConfig} className="h-[260px] w-full aspect-auto" data-testid="activity-week-done-chart">
              <BarChart accessibilityLayer data={breakdowns.by_week_done} margin={DASHBOARD_CHART_MARGIN}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={44} />
                <ActivityChartTooltip formatMonthLabel={formatMonthLabel} />
                <Bar dataKey="close" fill="var(--color-close)" radius={DASHBOARD_BAR_RADIUS} isAnimationActive={false}>
                  <LabelList dataKey="close" content={<TopBarValueLabel />} />
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : <DashboardChartEmpty className="h-[260px]" />}
        </DashboardChartPanel>
      </div>
    </section>
  );
}
