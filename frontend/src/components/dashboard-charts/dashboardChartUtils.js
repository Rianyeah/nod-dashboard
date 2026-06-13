export const DASHBOARD_CHART_MARGIN = { top: 20, right: 28, left: 0, bottom: 0 };
export const DASHBOARD_BAR_RADIUS = [8, 8, 8, 8];

export function resolveSeriesColor(item = {}, config = {}) {
  const key = String(item.dataKey ?? item.name ?? '');
  const itemConfig = config[key] ?? config[item.name] ?? {};

  return (
    item.payload?.fill
    ?? item.color
    ?? itemConfig.tooltipColor
    ?? itemConfig.color
    ?? 'var(--foreground)'
  );
}

export function shouldRenderChartValue(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue !== 0;
}

export function sumChartValues(rows = [], key) {
  return rows.reduce((total, row) => {
    const value = Number(row?.[key]);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}
