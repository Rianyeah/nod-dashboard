const EARTH_RADIUS_KM = 6371.0088;

function coordinate(value) {
  if (value == null || value === '' || value === '#N/A') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toRadians(value) {
  return value * (Math.PI / 180);
}

function distanceKm(origin, destination) {
  const originLatitude = coordinate(origin?.latitude);
  const originLongitude = coordinate(origin?.longitude);
  const destinationLatitude = coordinate(destination?.latitude);
  const destinationLongitude = coordinate(destination?.longitude);

  if ([originLatitude, originLongitude, destinationLatitude, destinationLongitude]
    .some((value) => value == null)) {
    return null;
  }

  const latitudeDelta = toRadians(destinationLatitude - originLatitude);
  const longitudeDelta = toRadians(destinationLongitude - originLongitude);
  const originRadians = toRadians(originLatitude);
  const destinationRadians = toRadians(destinationLatitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(originRadians) * Math.cos(destinationRadians) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

export function nearbySites(selected, sites, radiusKm = 1, limit = 8) {
  if (distanceKm(selected, selected) == null) return [];

  const selectedSiteId = String(selected?.site_id || '');
  const safeRadius = Math.max(Number(radiusKm) || 0, 0);
  const safeLimit = Math.max(Math.floor(Number(limit) || 0), 0);

  return (Array.isArray(sites) ? sites : [])
    .filter((site) => String(site?.site_id || '') !== selectedSiteId)
    .map((site) => ({ site, distance_km: distanceKm(selected, site) }))
    .filter(({ distance_km }) => distance_km != null && distance_km <= safeRadius)
    .sort((left, right) => {
      const distanceDifference = left.distance_km - right.distance_km;
      if (Math.abs(distanceDifference) > 1e-9) return distanceDifference;
      return String(left.site?.site_id || '').localeCompare(String(right.site?.site_id || ''));
    })
    .slice(0, safeLimit)
    .map(({ site, distance_km }) => ({ ...site, distance_km }));
}
