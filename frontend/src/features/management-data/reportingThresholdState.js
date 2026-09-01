const SITE_CLASSES = ['diamond', 'platinum', 'gold', 'silver', 'bronze'];


function parseDecimal(value) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}


function parseInteger(value) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}


export function thresholdSnapshotDraft(snapshot) {
  const availability = snapshot?.availability || {};
  return {
    availability: Object.fromEntries(
      SITE_CLASSES.map((siteClass) => [
        siteClass,
        availability[siteClass.toUpperCase()] == null
          ? ''
          : String(availability[siteClass.toUpperCase()]).replace('.', ','),
      ]),
    ),
    revenue_u30_upper: snapshot?.revenue_u30_upper == null
      ? ''
      : String(snapshot.revenue_u30_upper),
    revenue_u60_upper: snapshot?.revenue_u60_upper == null
      ? ''
      : String(snapshot.revenue_u60_upper),
    payload_target_tb: snapshot?.payload_target_tb == null
      ? ''
      : String(snapshot.payload_target_tb).replace('.', ','),
  };
}


export function validateThresholdDraft(draft) {
  const errors = {};
  for (const siteClass of SITE_CLASSES) {
    const value = parseDecimal(draft?.availability?.[siteClass]);
    if (!Number.isFinite(value) || value <= 0 || value > 100) {
      errors[siteClass] = 'Isi nilai lebih dari 0 sampai 100.';
    }
  }

  const u30 = parseInteger(draft?.revenue_u30_upper);
  const u60 = parseInteger(draft?.revenue_u60_upper);
  if (!Number.isFinite(u30) || u30 <= 0) {
    errors.revenue_u30_upper = 'Batas U30 wajib berupa rupiah bulat positif.';
  }
  if (!Number.isFinite(u60) || u60 <= 0) {
    errors.revenue_u60_upper = 'Batas U60 wajib berupa rupiah bulat positif.';
  }
  if (Number.isFinite(u30) && Number.isFinite(u60) && u30 >= u60) {
    errors.revenue_u30_upper = 'Batas U30 harus lebih kecil dari batas U60.';
  }

  const payload = parseDecimal(draft?.payload_target_tb);
  if (!Number.isFinite(payload) || payload <= 0) {
    errors.payload_target_tb = 'Target payload wajib lebih dari 0 TB.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}


export function thresholdDraftPayload(draft) {
  const validation = validateThresholdDraft(draft);
  if (!validation.valid) {
    throw new Error('Threshold draft tidak valid.');
  }
  return {
    availability: Object.fromEntries(
      SITE_CLASSES.map((siteClass) => [
        siteClass,
        parseDecimal(draft.availability[siteClass]),
      ]),
    ),
    revenue_u30_upper: parseInteger(draft.revenue_u30_upper),
    revenue_u60_upper: parseInteger(draft.revenue_u60_upper),
    payload_target_tb: parseDecimal(draft.payload_target_tb),
  };
}


export { SITE_CLASSES };
