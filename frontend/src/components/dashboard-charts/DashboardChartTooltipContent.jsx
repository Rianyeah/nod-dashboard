import { ChartTooltipContent } from '@/components/ui/chart';
import { formatNumber } from '@/utils/formatters';

import { resolveSeriesColor } from './dashboardChartUtils';

export function DashboardChartTooltipContent({
  config,
  valueFormatter = formatNumber,
  seriesLabelFormatter,
  formatter,
  ...props
}) {
  return (
    <ChartTooltipContent
      {...props}
      formatter={(value, name, item, index, payload) => {
        if (formatter) {
          return formatter(value, name, item, index, payload);
        }

        const color = resolveSeriesColor(item, config);
        const dataKey = String(item?.dataKey ?? name);
        const label = seriesLabelFormatter
          ? seriesLabelFormatter(dataKey, item)
          : config?.[dataKey]?.label ?? name;

        return (
          <div className="flex w-full min-w-32 items-center gap-3" style={{ color }}>
            <span data-series-name className="min-w-0 flex-1 truncate font-medium">
              {label}
            </span>
            <span data-series-value className="font-mono font-semibold tabular-nums">
              {valueFormatter(value, dataKey, item)}
            </span>
          </div>
        );
      }}
    />
  );
}
