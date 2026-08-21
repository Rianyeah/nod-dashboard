const INTEGER_FORMATTER = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const ONE_DECIMAL_FORMATTER = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatDuration(seconds, { isOpen = false } = {}) {
  if (seconds == null) return isOpen ? 'Belum close' : '-';
  const totalSeconds = Number(seconds);
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '-';

  const totalMinutes = Math.floor(totalSeconds / 60);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}h${hours > 0 ? ` ${hours}j` : ''}`;
  if (hours > 0) return `${hours}j${minutes > 0 ? ` ${minutes}m` : ''}`;
  return `${minutes}m`;
}

export function formatPeriodComparison(delta, rate) {
  if (delta == null || !Number.isFinite(Number(delta))) return 'Perbandingan belum tersedia';
  const numericDelta = Number(delta);
  const deltaPrefix = numericDelta > 0 ? '+' : numericDelta < 0 ? '-' : '';
  const deltaLabel = `${deltaPrefix}${INTEGER_FORMATTER.format(Math.abs(numericDelta))}`;
  const rateLabel = rate == null || !Number.isFinite(Number(rate))
    ? 'persentase tidak tersedia'
    : `${Number(rate) > 0 ? '+' : Number(rate) < 0 ? '-' : ''}${ONE_DECIMAL_FORMATTER.format(Math.abs(Number(rate)))}%`;
  return `${deltaLabel} (${rateLabel}) vs periode sebelumnya`;
}

export function formatRankSubtitle(tickets, share) {
  return `${INTEGER_FORMATTER.format(Number(tickets) || 0)} ticket • ${ONE_DECIMAL_FORMATTER.format(Number(share) || 0)}% dari total`;
}

export function formatShareSubtitle(share) {
  return `${ONE_DECIMAL_FORMATTER.format(Number(share) || 0)}% dari total ticket`;
}

export function formatTotiDateTime(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function displayText(value) {
  if (value == null || String(value).trim() === '') return '-';
  return String(value).trim();
}
