import { DASHBOARD_CHART_COLORS } from '../../components/dashboard-charts/dashboardChartUtils.js';

export const dataPotensiChartConfig = {
  total: { label: 'Total Site', color: DASHBOARD_CHART_COLORS.neutral },
  percentage: { label: 'Share', color: DASHBOARD_CHART_COLORS.accent },
  lithium: { label: 'Lithium', color: DASHBOARD_CHART_COLORS.success },
  vrla: { label: 'VRLA', color: DASHBOARD_CHART_COLORS.neutralMuted },
};
