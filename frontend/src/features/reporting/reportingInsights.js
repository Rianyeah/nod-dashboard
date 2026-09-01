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

function nopLabel(scopeLabel) {
  const normalized = String(scopeLabel || '').trim().replace(/^NOP\s+/i, '').toUpperCase();
  return normalized ? `NOP ${normalized}` : 'NOP';
}

function availabilityTargetDetail(thresholds = {}) {
  const values = Object.values(thresholds.availability || {})
    .map(Number)
    .filter(Number.isFinite);
  if (!values.length) return 'Target availability Site Class belum tersedia.';
  const minimum = Math.min(...values).toFixed(2).replace('.', ',');
  const maximum = Math.max(...values).toFixed(2).replace('.', ',');
  return minimum === maximum
    ? `Target availability Site Class ${minimum}%.`
    : `Target availability Site Class ${minimum}%-${maximum}%.`;
}

function payloadTargetDetail(thresholds = {}) {
  const value = Number(thresholds.payload_target_tb);
  if (!Number.isFinite(value)) return 'Target payload site belum tersedia.';
  return `Target site ${String(value).replace('.', ',')} TB per bulan.`;
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
  const thresholds = overview.thresholds || {};
  const regionalLabel = 'Regional Jatim';

  return [
    {
      key: 'revenue',
      label: 'Revenue',
      title: revenue.severity === 'success' ? 'Target tercapai' : revenue.severity === 'warning' ? 'Di bawah target' : 'Target belum tersedia',
      summary: `${formatRevenue(revenue.value)} | ${formatSigned(revenue.delta_pct)} ${comparisonLabel}`,
      detail: targetDetail(revenue.target),
      contribution: regional
        ? null
        : `Kontribusi ${nopLabel(overview.scope_label)} ${formatRevenue(revenue.value)} / ${contributionPercent(revenue.contribution?.contribution_pct)} pada ${regionalLabel}.`,
      tone: revenue.severity || 'unavailable',
    },
    {
      key: 'availability',
      label: 'Availability',
      title: availability.value == null
        ? 'Data belum tersedia'
        : Number(availability.delta_pct) < 0 ? 'Availability menurun' : 'Availability terjaga',
      summary: `${formatPercent(availability.value)} | ${formatSigned(availability.delta_pct, 2, ' pp')} ${comparisonLabel}`,
      detail: availability.value == null ? 'Availability belum tersedia.' : availabilityTargetDetail(thresholds),
      contribution: regional
        ? null
        : `Kontribusi ${nopLabel(overview.scope_label)}: ${formatPercent(availability.value)}, ${formatSigned(availability.contribution?.difference_pp, 2, ' pp')} terhadap ${regionalLabel}; kontribusi outage ${contributionPercent(availability.contribution?.contribution_pct)}.`,
      tone: availability.severity || 'unavailable',
    },
    {
      key: 'payload',
      label: 'Payload',
      title: payload.value == null
        ? 'Data belum tersedia'
        : Number(payload.delta_pct) < 0 ? 'Payload menurun' : Number(payload.delta_pct) > 0 ? 'Payload meningkat' : 'Payload stabil',
      summary: `${formatPayload(payload.value)} | ${formatSigned(payload.delta_pct)} ${comparisonLabel}`,
      detail: payloadTargetDetail(thresholds),
      contribution: regional
        ? null
        : `Kontribusi ${nopLabel(overview.scope_label)} ${formatPayload(payload.value)} / ${contributionPercent(payload.contribution?.contribution_pct)} pada ${regionalLabel}.`,
      tone: payload.severity || 'info',
    },
  ];
}
