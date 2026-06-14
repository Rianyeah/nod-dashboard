import {
  ActivityIcon,
  ClockIcon,
  ListChecksIcon,
  ShieldWarningIcon,
  UsersIcon,
} from '@phosphor-icons/react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Label,
  LabelList,
  Line,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { formatNumber } from '@/utils/formatters';
import { ChartEmptyState } from './ImpactServiceStates';
import {
  getAgingColor,
  getCategoryColor,
  impactServiceChartConfig,
} from './impactServiceChartConfig';
import { formatDateLabel } from './impactServiceDateRange';

const chartMargin = { top: 20, right: 28, left: 0, bottom: 0 };

function ChartCard({ title, description, icon: Icon, children, className = '' }) {
  return (
    <Card size="sm" className={`impact-service-chart-card animate-fade-in border border-border bg-card/95 shadow-sm [--card-spacing:--spacing(3)] ${className}`}>
      <CardHeader className="border-b border-border pb-3">
        <div className="flex items-start gap-2">
          <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon weight="duotone" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            <CardDescription className="mt-0.5 text-[11px]">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-3">{children}</CardContent>
    </Card>
  );
}

function StandardTooltip() {
  return (
    <ChartTooltip
      cursor={{ fill: 'var(--chart-cursor)' }}
      content={(
        <ChartTooltipContent
          formatter={(value, name) => (
            <>
              <span className="text-muted-foreground">{impactServiceChartConfig[name]?.label || name}</span>
              <span className="ml-auto font-mono font-semibold tabular-nums">{formatNumber(value)}</span>
            </>
          )}
        />
      )}
    />
  );
}

function SegmentValueLabel({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  value,
  textColor = '#FFFFFF',
}) {
  const numericValue = Number(value);
  if (!numericValue) return null;

  return (
    <text
      x={Number(x) + Number(width) / 2}
      y={Number(y) + Number(height) / 2}
      fill={textColor}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={13}
      fontWeight={800}
      className="pointer-events-none font-mono"
    >
      {formatNumber(numericValue)}
    </text>
  );
}

function BarValueLabel({ x = 0, y = 0, width = 0, value }) {
  const numericValue = Number(value);
  if (!numericValue) return null;

  return (
    <text
      x={Number(x) + Number(width) / 2}
      y={Number(y) - 8}
      fill="var(--foreground)"
      textAnchor="middle"
      fontSize={13}
      fontWeight={800}
      className="pointer-events-none font-mono"
    >
      {formatNumber(numericValue)}
    </text>
  );
}

function DonutCenterLabel({ viewBox, total }) {
  if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null;

  return (
    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
      <tspan
        x={viewBox.cx}
        y={viewBox.cy - 6}
        fill="var(--foreground)"
        fontSize={22}
        fontWeight={800}
        className="font-mono"
      >
        {formatNumber(total)}
      </tspan>
      <tspan
        x={viewBox.cx}
        y={viewBox.cy + 17}
        fill="var(--muted-foreground)"
        fontSize={10}
        fontWeight={700}
      >
        TOTAL
      </tspan>
    </text>
  );
}

export default function ImpactServiceCharts({
  dailyTrend,
  distributions,
  topSites,
  selectedNop,
}) {
  const nopOrSiteData = selectedNop
    ? topSites.map((site, index) => ({
      label: site.site_id || site.site_name || `Site ${index + 1}`,
      total: site.total,
      open: site.open,
      clear: site.clear,
    }))
    : distributions.by_nop;

  const categoryData = distributions.by_category.slice(0, 8);
  const categoryTotal = categoryData.reduce((total, row) => total + (Number(row.total) || 0), 0);

  return (
    <>
      <section className="impact-service-primary-charts grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <ChartCard
          title="Last 7 Days Trend"
          description="Tujuh hari yang berakhir pada tanggal akhir terpilih."
          icon={ActivityIcon}
        >
          {dailyTrend.length ? (
            <ChartContainer config={impactServiceChartConfig} className="h-[220px] w-full aspect-auto">
              <ComposedChart accessibilityLayer data={dailyTrend} margin={chartMargin}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="tanggal"
                  tickFormatter={formatDateLabel}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis tickLine={false} axisLine={false} width={42} />
                <StandardTooltip />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="open" stackId="status" fill="var(--color-open)" radius={[8, 8, 8, 8]} isAnimationActive={false}>
                  <LabelList dataKey="open" content={<SegmentValueLabel />} fontSize={13} />
                </Bar>
                <Bar dataKey="clear" stackId="status" fill="var(--color-clear)" radius={[8, 8, 8, 8]} isAnimationActive={false}>
                  <LabelList dataKey="clear" content={<SegmentValueLabel textColor="#052E24" />} fontSize={13} />
                </Bar>
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="var(--color-total)"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ChartContainer>
          ) : <ChartEmptyState />}
        </ChartCard>

        <ChartCard
          title={selectedNop ? 'Top Impacted Sites' : 'NOP Contribution'}
          description={selectedNop ? `Kontributor site pada ${selectedNop}.` : 'Kontribusi alarm per wilayah NOP.'}
          icon={UsersIcon}
        >
          {nopOrSiteData.length ? (
            <ChartContainer config={impactServiceChartConfig} className="h-[220px] w-full aspect-auto">
              <BarChart
                accessibilityLayer
                data={nopOrSiteData.slice(0, 10)}
                layout="vertical"
                margin={{ top: 4, right: 22, left: 8, bottom: 0 }}
              >
                <CartesianGrid horizontal={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={112}
                  interval={0}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12, fontWeight: 700 }}
                />
                <StandardTooltip />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="open" stackId="status" fill="var(--color-open)" radius={[8, 8, 8, 8]} isAnimationActive={false}>
                  <LabelList dataKey="open" content={<SegmentValueLabel />} fontSize={13} />
                </Bar>
                <Bar dataKey="clear" stackId="status" fill="var(--color-clear)" radius={[8, 8, 8, 8]} isAnimationActive={false}>
                  <LabelList dataKey="clear" content={<SegmentValueLabel textColor="#052E24" />} fontSize={13} />
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : <ChartEmptyState />}
        </ChartCard>
      </section>

      <section className="impact-service-secondary-charts grid grid-cols-1 gap-3 xl:grid-cols-3">
        <ChartCard
          title="Status by Severity"
          description="Perbandingan OPEN dan CLEAR pada tiap severity."
          icon={ShieldWarningIcon}
        >
          {distributions.by_severity.length ? (
            <ChartContainer config={impactServiceChartConfig} className="h-[220px] w-full aspect-auto">
              <BarChart accessibilityLayer data={distributions.by_severity} margin={chartMargin}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={38} />
                <StandardTooltip />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="open" fill="var(--color-open)" radius={[8, 8, 8, 8]} isAnimationActive={false}>
                  <LabelList dataKey="open" content={<SegmentValueLabel />} fontSize={13} />
                </Bar>
                <Bar dataKey="clear" fill="var(--color-clear)" radius={[8, 8, 8, 8]} isAnimationActive={false}>
                  <LabelList dataKey="clear" content={<SegmentValueLabel textColor="#052E24" />} fontSize={13} />
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : <ChartEmptyState />}
        </ChartCard>

        <ChartCard
          title="Category Distribution"
          description="Delapan kategori alarm dengan volume tertinggi."
          icon={ListChecksIcon}
        >
          {categoryData.length ? (
            <div className="grid min-h-[226px] grid-cols-1 items-center gap-4 sm:grid-cols-[214px_minmax(0,1fr)]">
              <ChartContainer
                config={impactServiceChartConfig}
                className="mx-auto h-[214px] w-full max-w-[214px] overflow-visible aspect-auto sm:mx-0"
              >
                <PieChart accessibilityLayer>
                  <ChartTooltip
                    content={(
                      <ChartTooltipContent
                        hideLabel
                        formatter={(value, name, item) => (
                          <>
                            <span className="max-w-40 truncate text-muted-foreground">
                              {item?.payload?.label || name}
                            </span>
                            <span className="ml-auto font-mono font-semibold tabular-nums">
                              {formatNumber(value)}
                            </span>
                          </>
                        )}
                      />
                    )}
                  />
                  <Pie
                    data={categoryData}
                    dataKey="total"
                    nameKey="label"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    cornerRadius={8}
                    strokeWidth={0}
                    isAnimationActive={false}
                  >
                    {categoryData.map((row, index) => (
                      <Cell key={row.label} fill={getCategoryColor(index)} />
                    ))}
                    <Label content={<DonutCenterLabel total={categoryTotal} />} />
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div aria-label="Category values" className="grid gap-1.5 sm:pl-6">
                {categoryData.map((row, index) => (
                  <div key={row.label} className="flex min-w-0 items-center gap-2 text-xs">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: getCategoryColor(index) }}
                    />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground" title={row.label}>
                      {row.label}
                    </span>
                    <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                      {formatNumber(row.total)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : <ChartEmptyState />}
        </ChartCard>

        <ChartCard
          title="Aging Range"
          description="Risiko meningkat dari rentang aging rendah ke tinggi."
          icon={ClockIcon}
        >
          {distributions.by_aging_range.length ? (
            <ChartContainer config={impactServiceChartConfig} className="h-[220px] w-full aspect-auto">
              <BarChart accessibilityLayer data={distributions.by_aging_range} margin={chartMargin}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={38} />
                <StandardTooltip />
                <Bar dataKey="total" radius={[8, 8, 8, 8]} isAnimationActive={false}>
                  {distributions.by_aging_range.map((row, index) => (
                    <Cell key={row.label} fill={getAgingColor(index)} />
                  ))}
                  <LabelList dataKey="total" content={<BarValueLabel />} fontSize={13} />
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : <ChartEmptyState />}
        </ChartCard>
      </section>
    </>
  );
}
