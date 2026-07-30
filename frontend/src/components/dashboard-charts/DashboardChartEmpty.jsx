import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { cn } from '@/lib/utils';

export function DashboardChartEmpty({
  label = 'Data belum tersedia untuk filter ini.',
  className = 'h-[220px]',
}) {
  return (
    <Empty
      data-chart-state="empty"
      className={cn(
        'border border-dashed border-[var(--border)] bg-[var(--surface-soft)] p-6',
        className,
      )}
    >
      <EmptyHeader>
        <EmptyDescription className="text-xs">{label}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
