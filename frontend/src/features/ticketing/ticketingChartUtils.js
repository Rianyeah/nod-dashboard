const TREND_TITLES = Object.freeze({
  day: 'Daily Trend Ticket by Kategori',
  week: 'Weekly Trend Ticket by Kategori',
  month: 'Monthly Trend Ticket by Kategori',
});

export const LOCATION_METRICS = Object.freeze([
  Object.freeze({ value: 'takeover_tickets', label: 'Takeover' }),
  Object.freeze({ value: 'visitation_tickets', label: 'Visitation' }),
  Object.freeze({ value: 'backup_sukses_tickets', label: 'Backup Sukses' }),
  Object.freeze({ value: 'escalated_tickets', label: 'Escalate' }),
]);

export function getTicketTrendTitle(granularity) {
  return TREND_TITLES[granularity] || TREND_TITLES.day;
}

function numericMetric(row, metric) {
  const value = Number(row?.[metric]);
  return Number.isFinite(value) ? value : 0;
}

export function getTopLocationRows(rows, metric, limit = 12) {
  return [...(rows || [])]
    .sort((left, right) => (
      numericMetric(right, metric) - numericMetric(left, metric)
      || String(left?.label || '').localeCompare(String(right?.label || ''))
    ))
    .slice(0, limit);
}
