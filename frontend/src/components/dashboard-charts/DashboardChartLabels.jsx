import { formatNumber } from '@/utils/formatters';

import { shouldRenderChartValue } from './dashboardChartUtils';

export function InsideBarValueLabel({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  value,
  color = '#FFFFFF',
}) {
  if (!shouldRenderChartValue(value) || Number(width) < 28 || Number(height) < 18) return null;

  return (
    <text
      x={Number(x) + Number(width) / 2}
      y={Number(y) + Number(height) / 2}
      fill={color}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={800}
      className="pointer-events-none font-mono"
    >
      {formatNumber(value)}
    </text>
  );
}

export function TopBarValueLabel({ x = 0, y = 0, width = 0, value }) {
  if (!shouldRenderChartValue(value)) return null;

  return (
    <text
      x={Number(x) + Number(width) / 2}
      y={Number(y) - 7}
      fill="var(--foreground)"
      textAnchor="middle"
      fontSize={12}
      fontWeight={700}
      className="pointer-events-none font-mono"
    >
      {formatNumber(value)}
    </text>
  );
}

export function EndBarValueLabel({ x = 0, y = 0, width = 0, height = 0, value }) {
  if (!shouldRenderChartValue(value)) return null;

  return (
    <text
      x={Number(x) + Number(width) + 8}
      y={Number(y) + Number(height) / 2}
      fill="var(--foreground)"
      textAnchor="start"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={700}
      className="pointer-events-none font-mono"
    >
      {formatNumber(value)}
    </text>
  );
}
