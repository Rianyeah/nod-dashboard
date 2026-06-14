import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { cn } from '@/lib/utils';

export function DashboardChartEmpty({
  label = 'Data belum tersedia untuk filter ini.',
  className = 'h-[220px]',
}) {
  return (
    <Empty className={cn('border border-dashed border-border bg-muted/20 p-6', className)}>
      <EmptyHeader>
        <EmptyDescription className="text-xs">{label}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
