const SITE_MAP_URL_KEYS = [
  'bulan',
  'tahun',
  'nop',
  'kabupaten',
  'cluster',
  'kelas',
  'q',
  'site',
];

const FILTER_KEYS = ['nop', 'kabupaten', 'cluster', 'kelas', 'q'];
const ALL_FILTER_VALUE = '__all__';


function normalizedText(value, { uppercase = false } = {}) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text === ALL_FILTER_VALUE) return null;
  return uppercase ? text.toUpperCase() : text;
}


function normalizedMonth(value) {
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
}


function normalizedYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2020 ? year : null;
}


export function parseSiteMapSearchParams(params) {
  const source = params instanceof URLSearchParams ? params : new URLSearchParams(params || '');
  const state = {};
  const bulan = normalizedMonth(source.get('bulan'));
  const tahun = normalizedYear(source.get('tahun'));
  if (bulan != null) state.bulan = bulan;
  if (tahun != null) state.tahun = tahun;

  for (const key of ['nop', 'kabupaten', 'cluster', 'kelas', 'q']) {
    const value = normalizedText(source.get(key));
    if (value != null) state[key] = value;
  }
  const site = normalizedText(source.get('site'), { uppercase: true });
  if (site != null) state.site = site;
  return state;
}


export function writeSiteMapSearchParams(params, state = {}) {
  const next = new URLSearchParams(params instanceof URLSearchParams ? params : params || '');
  SITE_MAP_URL_KEYS.forEach((key) => next.delete(key));

  const bulan = normalizedMonth(state.bulan);
  const tahun = normalizedYear(state.tahun);
  if (bulan != null) next.set('bulan', String(bulan));
  if (tahun != null) next.set('tahun', String(tahun));

  for (const key of ['nop', 'kabupaten', 'cluster', 'kelas', 'q']) {
    const value = normalizedText(state[key]);
    if (value != null) next.set(key, value);
  }
  const site = normalizedText(state.site, { uppercase: true });
  if (site != null) next.set('site', site);
  return next;
}


export function normalizeSiteMapFilters(state = {}) {
  return FILTER_KEYS.reduce((filters, key) => {
    const value = normalizedText(state[key]);
    if (value != null) filters[key] = value;
    return filters;
  }, {});
}
