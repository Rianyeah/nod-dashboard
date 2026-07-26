export function selectSiteFromResults(items, query) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const normalizedQuery = String(query || '').trim().toUpperCase();
  return items.find((item) => (
    String(item?.site_id || '').trim().toUpperCase() === normalizedQuery
  )) || items[0];
}

export function canSelectCurrentSiteResult(query, resultsQuery, loading) {
  const normalizedQuery = String(query || '').trim().toUpperCase();
  const normalizedResultsQuery = String(resultsQuery || '').trim().toUpperCase();
  return !loading && normalizedQuery.length >= 2 && normalizedQuery === normalizedResultsQuery;
}
