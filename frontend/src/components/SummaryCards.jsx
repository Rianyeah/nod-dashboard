import { useEffect, useState } from 'react';
import { Radio, Activity, TrendingUp, TrendingDown, Zap, Signal } from 'lucide-react';
import { fetchSummary } from '../services/api';
import { DashboardKpiCard } from './ui/DashboardPrimitives';

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
      tone: 'neutral',
    },
    {
      title: 'Avg Availability',
      value: avail != null ? `${Number(avail).toFixed(2)}%` : '-',
      subtitle: '',
      icon: isExcellent ? TrendingUp : isDegraded ? Activity : TrendingDown,
      tone: isExcellent ? 'success' : isDegraded ? 'warning' : 'danger',
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
      tone: 'danger',
    },
    {
      title: 'Total Cell',
      value: data?.total_cell?.toLocaleString() ?? '-',
      subtitle: 'cell dengan data',
      icon: Signal,
      tone: 'neutral',
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      {cards.map((card, i) => (
        <DashboardKpiCard
          key={card.title}
          title={card.title}
          value={card.value}
          subtitle={card.subtitle}
          icon={card.icon}
          tone={card.tone}
          className="animate-fade-in cursor-default"
          style={{ animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}
