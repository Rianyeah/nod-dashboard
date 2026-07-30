import { DASHBOARD_CHART_COLORS } from '../../components/dashboard-charts/dashboardChartUtils.js';

export const reportingChartConfig = {
  total_revenue: { label: 'Revenue', color: DASHBOARD_CHART_COLORS.neutral },
  total_payload: { label: 'Payload', color: DASHBOARD_CHART_COLORS.accent },
  avg_availability: { label: 'Availability', color: DASHBOARD_CHART_COLORS.warning },
};
