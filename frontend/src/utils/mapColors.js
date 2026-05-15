/**
 * Map marker color system based on availability status.
 * Colors per NOD specification.
 */

export const STATUS_COLORS = {
  excellent: '#22C55E',  // hijau — ≥ 99.5%
  good: '#EAB308',       // kuning — 95% – 99.4%
  critical: '#EF4444',   // merah — < 95%
  noData: '#9CA3AF',     // abu — no data
  nonActive: '#374151',  // hitam — non-aktif
};

export const STATUS_LABELS = {
  excellent: 'Excellent',
  good: 'Good',
  critical: 'Critical',
  noData: 'No Data',
  nonActive: 'Non-Aktif',
};

/**
 * Get marker color based on availability value.
 * @param {number|null|undefined} availability - Value between 0 and 100
 * @param {string|null} statusSite - Site status string
 * @returns {string} Hex color code
 */
export function getMarkerColor(availability, statusSite = null) {
  if (statusSite && statusSite.toLowerCase().includes('non')) {
    return STATUS_COLORS.nonActive;
  }
  if (availability === null || availability === undefined) {
    return STATUS_COLORS.noData;
  }
  if (availability >= 99.5) return STATUS_COLORS.excellent;
  if (availability >= 95)   return STATUS_COLORS.good;
  return STATUS_COLORS.critical;
}

/**
 * Get status label based on availability value.
 * @param {number|null|undefined} availability
 * @param {string|null} statusSite
 * @returns {string} Status label
 */
export function getStatusLabel(availability, statusSite = null) {
  if (statusSite && statusSite.toLowerCase().includes('non')) {
    return STATUS_LABELS.nonActive;
  }
  if (availability === null || availability === undefined) {
    return STATUS_LABELS.noData;
  }
  if (availability >= 99.5) return STATUS_LABELS.excellent;
  if (availability >= 95)   return STATUS_LABELS.good;
  return STATUS_LABELS.critical;
}

/**
 * Format availability as percentage string.
 * @param {number|null} value - Value between 0 and 100 (already a percentage)
 * @returns {string}
 */
export function formatAvailability(value) {
  if (value === null || value === undefined) return 'N/A';
  return `${Number(value).toFixed(2)}%`;
}

/**
 * Format outage minutes to human-readable string.
 * @param {number|null} minutes
 * @returns {string}
 */
export function formatOutage(minutes) {
  if (minutes === null || minutes === undefined) return 'N/A';
  if (minutes < 60) return `${Math.round(minutes)} menit`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours} jam ${mins} menit`;
}
