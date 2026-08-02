export const TRANSPORT_TREND_SERIES = Object.freeze([
  'pl_over_1_sites',
  'latency_over_5_sites',
  'jitter_not_clear_sites',
  'thi_fail_sites',
]);

export function resolveTransportTrendAxes() {
  const axisBySeries = {
    pl_over_1_sites: 'large',
    latency_over_5_sites: 'small',
    jitter_not_clear_sites: 'small',
    thi_fail_sites: 'small',
  };

  return {
    axisBySeries,
    hasLargeSeries: true,
  };
}
