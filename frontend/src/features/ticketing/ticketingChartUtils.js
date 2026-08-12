const TREND_TITLES = Object.freeze({
  day: 'Daily Trend Ticket by Kategori',
  week: 'Weekly Trend Ticket by Kategori',
  month: 'Monthly Trend Ticket by Kategori',
});

export const LOCATION_METRICS = Object.freeze([
  Object.freeze({ value: 'takeover', label: 'Takeover' }),
  Object.freeze({ value: 'visitation', label: 'Visitation' }),
  Object.freeze({ value: 'backup_sukses', label: 'Backup Sukses' }),
  Object.freeze({ value: 'escalate', label: 'Escalate' }),
]);

const LOCATION_CATEGORY_ORDER = Object.freeze({
  takeover: Object.freeze(['TAKE OVER', 'NOT TAKEN', 'UNKNOWN']),
  visitation: Object.freeze(['VISIT SITE', 'NOT VISIT', 'UNKNOWN']),
  backup_sukses: Object.freeze(['BU GENSET', 'NOT BU GENSET', 'UNKNOWN']),
  escalate: Object.freeze(['ESCALATED', 'NOT ESCALATED', 'UNKNOWN']),
});

export function getTicketTrendTitle(granularity) {
  return TREND_TITLES[granularity] || TREND_TITLES.day;
}

function categoryPosition(metric, value) {
  const order = LOCATION_CATEGORY_ORDER[metric] || [];
  const index = order.indexOf(String(value || '').toUpperCase());
  return index === -1 ? order.length : index;
}

export function buildStackedLocationData(rows, metric, limit = 12) {
  const activeRows = (rows || []).filter((row) => row?.metric === metric);
  const categoryLabels = [...new Set(activeRows.map((row) => String(row?.value || 'Unknown')))];
  categoryLabels.sort((left, right) => (
    categoryPosition(metric, left) - categoryPosition(metric, right)
    || left.localeCompare(right)
  ));

  const series = categoryLabels.map((label, index) => ({
    dataKey: `location_series_${index}`,
    label,
  }));
  const seriesByLabel = new Map(series.map((item) => [item.label, item.dataKey]));
  const locations = new Map();

  activeRows.forEach((row) => {
    const label = String(row?.label || 'Unknown');
    if (!locations.has(label)) {
      locations.set(label, {
        label,
        total: 0,
        ...Object.fromEntries(series.map((item) => [item.dataKey, 0])),
      });
    }
    const tickets = Number(row?.tickets);
    const safeTickets = Number.isFinite(tickets) && tickets > 0 ? tickets : 0;
    const location = locations.get(label);
    const dataKey = seriesByLabel.get(String(row?.value || 'Unknown'));
    location[dataKey] += safeTickets;
    location.total += safeTickets;
  });

  const stackedRows = [...locations.values()]
    .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label))
    .slice(0, limit);

  return { rows: stackedRows, series };
}
