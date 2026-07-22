import { BAND_TO_FREQ_MHZ } from './rfTiltChartConfig.js';

const ANTENNA_SERIES_PATTERN = /\b(AQU|APE|ASI|ADU|ATR)\d*/i;
const SUPPORTED_RF_TILT_FREQUENCIES = [900, 1800, 2100, 2300];
export const STANDARD_VERTICAL_BEAMWIDTH = 6;

const REQUIRED_NUMERIC_INPUTS = [
  ['latitude', 'Latitude', -90, 90],
  ['longitude', 'Longitude', -180, 180],
  ['azimuth', 'Azimuth', 0, 360],
  ['antenna_height', 'Antenna Height', Number.MIN_VALUE, Infinity],
  ['vertical_beamwidth', 'Vertical BW', Number.MIN_VALUE, Infinity],
  ['horizontal_beamwidth', 'Horizontal BW', Number.MIN_VALUE, 360],
  ['max_distance', 'Max Distance', Number.MIN_VALUE, Infinity],
  ['sample_interval', 'Sample Interval', Number.MIN_VALUE, Infinity],
  ['fresnel_clearance_pct', 'Fresnel Clearance Required', Number.MIN_VALUE, 100],
];

export function inferAntennaSeries(antennaType) {
  const match = String(antennaType || '').toUpperCase().match(ANTENNA_SERIES_PATTERN);
  return match?.[1] ?? null;
}

export function formatRfTiltApiError(error) {
  const detail = error?.response?.data?.detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        const field = Array.isArray(item?.loc) ? item.loc.at(-1) : null;
        const message = typeof item?.msg === 'string' ? item.msg : null;
        return field && message ? `${field}: ${message}` : message;
      })
      .filter(Boolean);
    return messages.join(' ') || 'Input analisis tidak valid.';
  }

  if (typeof detail === 'string' && detail.trim()) return detail;
  if (detail && typeof detail === 'object' && typeof detail.message === 'string') return detail.message;
  if (typeof error?.message === 'string' && error.message) return error.message;
  return 'Analisis gagal dijalankan.';
}

export function inferFrequencyFromBand(band) {
  return BAND_TO_FREQ_MHZ[String(band || '').toUpperCase()] ?? null;
}

export function inferFrequencyFromAntennaBands(frequencyBands) {
  if (!frequencyBands) return null;

  const firstRange = String(frequencyBands).split('/')[0].trim();
  const rangeMatch = firstRange.match(/(\d+)\s*-\s*(\d+)/);
  const singleFrequencyMatch = firstRange.match(/(\d+)/);
  let targetFrequency = null;

  if (rangeMatch) {
    const low = Number.parseInt(rangeMatch[1], 10);
    const high = Number.parseInt(rangeMatch[2], 10);
    if (Number.isFinite(low) && Number.isFinite(high)) {
      targetFrequency = (low + high) / 2;
    }
  } else if (singleFrequencyMatch) {
    targetFrequency = Number.parseInt(singleFrequencyMatch[1], 10);
  }

  if (!Number.isFinite(targetFrequency)) return null;

  return SUPPORTED_RF_TILT_FREQUENCIES.reduce((nearest, frequency) => {
    const currentDiff = Math.abs(targetFrequency - frequency);
    const nearestDiff = Math.abs(targetFrequency - nearest);
    return currentDiff < nearestDiff ? frequency : nearest;
  }, SUPPORTED_RF_TILT_FREQUENCIES[0]);
}

function sectorOverlapKey(feature) {
  const properties = feature?.properties || {};
  const center = feature?.geometry?.coordinates?.[0]?.[0] || [];
  return [
    properties.site_id,
    properties.azimuth,
    properties.beamwidth,
    properties.render_radius_m,
    center[0],
    center[1],
  ].join('|');
}

function scalePolygonAroundCenter(coordinates, scale) {
  const [centerLongitude, centerLatitude] = coordinates?.[0]?.[0] || [];
  if (!Number.isFinite(centerLongitude) || !Number.isFinite(centerLatitude)) return coordinates;

  return coordinates.map(ring => ring.map(([longitude, latitude]) => [
    centerLongitude + ((longitude - centerLongitude) * scale),
    centerLatitude + ((latitude - centerLatitude) * scale),
  ]));
}

/**
 * Keeps every installed sector while slightly scaling exact geometry overlaps,
 * so co-located cells remain visible and independently countable on the map.
 */
export function prepareSiteSectorDisplayGeoJson(value) {
  const features = value?.type === 'FeatureCollection' && Array.isArray(value.features)
    ? value.features
    : [];
  const groups = new Map();

  features.forEach((feature) => {
    const key = sectorOverlapKey(feature);
    const group = groups.get(key) || [];
    group.push(feature);
    groups.set(key, group);
  });

  const groupIndexes = new Map();
  return {
    type: 'FeatureCollection',
    features: features.map((feature) => {
      const key = sectorOverlapKey(feature);
      const overlapCount = groups.get(key)?.length || 1;
      const overlapIndex = groupIndexes.get(key) || 0;
      groupIndexes.set(key, overlapIndex + 1);
      const visualScale = overlapCount > 1
        ? 1 + ((overlapIndex - ((overlapCount - 1) / 2)) * 0.045)
        : 1;

      return {
        ...feature,
        properties: {
          ...feature.properties,
          overlap_count: overlapCount,
          overlap_index: overlapIndex,
          visual_scale: visualScale,
        },
        geometry: {
          ...feature.geometry,
          coordinates: scalePolygonAroundCenter(feature?.geometry?.coordinates, visualScale),
        },
      };
    }),
  };
}

function validPositiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function finiteInputNumber(value) {
  if (value == null || value === '' || (typeof value === 'string' && value.trim() === '')) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Resolves safe form defaults from an antenna specification without replacing
 * installed-site data. This stays pure so selection flows can share it.
 */
export function resolveAntennaInputs({
  antennaSpec,
  frequencyMhz,
  siteBeamwidth,
  hasSelectedSite = false,
  electricalTilt,
} = {}) {
  const matched = antennaSpec?.matched === true;
  const verticalBeamwidth = matched
    ? validPositiveNumber(antennaSpec?.vertical_beamwidth_by_band?.[String(frequencyMhz)])
    : null;
  const siteHorizontalBeamwidth = validPositiveNumber(siteBeamwidth);
  const specHorizontalBeamwidth = matched ? validPositiveNumber(antennaSpec?.horizontal_beamwidth) : null;
  const electricalTiltMin = Number(antennaSpec?.electrical_tilt_min);
  const electricalTiltMax = Number(antennaSpec?.electrical_tilt_max);
  const hasTiltRange = matched && Number.isFinite(electricalTiltMin) && Number.isFinite(electricalTiltMax);
  const hasOutOfRangeTilt = hasTiltRange
    && Number.isFinite(Number(electricalTilt))
    && (Number(electricalTilt) < electricalTiltMin || Number(electricalTilt) > electricalTiltMax);

  return {
    verticalBeamwidth: verticalBeamwidth ?? STANDARD_VERTICAL_BEAMWIDTH,
    verticalBeamwidthSource: verticalBeamwidth ? 'Antenna spec' : 'Standard fallback (6°)',
    horizontalBeamwidth: hasSelectedSite && siteHorizontalBeamwidth
      ? siteHorizontalBeamwidth
      : specHorizontalBeamwidth,
    horizontalBeamwidthSource: hasSelectedSite && siteHorizontalBeamwidth
      ? 'Site data'
      : specHorizontalBeamwidth
        ? 'Antenna spec'
        : null,
    electricalTiltRange: hasTiltRange ? { min: electricalTiltMin, max: electricalTiltMax } : null,
    electricalTiltWarning: hasOutOfRangeTilt
      ? `Electrical tilt ${electricalTilt}° is outside the antenna-supported range (${electricalTiltMin}°–${electricalTiltMax}°).`
      : null,
  };
}

export function validateRfTiltInputs(params, targetMode = false) {
  for (const [key, label, min, max] of REQUIRED_NUMERIC_INPUTS) {
    const value = finiteInputNumber(params?.[key]);
    if (value == null || value < min || value > max) {
      return `${label} harus diisi dengan angka yang valid.`;
    }
  }

  if (![900, 1800, 2100, 2300].includes(Number(params?.frequency_mhz))) {
    return 'Frequency harus menggunakan band yang tersedia.';
  }

  if (targetMode) {
    for (const [key, label, min, max] of [
      ['target_latitude', 'Target Latitude', -90, 90],
      ['target_longitude', 'Target Longitude', -180, 180],
      ['target_height', 'Target Height', 0, Infinity],
    ]) {
      const value = finiteInputNumber(params?.[key]);
      if (value == null || value < min || value > max) {
        return `${label} harus diisi dengan angka yang valid untuk mode Point-to-Point.`;
      }
    }
  }

  return null;
}

export function hasValidTiltAnalysisResult(result) {
  return Boolean(
    Array.isArray(result?.terrain_profile)
    && result.terrain_profile.length > 0
    && Array.isArray(result?.main_beam?.profile)
    && Array.isArray(result?.upper_beam?.profile)
    && Array.isArray(result?.lower_beam?.profile),
  );
}
