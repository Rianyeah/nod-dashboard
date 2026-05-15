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
  return (
    <div className="glass-card px-3 py-2 text-xs">
      <p className="text-[var(--text-muted)] mb-1">{label}</p>
      <p className="font-mono font-bold" style={{ color: getBarColor(val) }}>
        {val != null ? `${val}%` : 'N/A'}
      </p>
    </div>
  );
};

export default function AvailabilityChart({ siteId, tahun }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!siteId || !tahun) { setData([]); return; }
    setLoading(true);
    fetchTrend(siteId, tahun)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [siteId, tahun]);

  const chartData = useMemo(() =>
    data.map(d => ({
      name: `${MONTH_NAMES[(d.bulan || 1) - 1]}`,
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
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9, fill: '#64748B' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#64748B' }}
              domain={[90, 100]}
              unit="%"
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
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
