import { DASHBOARD_CHART_COLORS } from '../../components/dashboard-charts/dashboardChartUtils.js';

export const ACTIVITY_CHART_COLORS = {
  total: DASHBOARD_CHART_COLORS.neutral,
  open: DASHBOARD_CHART_COLORS.danger,
  close: DASHBOARD_CHART_COLORS.success,
  sites: DASHBOARD_CHART_COLORS.neutralMuted,
  category: DASHBOARD_CHART_COLORS.accent,
};

export const activityEnomChartConfig = {
  open: { label: 'OPEN', color: ACTIVITY_CHART_COLORS.open },
  close: { label: 'CLOSE', color: ACTIVITY_CHART_COLORS.close },
  total: { label: 'Total Trend', color: ACTIVITY_CHART_COLORS.total },
  category: { label: 'Total', color: ACTIVITY_CHART_COLORS.category },
};
