import { CircleAlert } from 'lucide-react';

import { cn } from '@/lib/utils';

export function DashboardChartError({
  label = 'Chart gagal dimuat.',
  className = 'h-[220px]',
}) {
  return (
    <div
      data-chart-state="error"
      className={cn(
        'flex items-center justify-center rounded-lg border border-[var(--danger)]/25 bg-[var(--badge-critical-bg)] p-6 text-center',
        className,
      )}
      role="status"
    >
      <div className="space-y-2 text-xs text-[var(--danger)]">
        <CircleAlert className="mx-auto size-5" />
        <p>{label}</p>
      </div>
    </div>
  );
}
