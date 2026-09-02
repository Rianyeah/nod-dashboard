const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
const FULL_MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function parseMonth(value) {
  const match = MONTH_PATTERN.exec(value || '');
  if (!match) throw new Error('Periode harus berformat YYYY-MM.');
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

function formatMonthIndex(monthIndex) {
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function buildMonthRange(periodStart, periodEnd) {
  const startIndex = parseMonth(periodStart);
  const endIndex = parseMonth(periodEnd);
  const monthCount = endIndex - startIndex + 1;
  if (monthCount <= 0) throw new Error('Rentang bulan harus berurutan.');
  if (monthCount > 12) throw new Error('Rentang maksimal 12 bulan.');

  return {
    periodStart,
    periodEnd,
    activeMonths: Array.from({ length: monthCount }, (_, index) => formatMonthIndex(startIndex + index)),
    comparisonStart: formatMonthIndex(startIndex - monthCount),
    comparisonEnd: formatMonthIndex(startIndex - 1),
    contextStart: formatMonthIndex(startIndex - 6),
  };
}

export function getSemesterRange(year, semester) {
  const numericYear = Number(year);
  if (!Number.isInteger(numericYear) || ![1, 2].includes(Number(semester))) {
    throw new Error('Tahun dan semester tidak valid.');
  }
  return semester === 1
    ? { start: `${numericYear}-01`, end: `${numericYear}-06` }
    : { start: `${numericYear}-07`, end: `${numericYear}-12` };
}

export function formatMonthRangeLabel(periodStart, periodEnd) {
  const range = buildMonthRange(periodStart, periodEnd);
  const [startYear, startMonth] = periodStart.split('-').map(Number);
  const [endYear, endMonth] = periodEnd.split('-').map(Number);
  if (range.activeMonths.length === 1) return `${MONTH_NAMES[startMonth - 1]} ${startYear}`;
  if (startYear === endYear && startMonth === 1 && endMonth === 6) return `Semester 1 ${startYear}`;
  if (startYear === endYear && startMonth === 7 && endMonth === 12) return `Semester 2 ${startYear}`;
  if (startYear === endYear) return `${MONTH_NAMES[startMonth - 1]}-${MONTH_NAMES[endMonth - 1]} ${startYear}`;
  return `${MONTH_NAMES[startMonth - 1]} ${startYear}-${MONTH_NAMES[endMonth - 1]} ${endYear}`;
}

export function formatReportingPeriodTitle(periodStart, periodEnd) {
  buildMonthRange(periodStart, periodEnd);
  const [startYear, startMonth] = periodStart.split('-').map(Number);
  const [endYear, endMonth] = periodEnd.split('-').map(Number);
  if (periodStart === periodEnd) return `${FULL_MONTH_NAMES[startMonth - 1]} ${startYear}`;
  if (startYear === endYear) return `${FULL_MONTH_NAMES[startMonth - 1]} - ${FULL_MONTH_NAMES[endMonth - 1]} ${startYear}`;
  return `${FULL_MONTH_NAMES[startMonth - 1]} ${startYear} - ${FULL_MONTH_NAMES[endMonth - 1]} ${endYear}`;
}

export function getPeriodComparisonLabel(periodStart, periodEnd) {
  return periodStart === periodEnd ? 'MoM' : 'vs periode sebelumnya';
}
