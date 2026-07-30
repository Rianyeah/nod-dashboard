const SUM_FIELDS = [
  'total_sites',
  'rev',
  'rev_voice',
  'rev_bb',
  'rev_dig',
  'rev_sms',
  'rev_ir',
  'payload',
  'traffic',
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

export function buildRevenueTotals(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const totals = Object.fromEntries(SUM_FIELDS.map((field) => [field, 0]));
  let weightedAvailability = 0;
  let availabilitySites = 0;

  for (const row of rows) {
    for (const field of SUM_FIELDS) {
      const value = Number(row?.[field]);
      totals[field] += Number.isFinite(value) ? value : 0;
    }
    const availability = Number(row?.avg_availability);
    const sites = Number(row?.total_sites);
    if (Number.isFinite(availability) && Number.isFinite(sites) && sites > 0) {
      weightedAvailability += availability * sites;
      availabilitySites += sites;
    }
  }

  totals.avg_availability = availabilitySites > 0
    ? weightedAvailability / availabilitySites
    : null;
  totals.backup_sukses_rate = calculateBackupSuksesRate(
    totals.backup_sukses_bps,
    totals.ticket_swfm_bps,
  );
  return totals;
}
