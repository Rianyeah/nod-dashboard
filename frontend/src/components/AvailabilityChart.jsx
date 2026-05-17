import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { fetchTrend } from '../services/api';
import { BarChart2 } from 'lucide-react';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

function getBarColor(val) {
  if (val == null) return '#374151';
  if (val >= 99.5) return '#10B981';
  if (val >= 95) return '#F59E0B';
  return '#EF4444';
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  const tooltipLabel = payload[0]?.payload?.tooltipLabel || label;
  return (
    <div className="min-w-[82px] rounded-md border border-white/[0.12] bg-[#0F172A]/95 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 whitespace-nowrap text-[10px] text-[var(--text-muted)]">{tooltipLabel}</p>
      <p className="whitespace-nowrap font-mono text-sm font-bold leading-none" style={{ color: getBarColor(val) }}>
        {val != null ? `${val}%` : 'N/A'}
      </p>
    </div>
  );
};

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
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="w-4 h-4 text-[var(--text-muted)]" />
          <h3 className="text-xs font-semibold text-[var(--text-secondary)]">Trend Availability</h3>
        </div>
        <p className="text-[11px] text-[var(--text-muted)] text-center py-6">Klik site pada peta untuk melihat trend</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-1">
        <BarChart2 className="w-4 h-4 text-[var(--primary-light)]" />
        <h3 className="text-xs font-semibold text-[var(--text-primary)]">Trend Availability</h3>
      </div>
      <p className="text-[10px] text-[var(--text-muted)] mb-3 font-mono">{siteId}</p>
      {loading ? (
        <div className="skeleton h-36 rounded-lg" />
      ) : chartData.length === 0 ? (
        <p className="text-[11px] text-[var(--text-muted)] text-center py-6">Tidak ada data trend</p>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={chartData} margin={{ top: 5, right: 12, left: -22, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9, fill: '#64748B' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#64748B' }}
              domain={[(dataMin) => Math.min(90, Math.max(0, Math.floor(dataMin) - 2)), 100]}
              unit="%"
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ outline: 'none', zIndex: 20 }}
              offset={12}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            />
            <ReferenceLine y={99.5} stroke="rgba(16, 185, 129, 0.3)" strokeDasharray="3 3" />
            <ReferenceLine y={95} stroke="rgba(245, 158, 11, 0.3)" strokeDasharray="3 3" />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={24}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={getBarColor(entry.raw)} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
