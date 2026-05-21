/**
 * Number formatting utilities for Network Reporting.
 * Handles Indonesian currency (Rupiah) and data units (GB/TB).
 */

/**
 * Format revenue in Indonesian Rupiah with smart abbreviation.
 * @param {number} value — Revenue in IDR (integer)
 * @returns {string} — e.g. "Rp 43,2 M" or "Rp 150,3 Jt"
 */
export function formatRevenue(value) {
  if (value == null || isNaN(value)) return '-';
  const num = Number(value);
  if (num >= 1_000_000_000_000) {
    return `Rp ${(num / 1_000_000_000_000).toFixed(1).replace('.', ',')} T`;
  }
  if (num >= 1_000_000_000) {
    return `Rp ${(num / 1_000_000_000).toFixed(1).replace('.', ',')} M`;
  }
  if (num >= 1_000_000) {
    return `Rp ${(num / 1_000_000).toFixed(1).replace('.', ',')} Jt`;
  }
  if (num >= 1_000) {
    return `Rp ${(num / 1_000).toFixed(1).replace('.', ',')} Rb`;
  }
  return `Rp ${num.toLocaleString('id-ID')}`;
}

/**
 * Format revenue as a shorter version (no "Rp" prefix), for table cells.
 * @param {number} value — Revenue in IDR
 * @returns {string}
 */
export function formatRevenueShort(value) {
  if (value == null || isNaN(value)) return '-';
  const num = Number(value);
  if (num >= 1_000_000_000_000) {
    return `${(num / 1_000_000_000_000).toFixed(2).replace('.', ',')} T`;
  }
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(2).replace('.', ',')} M`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1).replace('.', ',')} Jt`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(0)} Rb`;
  }
  return num.toLocaleString('id-ID');
}

/**
 * Format payload/data volume with smart units.
 * Input is assumed to be in KB.
 * @param {number} value — Payload in KB
 * @returns {string} — e.g. "11,3 TB" or "2,8 GB"
 */
export function formatPayload(value) {
  if (value == null || isNaN(value)) return '-';
  const num = Number(value);
  // KB → MB → GB → TB
  const mb = num / 1_024;
  const gb = mb / 1_024;
  const tb = gb / 1_024;

  if (tb >= 1) {
    return `${tb.toFixed(1).replace('.', ',')} TB`;
  }
  if (gb >= 1) {
    return `${gb.toFixed(1).replace('.', ',')} GB`;
  }
  if (mb >= 1) {
    return `${mb.toFixed(1).replace('.', ',')} MB`;
  }
  return `${num.toLocaleString('id-ID')} KB`;
}

/**
 * Format traffic subscriber count.
 * @param {number} value
 * @returns {string}
 */
export function formatTraffic(value) {
  if (value == null || isNaN(value)) return '-';
  return Number(value).toLocaleString('id-ID');
}

/**
 * Format percentage.
 * @param {number} value — e.g. 99.1234
 * @returns {string} — e.g. "99,12%"
 */
export function formatPercent(value) {
  if (value == null || isNaN(value)) return '-';
  return `${Number(value).toFixed(2).replace('.', ',')}%`;
}

/**
 * Format a plain number with Indonesian thousands separator.
 * @param {number} value
 * @returns {string}
 */
export function formatNumber(value) {
  if (value == null || isNaN(value)) return '-';
  return Number(value).toLocaleString('id-ID');
}
