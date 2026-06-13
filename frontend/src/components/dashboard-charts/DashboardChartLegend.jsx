import { ChartLegend, ChartLegendContent } from '@/components/ui/chart';

export function DashboardChartLegend({ className, ...props }) {
  return (
    <ChartLegend
      content={<ChartLegendContent className={className} {...props} />}
    />
  );
}
