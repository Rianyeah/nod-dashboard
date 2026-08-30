const SITE_ID_PATTERN = /^[A-Z0-9_-]{2,32}$/;

export function normalizedDeepLinkSite(value) {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toUpperCase();
  return SITE_ID_PATTERN.test(normalized) ? normalized : null;
}
