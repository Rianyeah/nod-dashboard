const REVENUE_BAND_PRESENTATION = {
  u30: {
    label: 'U30',
    className: 'border-[var(--danger)]/25 bg-[var(--danger)]/10 text-[var(--danger)]',
  },
  u60: {
    label: 'U60',
    className: 'border-[var(--warning)]/25 bg-[var(--warning)]/10 text-[var(--warning)]',
  },
  achieved: {
    label: 'Achieved',
    className: 'border-[var(--success)]/25 bg-[var(--success)]/10 text-[var(--success)]',
  },
  unavailable: {
    label: 'Unavailable',
    className: 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-muted)]',
  },
};


export function toggleRevenueBand(current, requested) {
  return current === requested ? 'all' : requested;
}


export function revenueBandPresentation(value) {
  return REVENUE_BAND_PRESENTATION[value] || REVENUE_BAND_PRESENTATION.unavailable;
}
