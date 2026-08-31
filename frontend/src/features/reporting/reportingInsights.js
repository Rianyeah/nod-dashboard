import { formatPayload, formatPercent, formatRevenue } from '../../utils/formatters.js';


function formatSigned(value, digits = 1, suffix = '%') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  const sign = number > 0 ? '+' : number < 0 ? '-' : '';
  return `${sign}${Math.abs(number).toFixed(digits).replace('.', ',')}${suffix}`;
}

function contributionPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1).replace('.', ',')}%` : '-';
}


function targetDetail(target = {}) {
  if (!target.complete) {
    const missing = target.missing_months?.length ? ` (${target.missing_months.join(', ')})` : '';
    return `Target belum lengkap${missing}.`;
  }
  const gap = Number(target.gap);
  if (!Number.isFinite(gap)) return null;
  return gap >= 0
    ? `Target tercapai, surplus ${formatRevenue(gap)}.`
    : `Gap target ${formatRevenue(Math.abs(gap))}.`;
}


export function buildReportingInsights(overview = {}, comparisonLabel = 'vs periode sebelumnya') {
  const regional = overview.scope_label === 'Regional Jatim';
  const revenue = overview.revenue || {};
  const availability = overview.availability || {};
  const payload = overview.payload || {};
  const regionalLabel = 'Regional Jatim';

  return [
    {
      key: 'revenue',
      label: 'Revenue',
      title: revenue.severity === 'success' ? 'Target tercapai' : revenue.severity === 'warning' ? 'Di bawah target' : 'Target belum tersedia',
      summary: `${formatRevenue(revenue.value)} · ${formatSigned(revenue.delta_pct)} ${comparisonLabel}`,
      detail: targetDetail(revenue.target),
      contribution: regional
        ? regionalLabel
        : `${formatRevenue(revenue.value)} · ${contributionPercent(revenue.contribution?.contribution_pct)} dari ${regionalLabel}`,
      tone: revenue.severity || 'unavailable',
    },
    {
      key: 'availability',
      label: 'Availability',
      title: availability.severity === 'success' ? 'SLA tercapai' : availability.value == null ? 'Data belum tersedia' : 'Di bawah SLA',
      summary: `${formatPercent(availability.value)} · ${formatSigned(availability.delta_pct, 2, ' pp')} ${comparisonLabel}`,
      detail: availability.value == null ? 'Availability belum tersedia.' : 'SLA 99,50%.',
      contribution: regional
        ? regionalLabel
        : `${formatPercent(availability.value)} · ${formatSigned(availability.contribution?.difference_pp, 2, ' pp')} vs ${regionalLabel} · ${contributionPercent(availability.contribution?.contribution_pct)} outage`,
      tone: availability.severity || 'unavailable',
    },
    {
      key: 'payload',
      label: 'Payload',
      title: payload.value == null ? 'Data belum tersedia' : 'Pergerakan payload',
      summary: `${formatPayload(payload.value)} · ${formatSigned(payload.delta_pct)} ${comparisonLabel}`,
      detail: null,
      contribution: regional
        ? regionalLabel
        : `${formatPayload(payload.value)} · ${contributionPercent(payload.contribution?.contribution_pct)} dari ${regionalLabel}`,
      tone: payload.severity || 'info',
    },
  ];
}
