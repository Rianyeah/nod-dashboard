import { DASHBOARD_CHART_COLORS } from '../../components/dashboard-charts/dashboardChartUtils.js';

export const STATUS_COLORS = {
  total: DASHBOARD_CHART_COLORS.neutral,
  open: DASHBOARD_CHART_COLORS.danger,
  clear: DASHBOARD_CHART_COLORS.success,
  warning: DASHBOARD_CHART_COLORS.warning,
  impacted: DASHBOARD_CHART_COLORS.accent,
};

export const impactServiceChartConfig = {
  total: {
    label: 'Total',
    color: STATUS_COLORS.total,
  },
  open: {
    label: 'OPEN',
    color: STATUS_COLORS.open,
  },
  clear: {
    label: 'CLEAR',
    color: STATUS_COLORS.clear,
  },
};

const AGING_COLORS = [
  DASHBOARD_CHART_COLORS.success,
  DASHBOARD_CHART_COLORS.info,
  DASHBOARD_CHART_COLORS.warning,
  DASHBOARD_CHART_COLORS.accent,
  DASHBOARD_CHART_COLORS.danger,
];

export const CATEGORY_COLORS = [
  DASHBOARD_CHART_COLORS.accent,
  DASHBOARD_CHART_COLORS.neutral,
  DASHBOARD_CHART_COLORS.warning,
  DASHBOARD_CHART_COLORS.success,
  DASHBOARD_CHART_COLORS.info,
  DASHBOARD_CHART_COLORS.danger,
  DASHBOARD_CHART_COLORS.neutralMuted,
];

export function getAgingColor(index) {
  return AGING_COLORS[Math.min(index, AGING_COLORS.length - 1)];
}

export function getCategoryColor(index) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}
