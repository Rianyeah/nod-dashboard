const NUMERIC_FOP_FIELDS = new Set([
  'rank',
  'performance_score',
  'takeover_tickets',
  'visitation_tickets',
  'backup_sukses_tickets',
  'average_response_minutes',
]);

function calendarMonthIndex(value) {
  const match = /^(\d{4})-(\d{2})/.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return year * 12 + month - 1;
}

export function getFopMonthCount(periodMeta, startDate, endDate) {
  const activeMonths = periodMeta?.active_months;
  if (Array.isArray(activeMonths) && activeMonths.length > 0) return activeMonths.length;

  const start = calendarMonthIndex(startDate);
  const end = calendarMonthIndex(endDate);
  if (start == null || end == null || end < start) return 1;
  return end - start + 1;
}

export function getTakeoverThreshold(monthCount) {
  const safeMonthCount = Number.isFinite(Number(monthCount))
    ? Math.max(1, Math.floor(Number(monthCount)))
    : 1;
  return safeMonthCount * 26;
}

function compareNullableNumbers(left, right, direction) {
  const leftNumber = left == null ? null : Number(left);
  const rightNumber = right == null ? null : Number(right);
  const leftValid = Number.isFinite(leftNumber);
  const rightValid = Number.isFinite(rightNumber);
  if (!leftValid && !rightValid) return 0;
  if (!leftValid) return 1;
  if (!rightValid) return -1;
  return direction === 'asc' ? leftNumber - rightNumber : rightNumber - leftNumber;
}

export function sortFopRows(rows, key = 'performance_score', direction = 'desc') {
  const safeDirection = direction === 'asc' ? 'asc' : 'desc';
  return [...(rows || [])].sort((left, right) => {
    let comparison;
    if (NUMERIC_FOP_FIELDS.has(key)) {
      comparison = compareNullableNumbers(left?.[key], right?.[key], safeDirection);
    } else {
      comparison = String(left?.[key] || '').localeCompare(String(right?.[key] || ''));
      if (safeDirection === 'desc') comparison *= -1;
    }
    return comparison
      || compareNullableNumbers(left?.rank, right?.rank, 'asc')
      || String(left?.pic || '').localeCompare(String(right?.pic || ''));
  });
}
