import { ChartLegend, ChartLegendContent } from '@/components/ui/chart';

export function DashboardChartLegend({ className, ...props }) {
  return (
    <ChartLegend
      content={(
        <ChartLegendContent
          className={`text-[10px] text-[var(--text-muted)] ${className || ''}`}
          {...props}
        />
      )}
    />
  );
}
