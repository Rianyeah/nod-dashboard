import { DASHBOARD_CHART_COLORS } from '../../components/dashboard-charts/dashboardChartUtils.js';

export const TRANSPORT_CHART_COLORS = {
  packetLoss: DASHBOARD_CHART_COLORS.danger,
  latency: DASHBOARD_CHART_COLORS.warning,
  jitter: DASHBOARD_CHART_COLORS.info,
  p1: DASHBOARD_CHART_COLORS.danger,
  p2: DASHBOARD_CHART_COLORS.warning,
  normal: DASHBOARD_CHART_COLORS.success,
  total: DASHBOARD_CHART_COLORS.neutral,
  thi: DASHBOARD_CHART_COLORS.accent,
};

export const transportQualityChartConfig = {
  pl_over_1_sites: {
    label: 'PL >1%',
    color: TRANSPORT_CHART_COLORS.packetLoss,
  },
  latency_over_5_sites: {
    label: 'Latency >5ms',
    color: TRANSPORT_CHART_COLORS.latency,
  },
  jitter_not_clear_sites: {
    label: 'Jitter NOT-CLEAR',
    color: TRANSPORT_CHART_COLORS.jitter,
  },
  thi_fail_sites: {
    label: 'THI Fail',
    color: TRANSPORT_CHART_COLORS.thi,
  },
  records: {
    label: 'Records',
    color: TRANSPORT_CHART_COLORS.total,
  },
  p1_sites: {
    label: 'P1',
    color: TRANSPORT_CHART_COLORS.p1,
  },
  p2_sites: {
    label: 'P2',
    color: TRANSPORT_CHART_COLORS.p2,
  },
};
