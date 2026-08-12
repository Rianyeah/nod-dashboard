import { DASHBOARD_CHART_COLORS } from '../../components/dashboard-charts/dashboardChartUtils.js';

export const TICKETING_CHART_COLORS = {
  bps: DASHBOARD_CHART_COLORS.accent,
  ts: DASHBOARD_CHART_COLORS.neutral,
  total: DASHBOARD_CHART_COLORS.neutralMuted,
  tickets: DASHBOARD_CHART_COLORS.neutral,
  cumulative: DASHBOARD_CHART_COLORS.accent,
  danger: DASHBOARD_CHART_COLORS.danger,
  warning: DASHBOARD_CHART_COLORS.warning,
  success: DASHBOARD_CHART_COLORS.success,
  violet: DASHBOARD_CHART_COLORS.neutralMuted,
  incident: DASHBOARD_CHART_COLORS.accent,
  event: DASHBOARD_CHART_COLORS.neutral,
  fallback: DASHBOARD_CHART_COLORS.neutralMuted,
};

export const ticketingChartConfig = {
  bps: { label: 'BPS', color: TICKETING_CHART_COLORS.bps },
  ts: { label: 'TS', color: TICKETING_CHART_COLORS.ts },
  tickets: { label: 'Tickets', color: TICKETING_CHART_COLORS.tickets },
  takeover_tickets: { label: 'Takeover', color: TICKETING_CHART_COLORS.warning },
  visitation_tickets: { label: 'Visitation', color: TICKETING_CHART_COLORS.violet },
  backup_sukses_tickets: { label: 'Backup Sukses', color: TICKETING_CHART_COLORS.success },
  escalated_tickets: { label: 'Escalate', color: TICKETING_CHART_COLORS.danger },
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
