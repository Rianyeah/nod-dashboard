export function parseLocalDate(value) {
  if (!value) return null;

  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

export function formatLocalDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getSevenDayWindow(endDate) {
  const end = parseLocalDate(endDate);
  if (!end) {
    return { start_date: null, end_date: null };
  }

  const start = new Date(end);
  start.setDate(start.getDate() - 6);

  return {
    start_date: formatLocalDate(start),
    end_date: formatLocalDate(end),
  };
}

export function formatDateLabel(value) {
  const date = typeof value === 'string' ? parseLocalDate(value) : value;
  if (!date) return '-';

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
