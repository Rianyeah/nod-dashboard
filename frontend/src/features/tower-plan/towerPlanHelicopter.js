const SINGLE_RING_RADIUS = 62;
const OUTER_RING_RADIUS = 72;
const INNER_RING_RADIUS = 42;

export function buildElevationRings(antennas = []) {
  const heights = [...new Set(
    antennas
      .map((antenna) => Number(antenna.height))
      .filter(Number.isFinite),
  )].sort((left, right) => right - left);

  if (heights.length === 1) {
    return [{ height: heights[0], radius: SINGLE_RING_RADIUS }];
  }

  return heights.map((height, index) => ({
    height,
    radius: OUTER_RING_RADIUS
      - ((OUTER_RING_RADIUS - INNER_RING_RADIUS) * index) / (heights.length - 1),
  }));
}

export function radiusForHeight(rings, height) {
  return rings.find((ring) => ring.height === Number(height))?.radius
    ?? SINGLE_RING_RADIUS;
}
