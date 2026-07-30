import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, ReferenceLine } from 'recharts';
import { fetchTrend } from '../services/api';
import { BarChart2 } from 'lucide-react';
import { DashboardChartEmpty } from './dashboard-charts/DashboardChartEmpty';
import { DashboardChartTooltipContent } from './dashboard-charts/DashboardChartTooltipContent';
import { DashboardChartPanel } from './ui/DashboardPrimitives';
import { ChartContainer, ChartTooltip } from './ui/chart';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const availabilityChartConfig = {
  value: {
    label: 'Availability',
    color: 'var(--chart-accent)',
  },
};

function getBarColor(val) {
  if (val == null) return 'var(--chart-neutral-2)';
  if (val >= 99.5) return 'var(--chart-success)';
  if (val >= 95) return 'var(--chart-warning)';
  return 'var(--chart-danger)';
}

export default function AvailabilityChart({ siteId, bulan, tahun }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!siteId || !bulan || !tahun) return;
    let cancelled = false;

    Promise.resolve()
      .then(() => {
        if (!cancelled) setLoading(true);
        return fetchTrend(siteId, tahun, bulan);
      })
      .then((trendData) => {
        if (!cancelled) setData(trendData);
      })
      .catch(() => {
        if (!cancelled) setData([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [siteId, bulan, tahun]);

  const chartData = useMemo(() =>
    [...data]
      .sort((a, b) => (Number(a.tahun) - Number(b.tahun)) || (Number(a.bulan) - Number(b.bulan)))
      .map(d => ({
        name: `${MONTH_NAMES[(d.bulan || 1) - 1]}`,
        tooltipLabel: `${MONTH_NAMES[(d.bulan || 1) - 1]} ${d.tahun}`,
        month: Number(d.bulan),
        year: Number(d.tahun),
        value: d.avg_availability != null ? +Number(d.avg_availability).toFixed(2) : 0,
        raw: d.avg_availability,
      })),
  [data]);

  if (!siteId) {
    return (
      <DashboardChartPanel title="Trend Availability" icon={BarChart2} className="p-4">
        <DashboardChartEmpty
          label="Klik site pada peta untuk melihat trend."
          className="h-36"
        />
      </DashboardChartPanel>
    );
  }

  return (
    <DashboardChartPanel
      title="Trend Availability"
      icon={BarChart2}
      action={<span className="font-mono text-[10px] text-[var(--text-muted)]">{siteId}</span>}
      className="animate-fade-in p-4"
    >
      {loading ? (
        <div className="skeleton h-36 rounded-lg" />
      ) : chartData.length === 0 ? (
        <DashboardChartEmpty label="Tidak ada data trend." className="h-36" />
      ) : (
        <ChartContainer config={availabilityChartConfig} className="h-[150px] w-full aspect-auto">
          <BarChart data={chartData} margin={{ top: 5, right: 12, left: -22, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 5" stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9, fill: 'var(--chart-axis)' }}
              axisLine={{ stroke: 'var(--chart-grid-strong)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'var(--chart-axis)' }}
              domain={[(dataMin) => Math.min(90, Math.max(0, Math.floor(dataMin) - 2)), 100]}
              unit="%"
              axisLine={false}
              tickLine={false}
            />
            <ChartTooltip
              cursor={{ fill: 'var(--chart-cursor)' }}
              content={(
                <DashboardChartTooltipContent
                  config={availabilityChartConfig}
                  labelFormatter={(_label, payload) => payload?.[0]?.payload?.tooltipLabel}
                  valueFormatter={(value) => (value != null ? `${value}%` : 'N/A')}
                />
              )}
            />
            <ReferenceLine y={99.5} stroke="var(--chart-success)" strokeOpacity={0.3} strokeDasharray="3 5" />
            <ReferenceLine y={95} stroke="var(--chart-warning)" strokeOpacity={0.3} strokeDasharray="3 5" />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={24}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={getBarColor(entry.raw)} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </DashboardChartPanel>
  );
}
