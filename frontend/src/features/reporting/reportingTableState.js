const METRICS = new Set([
  'revenue',
  'payload',
  'traffic',
  'avg_availability',
  'total_sites',
  'u30_sites',
  'u60_sites',
  'ticket_backup',
  'proker',
]);


function metricValue(row, metric) {
  if (metric === 'ticket_backup') {
    return Number(row?.ticket_swfm_bps || 0) + Number(row?.ticket_swfm_ts || 0);
  }
  if (metric === 'proker') {
    return Number(row?.proker_open || 0) + Number(row?.proker_closed || 0);
  }
  return row?.[metric];
}


export function rankAndSortAreas(rows = [], { metric = 'revenue', rank = 'all', limit = 10, direction } = {}) {
  const resolvedMetric = metric === 'availability' ? 'avg_availability' : metric;
  if (resolvedMetric === 'kabupaten') {
    const resolvedDirection = direction || 'asc';
    return [...rows].sort((left, right) => {
      const comparison = String(left?.kabupaten || '').localeCompare(String(right?.kabupaten || ''), 'id');
      return resolvedDirection === 'desc' ? -comparison : comparison;
    });
  }
  const safeMetric = METRICS.has(resolvedMetric) ? resolvedMetric : 'revenue';
  const resolvedDirection = direction || (rank === 'bottom' ? 'asc' : 'desc');
  const sorted = [...rows].sort((left, right) => {
    const leftRaw = metricValue(left, safeMetric);
    const rightRaw = metricValue(right, safeMetric);
    const leftValue = Number(leftRaw);
    const rightValue = Number(rightRaw);
    const leftValid = Number.isFinite(leftValue) && leftRaw != null;
    const rightValid = Number.isFinite(rightValue) && rightRaw != null;
    if (!leftValid && !rightValid) return String(left?.kabupaten || '').localeCompare(String(right?.kabupaten || ''));
    if (!leftValid) return 1;
    if (!rightValid) return -1;
    if (leftValue === rightValue) return String(left?.kabupaten || '').localeCompare(String(right?.kabupaten || ''));
    return resolvedDirection === 'asc' ? leftValue - rightValue : rightValue - leftValue;
  });
  return rank === 'all' ? sorted : sorted.slice(0, Math.max(1, Number(limit) || 10));
}


export function toAreaMobileMetric(row = {}) {
  return {
    identity: row.kabupaten || 'Belum Terpetakan',
    revenue: { value: row.revenue ?? 0, delta: row.revenue_delta_pct ?? null },
    payload: { value: row.payload ?? 0, delta: row.payload_delta_pct ?? null },
    availability: { value: row.avg_availability ?? null, delta: row.availability_delta_pct ?? null },
    sites: row.total_sites ?? 0,
    u30: { value: row.u30_sites ?? 0, delta: row.u30_mom_pct ?? null },
    u60: { value: row.u60_sites ?? 0, delta: row.u60_mom_pct ?? null },
  };
}
