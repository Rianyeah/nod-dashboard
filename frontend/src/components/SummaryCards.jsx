import { useEffect, useState } from 'react';
import { Radio, Activity, AlertTriangle, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { fetchSummary } from '../services/api';

export default function SummaryCards({ bulan, tahun }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bulan || !tahun) return;
    setLoading(true);
    fetchSummary(bulan, tahun)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [bulan, tahun]);

  if (loading) {
    return (
      <div className="space-y-2.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-[76px]" />
        ))}
      </div>
    );
  }

  const avail = data?.avg_availability;
  const isExcellent = avail >= 99.5;
  const isDegraded = avail >= 95 && avail < 99.5;

  const cards = [
    {
      title: 'Total Sites',
      value: data?.total_site_master?.toLocaleString() ?? '—',
      subtitle: `${data?.total_site_dengan_data ?? 0} dengan data`,
      icon: Radio,
      accent: 'var(--primary)',
      glow: 'rgba(59, 130, 246, 0.15)',
    },
    {
      title: 'Avg Availability',
      value: avail != null ? `${Number(avail).toFixed(2)}%` : '—',
      subtitle: `${data?.site_excellent ?? 0} exc · ${data?.site_degraded ?? 0} deg · ${data?.site_critical ?? 0} crit`,
      icon: isExcellent ? TrendingUp : isDegraded ? Activity : TrendingDown,
      accent: isExcellent ? 'var(--success)' : isDegraded ? 'var(--warning)' : 'var(--danger)',
      glow: isExcellent ? 'rgba(16, 185, 129, 0.15)' : isDegraded ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
    },
    {
      title: 'Total Outage',
      value: data?.total_outage_menit != null
        ? `${(data.total_outage_menit / 60).toFixed(0)}h`
        : '—',
      subtitle: data?.total_outage_menit
        ? `${Math.round(data.total_outage_menit).toLocaleString()} menit`
        : '',
      icon: Zap,
      accent: 'var(--danger)',
      glow: 'rgba(239, 68, 68, 0.12)',
    },
  ];

  return (
    <div className="space-y-2.5">
      {cards.map((card, i) => (
        <div
          key={card.title}
          className="glass-card p-3.5 animate-fade-in cursor-default group"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-105"
              style={{ backgroundColor: card.glow, boxShadow: `0 0 12px ${card.glow}` }}
            >
              <card.icon className="w-4.5 h-4.5" style={{ color: card.accent }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-widest">
                {card.title}
              </p>
              <p className="text-lg font-bold font-mono tracking-tight" style={{ color: card.accent }}>
                {card.value}
              </p>
              {card.subtitle && (
                <p className="text-[10px] text-[var(--text-muted)] truncate">
                  {card.subtitle}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
