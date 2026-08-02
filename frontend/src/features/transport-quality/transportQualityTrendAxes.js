export const TRANSPORT_TREND_SERIES = Object.freeze([
  'pl_over_1_sites',
  'latency_over_5_sites',
  'jitter_not_clear_sites',
  'thi_fail_sites',
]);

function toNonNegativeFiniteNumber(value) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return null;
  }

  try {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : null;
  } catch {
    return null;
  }
}

export function resolveTransportTrendAxes(rows = []) {
  const trendRows = Array.isArray(rows) ? rows : [];
  const axisBySeries = Object.fromEntries(TRANSPORT_TREND_SERIES.map((series) => {
    let maximum = null;

    for (const row of trendRows) {
      const value = toNonNegativeFiniteNumber(row?.[series]);
      if (value !== null && (maximum === null || value > maximum)) {
        maximum = value;
      }
    }

    return [series, maximum !== null && maximum > 50 ? 'large' : 'small'];
  }));

  return {
    axisBySeries,
    hasLargeSeries: Object.values(axisBySeries).includes('large'),
  };
}
