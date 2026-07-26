export function selectSiteFromResults(items, query) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const normalizedQuery = String(query || '').trim().toUpperCase();
  return items.find((item) => (
    String(item?.site_id || '').trim().toUpperCase() === normalizedQuery
  )) || items[0];
}
