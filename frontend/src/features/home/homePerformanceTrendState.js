export function resolveHomePerformanceTrendState({ rows, moduleError }) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const message = typeof moduleError === 'string' ? moduleError.trim() : '';

  if (message) {
    return { status: 'error', rows: normalizedRows, message };
  }
  if (normalizedRows.length === 0) {
    return { status: 'empty', rows: [], message: '' };
  }
  return { status: 'ready', rows: normalizedRows, message: '' };
}
