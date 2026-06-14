export const TRANSPORT_CHART_COLORS = {
  packetLoss: 'var(--chart-2)',
  latency: 'var(--chart-4)',
  jitter: '#22D3EE',
  p1: 'var(--chart-2)',
  p2: 'var(--chart-4)',
  normal: 'var(--chart-3)',
  total: 'var(--chart-1)',
  thi: 'var(--chart-5)',
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
