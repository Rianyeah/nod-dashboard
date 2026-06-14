import {
  BroadcastIcon,
  CheckCircleIcon,
  ShieldWarningIcon,
  SirenIcon,
  WarningIcon,
} from '@phosphor-icons/react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/utils/formatters';

function getImpactDelta(current, previous) {
  const currentValue = Number(current) || 0;
  const previousValue = Number(previous) || 0;
  const delta = currentValue - previousValue;
  const rate = previousValue === 0 ? null : (delta / Math.abs(previousValue)) * 100;
  return { delta, rate };
}

function formatImpactDelta({ delta, rate }) {
  const deltaSign = delta > 0 ? '+' : delta < 0 ? '-' : '';
  const deltaLabel = `${deltaSign}${formatNumber(Math.abs(delta))}`;
  const rateLabel = rate == null
    ? '-'
    : `${rate > 0 ? '+' : rate < 0 ? '-' : ''}${Math.abs(rate).toFixed(1).replace('.', ',')}%`;
  return `${deltaLabel} (${rateLabel})`;
}

function KpiCard({ title, value, previous, comparisonLabel, icon: Icon, tone }) {
  const delta = getImpactDelta(value, previous);
  const deltaTone = delta.delta > 0
    ? 'text-emerald-400'
    : delta.delta < 0
      ? 'text-red-400'
      : 'text-[var(--text-muted)]';

  return (
    <Card size="sm" className="impact-service-kpi-card animate-fade-in border border-border bg-card/95 shadow-sm [--card-spacing:--spacing(3)]">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted" style={{ color: tone }}>
            <Icon className="size-4" weight="duotone" />
          </div>
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="font-mono text-[38px] font-bold leading-none tabular-nums tracking-tight" style={{ color: tone }}>
          {formatNumber(value)}
        </p>
        <div className="mt-1.5 space-y-0.5 text-[10px] font-semibold leading-snug">
          <p className={`font-mono tabular-nums ${deltaTone}`}>{formatImpactDelta(delta)}</p>
          <p className="text-muted-foreground">{comparisonLabel}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ImpactServiceKpiGrid({ summary, loading, isSingleDayRange }) {
  if (loading && !summary) {
    return (
      <section className="impact-service-kpi-grid grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-[108px]" />)}
      </section>
    );
  }

  const comparisonLabel = isSingleDayRange ? 'vs hari sebelumnya' : 'vs periode sebelumnya';
  const scorecards = [
    {
      title: 'Alarm Impact Service',
      value: summary?.total_alarms,
      previous: summary?.previous_total_alarms,
      icon: SirenIcon,
      tone: 'var(--chart-1)',
    },
    {
      title: 'Impacted Site',
      value: summary?.impacted_sites,
      previous: summary?.previous_impacted_sites,
      icon: BroadcastIcon,
      tone: 'var(--chart-5)',
    },
    {
      title: 'OPEN Alarm',
      value: summary?.open_alarms,
      previous: summary?.previous_open_alarms,
      icon: WarningIcon,
      tone: 'var(--chart-2)',
    },
    {
      title: 'CLEAR Alarm',
      value: summary?.clear_alarms,
      previous: summary?.previous_clear_alarms,
      icon: CheckCircleIcon,
      tone: 'var(--chart-3)',
    },
    {
      title: 'SOW TSEL',
      value: summary?.sow_tsel,
      previous: summary?.previous_sow_tsel,
      icon: ShieldWarningIcon,
      tone: 'var(--chart-4)',
    },
  ];

  return (
    <section className="impact-service-kpi-grid grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      {scorecards.map((card) => (
        <KpiCard key={card.title} {...card} comparisonLabel={comparisonLabel} />
      ))}
    </section>
  );
}
