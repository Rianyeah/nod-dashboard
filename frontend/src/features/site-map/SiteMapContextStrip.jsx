import { sectorStatusLabel } from '../../utils/sectorViewport';

function ContextValue({ label, children }) {
  return (
    <div className="min-w-0 px-3 py-1.5 first:pl-0 last:pr-0">
      <dt className="text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="truncate text-[11px] font-semibold text-[var(--text-primary)]">
        {children}
      </dd>
    </div>
  );
}

export default function SiteMapContextStrip({
  total = 0,
  withCoordinates = 0,
  selectedSiteId,
  sectorStatus = { kind: 'off' },
}) {
  return (
    <dl
      aria-label="Konteks spasial Site Map"
      aria-live="polite"
      className="grid grid-cols-2 divide-x divide-y divide-[var(--border)] border-y border-[var(--border-strong)] lg:grid-cols-4 lg:divide-y-0"
    >
      <ContextValue label="Hasil filter">{Number(total || 0).toLocaleString()} site</ContextValue>
      <ContextValue label="Tampil di map">
        {Number(withCoordinates || 0).toLocaleString()} koordinat valid
      </ContextValue>
      <ContextValue label="Site terpilih">{selectedSiteId || 'Belum dipilih'}</ContextValue>
      <ContextValue label="Layer sector">{sectorStatusLabel(sectorStatus)}</ContextValue>
    </dl>
  );
}
