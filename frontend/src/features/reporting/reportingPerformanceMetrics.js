const SUM_FIELDS = [
  'total_sites',
  'revenue',
  'previous_revenue',
  'rev_voice',
  'rev_bb',
  'rev_dig',
  'rev_sms',
  'rev_ir',
  'payload',
  'previous_payload',
  'traffic',
  'total_time_minutes',
  'outage_minutes',
  'previous_total_time_minutes',
  'previous_outage_minutes',
  'ticket_swfm_bps',
  'ticket_swfm_ts',
  'backup_sukses_bps',
  'proker_open',
  'proker_closed',
];

export function calculateBackupSuksesRate(successCount, bpsCount) {
  const success = Number(successCount);
  const bps = Number(bpsCount);
  if (!Number.isFinite(success) || !Number.isFinite(bps) || bps <= 0) return 0;
  return Math.round((10000 * success) / bps) / 100;
}

function weightedAvailability(totalMinutes, outageMinutes) {
  const total = Number(totalMinutes);
  if (!Number.isFinite(total) || total <= 0) return null;
  return ((total - Number(outageMinutes || 0)) / total) * 100;
}

function relativeChange(current, previous) {
  const before = Number(previous);
  if (!Number.isFinite(before) || before === 0) return null;
  return ((Number(current) - before) / before) * 100;
}

export function buildAreaGrandTotal(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const totals = Object.fromEntries(SUM_FIELDS.map((field) => [field, 0]));

  for (const row of rows) {
    for (const field of SUM_FIELDS) {
      const value = Number(row?.[field]);
      totals[field] += Number.isFinite(value) ? value : 0;
    }
  }

  totals.revenue_delta_pct = relativeChange(totals.revenue, totals.previous_revenue);
  totals.payload_delta_pct = relativeChange(totals.payload, totals.previous_payload);
  totals.avg_availability = weightedAvailability(
    totals.total_time_minutes,
    totals.outage_minutes,
  );
  totals.previous_avg_availability = weightedAvailability(
    totals.previous_total_time_minutes,
    totals.previous_outage_minutes,
  );
  totals.availability_delta_pct = (
    totals.avg_availability != null && totals.previous_avg_availability != null
      ? totals.avg_availability - totals.previous_avg_availability
      : null
  );
  totals.backup_sukses_rate = calculateBackupSuksesRate(
    totals.backup_sukses_bps,
    totals.ticket_swfm_bps,
  );
  return totals;
}
