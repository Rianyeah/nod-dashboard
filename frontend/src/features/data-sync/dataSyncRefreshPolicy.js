export function preserveDateFilter(current, { fallback, min, max }) {
  if (!current) return fallback;
  if (min && current < min) return fallback;
  if (max && current > max) return fallback;
  return current;
}

export function preserveOptionFilter(current, options, fallback) {
  if (current == null || current === '') return current;
  return options.includes(current) ? current : fallback;
}

export function preserveMonthRange(current, fallback, availableMonths) {
  const start = current?.start || '';
  const end = current?.end || '';
  const available = new Set(availableMonths);
  if (start && end && start <= end && available.has(start) && available.has(end)) {
    return current;
  }
  return fallback;
}
