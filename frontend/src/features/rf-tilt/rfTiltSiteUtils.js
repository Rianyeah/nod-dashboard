import { BAND_TO_FREQ_MHZ } from './rfTiltChartConfig.js';

const ANTENNA_SERIES_PATTERN = /\b(AQU|APE|ASI|ADU|ATR)\d*/i;
const SUPPORTED_RF_TILT_FREQUENCIES = [900, 1800, 2100, 2300];

export function inferAntennaSeries(antennaType) {
  const match = String(antennaType || '').toUpperCase().match(ANTENNA_SERIES_PATTERN);
  return match?.[1] ?? null;
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
