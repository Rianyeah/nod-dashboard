import { formatPayload, formatPercent, formatRevenue } from '../../utils/formatters.js';


function formatSigned(value, digits = 1, suffix = '%') {
  if (value == null) return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  const sign = number > 0 ? '+' : number < 0 ? '-' : '';
  return `${sign}${Math.abs(number).toFixed(digits).replace('.', ',')}${suffix}`;
}

function directionTone(value) {
  if (value == null) return 'unavailable';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'unavailable';
  if (number > 0) return 'positive';
  if (number < 0) return 'negative';
  return 'neutral';
}

function formatSignedMetric(value, formatter) {
  if (value == null) return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  const sign = number > 0 ? '+' : number < 0 ? '-' : '';
  return `${sign}${formatter(Math.abs(number))}`;
}

function driverContribution(value, noun = 'perubahan NOP') {
  const formatted = contributionPercent(value);
  return formatted === '-' ? null : `${formatted} dari ${noun}`;
}

function driverEvidence(metric, driver) {
  if (!driver?.site_id) return null;
  const parts = [driver.site_id];
  if (metric === 'revenue') {
    parts.push(formatSignedMetric(driver.delta_value, formatRevenue));
    parts.push(`${formatSigned(driver.delta_pct)} MoM`);
    const contribution = driverContribution(driver.contribution_pct);
    if (contribution) parts.push(contribution);
  } else if (metric === 'payload') {
    parts.push(formatSignedMetric(driver.delta_value, formatPayload));
    parts.push(`${formatSigned(driver.delta_pct)} MoM`);
    const contribution = driverContribution(driver.contribution_pct);
    if (contribution) parts.push(contribution);
  } else {
    parts.push(formatSigned(driver.delta_pct, 2, '%'));
    const outage = Number(driver.outage_delta_minutes);
    if (driver.outage_delta_minutes != null && Number.isFinite(outage)) {
      const sign = outage > 0 ? '+' : outage < 0 ? '-' : '';
      const value = Math.abs(outage).toFixed(Number.isInteger(outage) ? 0 : 1).replace('.', ',');
      parts.push(`outage ${sign}${value} menit`);
    }
    const contribution = driverContribution(driver.contribution_pct, 'perubahan outage NOP');
    if (contribution) parts.push(contribution);
  }
  return parts.join(' | ');
}

function contributionPercent(value) {
  if (value == null) return '-';
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1).replace('.', ',')}%` : '-';
}

function nopLabel(scopeLabel) {
  const normalized = String(scopeLabel || '').trim().replace(/^NOP\s+/i, '').toUpperCase();
  return normalized ? `NOP ${normalized}` : 'NOP';
}

function availabilityTargetDetail(thresholds = {}) {
  const values = Object.values(thresholds.availability || {})
    .filter((value) => value != null)
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
  if (thresholds.payload_target_tb == null) return 'Target payload site belum tersedia.';
  const value = Number(thresholds.payload_target_tb);
  if (!Number.isFinite(value)) return 'Target payload site belum tersedia.';
  return `Target site ${String(value).replace('.', ',')} TB per bulan.`;
}


function targetDetail(target = {}) {
  if (!target.complete) {
    const missing = target.missing_months?.length ? ` (${target.missing_months.join(', ')})` : '';
    return `Target belum lengkap${missing}.`;
  }
  if (target.gap == null) return null;
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
      driver: driverEvidence('revenue', revenue.driver),
      contribution: regional
        ? null
        : `Kontribusi ${nopLabel(overview.scope_label)} ${formatRevenue(revenue.value)} / ${contributionPercent(revenue.contribution?.contribution_pct)} pada ${regionalLabel}.`,
      recommendation: revenue.recommendation || null,
      tone: directionTone(revenue.delta_pct),
    },
    {
      key: 'availability',
      label: 'Availability',
      title: availability.value == null
        ? 'Data belum tersedia'
        : Number(availability.delta_pct) < 0 ? 'Availability menurun' : 'Availability terjaga',
      summary: `${formatPercent(availability.value)} | ${formatSigned(availability.delta_pct, 2, '%')} ${comparisonLabel}`,
      detail: availability.value == null ? 'Availability belum tersedia.' : availabilityTargetDetail(thresholds),
      driver: driverEvidence('availability', availability.driver),
      contribution: regional
        ? null
        : `Kontribusi ${nopLabel(overview.scope_label)}: ${formatPercent(availability.value)}, ${formatSigned(availability.contribution?.difference_pp, 2, '%')} terhadap ${regionalLabel}; kontribusi outage ${contributionPercent(availability.contribution?.contribution_pct)}.`,
      recommendation: availability.recommendation || null,
      tone: directionTone(availability.delta_pct),
    },
    {
      key: 'payload',
      label: 'Payload',
      title: payload.value == null
        ? 'Data belum tersedia'
        : Number(payload.delta_pct) < 0 ? 'Payload menurun' : Number(payload.delta_pct) > 0 ? 'Payload meningkat' : 'Payload stabil',
      summary: `${formatPayload(payload.value)} | ${formatSigned(payload.delta_pct)} ${comparisonLabel}`,
      detail: payloadTargetDetail(thresholds),
      driver: driverEvidence('payload', payload.driver),
      contribution: regional
        ? null
        : `Kontribusi ${nopLabel(overview.scope_label)} ${formatPayload(payload.value)} / ${contributionPercent(payload.contribution?.contribution_pct)} pada ${regionalLabel}.`,
      recommendation: payload.recommendation || null,
      tone: directionTone(payload.delta_pct),
    },
  ];
}
