export const SECTOR_MIN_ZOOM = 9;
export const SECTOR_MEDIUM_ZOOM = 12;
export const SECTOR_FULL_ZOOM = 14;
export const SECTOR_MAX_ZOOM = 24;


export function sectorLodForZoom(zoom) {
  if (typeof zoom !== 'number' || !Number.isFinite(zoom) || zoom < 0 || zoom > SECTOR_MAX_ZOOM) {
    throw new RangeError('zoom must be a finite number between 0 and 24');
  }
  if (zoom < SECTOR_MIN_ZOOM) return 'none';
  if (zoom < SECTOR_MEDIUM_ZOOM) return 'lite';
  if (zoom < SECTOR_FULL_ZOOM) return 'medium';
  return 'full';
}


function finiteCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value);
}


export function buildSectorViewportDescriptor(map, nop) {
  if (!map || typeof map.getBounds !== 'function' || typeof map.getZoom !== 'function') {
    throw new TypeError('map with getBounds() and getZoom() is required');
  }

  const bounds = map.getBounds();
  const west = bounds?.getWest?.();
  const south = bounds?.getSouth?.();
  const east = bounds?.getEast?.();
  const north = bounds?.getNorth?.();
  if (![west, south, east, north].every(finiteCoordinate) || west >= east || south >= north) {
    throw new RangeError('map bounds must be finite and satisfy west < east and south < north');
  }

  const rawZoom = map.getZoom();
  const lod = sectorLodForZoom(rawZoom);
  const zoom = Number(rawZoom.toFixed(2));
  const bbox = [west, south, east, north]
    .map(value => value.toFixed(6))
    .join(',');
  const normalizedNop = typeof nop === 'string' && nop.trim() ? nop.trim() : null;

  return {
    bbox,
    zoom,
    lod,
    nop: normalizedNop,
    key: `${bbox}|${zoom.toFixed(2)}|${normalizedNop || ''}`,
  };
}


export function sectorStatusLabel(status = {}) {
  switch (status.kind) {
    case 'off':
      return 'Sectors Off';
    case 'zoom-required':
      return 'Zoom in for sectors';
    case 'loading':
      return 'Loading sectors…';
    case 'ready': {
      const count = Number.isFinite(Number(status.count))
        ? Math.max(0, Math.trunc(Number(status.count)))
        : 0;
      const lod = typeof status.lod === 'string' && status.lod
        ? `${status.lod.charAt(0).toUpperCase()}${status.lod.slice(1)}`
        : 'Unknown';
      return `${count} sectors · ${lod}`;
    }
    case 'limit':
      return 'Area too wide — zoom in';
    case 'error':
    default:
      return 'Sector layer unavailable';
  }
}


export function shouldShowSectorBandLegend(status = {}, selectedFeatureCount = 0) {
  if (status.kind === 'off') return false;
  return Number(selectedFeatureCount) > 0
    || (status.kind === 'ready' && status.lod === 'full');
}
