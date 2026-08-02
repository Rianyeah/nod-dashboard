import { DASHBOARD_CHART_COLORS } from '../../components/dashboard-charts/dashboardChartUtils.js';

export const homeChartConfig = {
  total_revenue: { label: 'Revenue', color: DASHBOARD_CHART_COLORS.accent },
  total_payload: { label: 'Payload', color: DASHBOARD_CHART_COLORS.info },
  avg_availability: { label: 'Availability', color: DASHBOARD_CHART_COLORS.warning },
};
