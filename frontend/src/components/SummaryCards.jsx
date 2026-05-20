import { useEffect, useState } from 'react';
import { Radio, Activity, TrendingUp, TrendingDown, Zap, Signal } from 'lucide-react';
import { fetchSummary } from '../services/api';

export default function SummaryCards({ bulan, tahun, filters = {} }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bulan || !tahun) {
      return;
    }

    let cancelled = false;

    Promise.resolve()
      .then(() => {
        if (!cancelled) setLoading(true);
        return fetchSummary(bulan, tahun, filters);
      })
      .then((summary) => {
        if (!cancelled) setData(summary);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bulan, tahun, filters]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-[64px]" />
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
      value: data?.total_site_dengan_data?.toLocaleString() ?? '-',
      subtitle: 'site dengan data bulan ini',
      icon: Radio,
      accent: 'var(--primary)',
      glow: 'rgba(59, 130, 246, 0.15)',
    },
    {
      title: 'Avg Availability',
      value: avail != null ? `${Number(avail).toFixed(2)}%` : '-',
      subtitle: '',
      icon: isExcellent ? TrendingUp : isDegraded ? Activity : TrendingDown,
      accent: isExcellent ? 'var(--success)' : isDegraded ? 'var(--warning)' : 'var(--danger)',
      glow: isExcellent ? 'rgba(16, 185, 129, 0.15)' : isDegraded ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
    },
    {
      title: 'Total Outage',
      value: data?.total_outage_menit != null
        ? `${(data.total_outage_menit / 60).toFixed(0)}h`
        : '-',
      subtitle: data?.total_outage_menit
        ? `${Math.round(data.total_outage_menit).toLocaleString()} menit`
        : '',
      icon: Zap,
      accent: 'var(--danger)',
      glow: 'rgba(239, 68, 68, 0.12)',
    },
    {
      title: 'Total Cell',
      value: data?.total_cell?.toLocaleString() ?? '-',
      subtitle: 'cell dengan data',
      icon: Signal,
      accent: 'var(--primary-light)',
      glow: 'rgba(96, 165, 250, 0.14)',
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      {cards.map((card, i) => (
        <div
          key={card.title}
          className="glass-card p-3 animate-fade-in cursor-default group"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="size-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-105"
              style={{ backgroundColor: card.glow, boxShadow: `0 0 12px ${card.glow}` }}
            >
              <card.icon className="size-4" style={{ color: card.accent }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-widest">
                {card.title}
              </p>
              <p className="text-base font-bold font-mono tracking-tight" style={{ color: card.accent }}>
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
