export const POINT_TYPES = { site: 'Site', tipus: 'Titik putus', sambungan: 'Sambungan', lainnya: 'Lainnya' };
export const INCIDENT_STATUSES = { open: 'Terbuka', working: 'Dalam penanganan', resolved: 'Pulih' };
export const distanceLabel = metres => Number.isFinite(metres)
  ? `${(metres / 1000).toLocaleString('id-ID', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} km` : '—';
export const wibLabel = value => value ? new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta',
}).format(new Date(value)) + ' WIB' : '—';
export const wibInput = instant => instant ? new Date(Date.parse(instant) + 7 * 3600000).toISOString().slice(0, 16) : '';
export const wibInstant = local => local ? new Date(local + ':00+07:00').toISOString() : null;

export function errorText(error) {
  if (error.response?.status === 409) return 'Data di server sudah berubah. Draf Anda masih tersedia. Tinjau versi terbaru sebelum mencoba lagi.';
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(item => `${item.loc?.slice(1).join('.') || 'Data'}: ${item.msg}`).join('; ');
  return error.message || 'Permintaan gagal.';
}

export function parseCoordinates(text) {
  const rows = text.trim().split(/\r?\n/).filter(row => row.trim());
  if (/^label[\t;,]/i.test(rows[0]?.trim())) rows.shift();
  if (rows.length < 2 || rows.length > 100) throw Error('Masukkan 2–100 titik secara berurutan.');
  return rows.map((row, i) => {
    const parts = row.split(row.includes('\t') ? '\t' : row.includes(';') ? ';' : ',').map(part => part.trim());
    const [label, latitude, longitude] = parts;
    const lat = Number(latitude?.replace(',', '.'));
    const lng = Number(longitude?.replace(',', '.'));
    if (parts.length !== 3 || !label || !latitude || !longitude || !validPosition([lng, lat])) {
      throw Error(`Baris ${i + 1}: periksa label, lintang, dan bujur.`);
    }
    return { label, lat, lng };
  });
}

function validPosition(position) {
  return Array.isArray(position) && position.length >= 2 && position.slice(0, 2).every(Number.isFinite)
    && Math.abs(position[0]) <= 180 && Math.abs(position[1]) <= 85;
}

export function readLineString(input) {
  let geometry = input;
  if (input?.type === 'FeatureCollection') {
    const lines = input.features.filter(feature => feature.geometry?.type === 'LineString');
    if (lines.length !== 1) throw Error('Pilih berkas yang berisi satu garis jalur.');
    geometry = lines[0].geometry;
  } else if (input?.type === 'Feature') geometry = input.geometry;
  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)
    || geometry.coordinates.length < 2 || geometry.coordinates.length > 30000
    || !geometry.coordinates.every(validPosition)) throw Error('GeoJSON harus berisi LineString dengan 2–30.000 koordinat valid.');
  return { type: 'LineString', coordinates: geometry.coordinates.map(([lng, lat]) => [lng, lat]) };
}

export function toAnchors(rows, previous = []) {
  const labels = new Map();
  for (const anchor of previous) {
    if (!labels.has(anchor.label)) labels.set(anchor.label, []);
    labels.get(anchor.label).push(anchor);
  }
  return rows.map(row => ({ ...row, id: labels.get(row.label)?.shift()?.id || crypto.randomUUID() }));
}

export function blankRoute() {
  return { name: '', start_site: '', end_site: '', area: '', pic: '', asset_ref: '', reference_distance: '', verification: 'pending',
    source: 'manual', anchors: [], geometry: {type: 'LineString', coordinates: []}, points: [] };
}

// Preserve the exact leg boundary returned by Directions, including on a loop.
export async function calculateRoad(anchors, accessToken, signal, fetchImpl = fetch) {
  if (!accessToken?.startsWith('pk.')) throw Error('Token peta belum tersedia. Gunakan trase manual atau impor GeoJSON.');
  const coordinates = [];
  const vertexIndices = [0];
  for (let start = 0; start < anchors.length - 1; start += 24) {
    const chunk = anchors.slice(start, start + 25);
    const positions = chunk.map(a => `${a.lng},${a.lat}`).join(';');
    const query = new URLSearchParams({ geometries: 'geojson', overview: 'full', steps: 'true', access_token: accessToken });
    const res = await fetchImpl(`https://api.mapbox.com/directions/v5/mapbox/driving/${positions}?${query}`, { signal });
    if (!res.ok) throw Error(`Layanan rute jalan tidak tersedia (${res.status}).`);
    const data = await res.json();
    const legs = data.routes?.[0]?.legs;
    if (data.code !== 'Ok' || legs?.length !== chunk.length - 1) throw Error('Jalur jalan belum ditemukan. Periksa titik belok atau gunakan trase manual.');
    for (const leg of legs) {
      let positionsRead = 0;
      for (const step of leg.steps || []) {
        for (const pos of step.geometry?.coordinates || []) {
          if (!validPosition(pos)) throw Error('Koordinat dari layanan jalan tidak valid.');
          const last = coordinates.at(-1);
          if (!last || last[0] !== pos[0] || last[1] !== pos[1]) coordinates.push(pos.slice(0, 2));
          positionsRead++;
        }
      }
      if (!positionsRead || vertexIndices.at(-1) === coordinates.length - 1) throw Error('Dua titik belok berhimpitan di jalan. Periksa urutannya.');
      vertexIndices.push(coordinates.length - 1);
    }
  }
  return { geometry: readLineString({ type: 'LineString', coordinates }),
    anchors: anchors.map((a, i) => ({...a, vertex_index: vertexIndices[i]})) };
}

export function routePayload(route) {
  const { name,start_site,end_site,area,pic,asset_ref,reference_distance,verification,source,geometry,anchors } = route;
  const points = route.points.filter(p => !p.archived_at).map(p => {
    const { id,label,type,lat,lng,note,from_anchor_id,to_anchor_id,station_m } = p;
    return { id,label,type,lat,lng,note: note || '',from_anchor_id,to_anchor_id,...(Number.isFinite(station_m) ? {station_m} : {}) };
  });
  return { name,start_site,end_site,area,pic,asset_ref,reference_distance,verification,source,geometry,
    anchors: anchors.map(({id,label,lat,lng,vertex_index}) => ({id,label,lat,lng,vertex_index})),
    points,...(route.id ? {expected_revision: route.revision} : {}) };
}

export function prepareReshape(route, anchors, geometry, source) {
  const first = anchors[0], last = anchors.at(-1);
  const sitePoint = (old, anchor) => ({ ...old, id: old?.id || crypto.randomUUID(), label: anchor.label,
    type: 'site', lat: anchor.lat,lng: anchor.lng,note: old?.note || '' });
  const inner = route.points.filter(p => !p.archived_at).slice(1, -1).map(p => ({...p, station_m: undefined}));
  return { ...route, name: route.name || `${first.label} → ${last.label}`,
    start_site: first.label, end_site: last.label, geometry, anchors, source, verification:'pending',
    points: [
      { ...sitePoint(route.points[0], first), from_anchor_id: first.id, to_anchor_id: anchors[1].id, station_m: 0 },
      ...inner,
      { ...sitePoint(route.points.at(-1), last), from_anchor_id: anchors.at(-2).id, to_anchor_id: last.id, station_m: undefined },
    ] };
}
