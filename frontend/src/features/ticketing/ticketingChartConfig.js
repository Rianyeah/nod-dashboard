export const TICKETING_CHART_COLORS = {
  bps: 'var(--chart-1)',
  ts: 'var(--chart-3)',
  total: 'var(--chart-4)',
  tickets: 'var(--chart-1)',
  cumulative: 'var(--chart-4)',
  danger: 'var(--chart-2)',
  warning: 'var(--chart-4)',
  success: 'var(--chart-3)',
  violet: 'var(--chart-5)',
  incident: 'var(--chart-1)',
  event: 'var(--chart-4)',
  fallback: 'var(--chart-5)',
};

export const ticketingChartConfig = {
  bps: { label: 'BPS', color: TICKETING_CHART_COLORS.bps },
  ts: { label: 'TS', color: TICKETING_CHART_COLORS.ts },
  tickets: { label: 'Tickets', color: TICKETING_CHART_COLORS.tickets },
  visiting_site: { label: 'Visiting Site', color: TICKETING_CHART_COLORS.bps },
  backup_genset: { label: 'Backup Genset', color: TICKETING_CHART_COLORS.success },
  cumulative_rate: { label: 'Cumulative Rate', color: TICKETING_CHART_COLORS.cumulative },
  incident: { label: 'Incident', color: TICKETING_CHART_COLORS.incident },
  event: { label: 'Event', color: TICKETING_CHART_COLORS.event },
};

export function getSlaStatusColor(label) {
  const status = String(label || '').trim().toUpperCase();
  if (status === 'IN SLA') return TICKETING_CHART_COLORS.success;
  if (status === 'OUT SLA') return TICKETING_CHART_COLORS.danger;
  if (status === 'PENDING') return TICKETING_CHART_COLORS.warning;
  return TICKETING_CHART_COLORS.fallback;
}

export function getTicketTypeColor(label) {
  const type = String(label || '').trim().toUpperCase();
  if (type === 'INCIDENT') return TICKETING_CHART_COLORS.incident;
  if (type === 'EVENT') return TICKETING_CHART_COLORS.event;
  return TICKETING_CHART_COLORS.fallback;
}

export function formatCompactParetoLabel(label) {
  const value = String(label || '');
  return value.length > 10 ? `${value.slice(0, 9)}…` : value;
}
