const SITE_ID_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;

export class CaptureRouteError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CaptureRouteError';
  }
}

export function normalizeCaptureSiteId(siteId) {
  const normalized = String(siteId ?? '').trim().toUpperCase();

  if (!SITE_ID_PATTERN.test(normalized)) {
    throw new CaptureRouteError('Invalid Site ID');
  }

  return normalized;
}

export function consumeFragmentToken(location = window.location, history = window.history) {
  const tokenValues = new URLSearchParams(location.hash.replace(/^#/, '')).getAll('token');
  const cleanUrl = `${location.pathname}${location.search}`;

  history.replaceState(null, '', cleanUrl);

  if (tokenValues.length !== 1 || !tokenValues[0]) {
    throw new CaptureRouteError('Capture token is missing or invalid');
  }

  return tokenValues[0];
}

export function validateCaptureBundleSite(expectedSiteId, bundle) {
  const expected = normalizeCaptureSiteId(expectedSiteId);
  const bundleSiteId = normalizeCaptureSiteId(bundle?.site_id);
  const detailSiteId = normalizeCaptureSiteId(bundle?.detail?.Siteid ?? bundle?.detail?.site_id);

  if (bundleSiteId !== expected || detailSiteId !== expected) {
    throw new CaptureRouteError('Site ID mismatch');
  }

  return bundle;
}
