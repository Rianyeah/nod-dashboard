import { Link } from 'react-router-dom';
import { AlertTriangle, ExternalLink, LocateFixed, MapPin, X } from 'lucide-react';

import StatusBadge from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../components/ui/sheet';
import { formatAvailability, formatOutage } from '../../utils/mapColors';

function DataItem({ label, value, mono = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className={`mt-0.5 truncate text-[11px] text-[var(--text-secondary)] ${mono ? 'font-mono' : ''}`}>
        {value || '-'}
      </dd>
    </div>
  );
}

function InspectorContent({
  site,
  nearby,
  outsideFilters,
  loading,
  error,
  onClearSelection,
  onClearFilters,
  onOpenDetail,
  onSelectNearby,
}) {
  if (loading && !site) {
    return (
      <div className="space-y-2 p-4" aria-label="Memuat site terpilih">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="skeleton h-8 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error && !site) {
    return (
      <div className="flex flex-1 flex-col items-start justify-center gap-3 p-5">
        <AlertTriangle className="h-5 w-5 text-[var(--status-warning)]" />
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Site tidak dapat dibuka</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{error}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onClearSelection}>
          Hapus pilihan site
        </Button>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="flex flex-1 flex-col items-start justify-center p-5">
        <LocateFixed className="h-5 w-5 text-[var(--text-muted)]" />
        <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">Pilih site pada map</p>
        <p className="mt-1 max-w-[30ch] text-xs leading-5 text-[var(--text-muted)]">
          Klik marker atau baris hasil untuk melihat konteks site dan site terdekat.
        </p>
      </div>
    );
  }

  const encodedSite = encodeURIComponent(site.site_id);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-[var(--border)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[var(--primary-light)]">
              <MapPin className="h-3.5 w-3.5" />
              <span className="font-mono text-xs font-semibold">{site.site_id}</span>
            </div>
            <h2 className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">
              {site.site_name || 'Nama site belum tersedia'}
            </h2>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClearSelection} aria-label="Tutup inspector site">
            <X />
          </Button>
        </div>

        <div className="mt-3">
          <StatusBadge availability={site.avg_availability} statusSite={site.status_site} size="xs" />
        </div>
      </div>

      {outsideFilters ? (
        <div className="m-4 mb-0 rounded-lg border border-[var(--status-warning)]/35 bg-[var(--status-warning)]/8 p-3">
          <p className="text-xs font-semibold text-[var(--text-primary)]">Site di luar filter aktif</p>
          <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">
            Detail tetap ditampilkan, tetapi site ini tidak masuk dalam hitungan hasil.
          </p>
          <Button type="button" variant="ghost" size="xs" className="mt-2" onClick={onClearFilters}>
            Bersihkan filter
          </Button>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">
        <DataItem label="NOP" value={site.nop} />
        <DataItem label="Kabupaten" value={site.kabupaten} />
        <DataItem label="Cluster" value={site.cluster} />
        <DataItem label="Kelas" value={site.site_class} />
        <DataItem label="Availability" value={formatAvailability(site.avg_availability)} mono />
        <DataItem label="Outage" value={formatOutage(site.total_outage_menit)} mono />
        <DataItem label="Jumlah cell" value={site.jumlah_cell} mono />
        <DataItem label="RCA dominan" value={site.rca_dominan} />
      </dl>

      <div className="border-t border-[var(--border)] px-4 py-3">
        <h3 className="text-[10px] font-semibold text-[var(--text-muted)]">Site dalam radius 1 km</h3>
        {nearby?.length ? (
          <div className="mt-2 grid gap-1">
            {nearby.map((neighbor) => (
              <button
                key={neighbor.site_id}
                type="button"
                onClick={() => onSelectNearby?.(neighbor)}
                className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-2 text-left transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[11px] font-semibold text-[var(--text-secondary)]">
                    {neighbor.site_id}
                  </span>
                  <span className="block truncate text-[10px] text-[var(--text-muted)]">
                    {neighbor.site_name || neighbor.kabupaten || '-'}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
                  {Number(neighbor.distance_km).toFixed(2)} km
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">Tidak ada site hasil lain dalam radius 1 km.</p>
        )}
      </div>

      <div className="mt-auto grid gap-1.5 border-t border-[var(--border-strong)] p-4">
        <Button type="button" size="sm" onClick={() => onOpenDetail?.(site.site_id)}>
          Full Site Detail
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to={`/data-potensi?site=${encodedSite}`}>
            Buka di Data Potensi <ExternalLink data-icon="inline-end" />
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to={`/rf-tilt-analysis?site=${encodedSite}`}>
            Analisis RF Tilt <ExternalLink data-icon="inline-end" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default function SiteMapInspector({ mobileOpen, onMobileOpenChange, ...contentProps }) {
  return (
    <>
      <aside
        aria-label="Inspector site terpilih"
        className="hidden min-h-0 overflow-hidden rounded-[var(--noc-radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-[var(--shadow-sm)] lg:flex lg:flex-col"
      >
        <InspectorContent {...contentProps} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="bottom" className="max-h-[82dvh] rounded-t-[var(--noc-radius-lg)] p-0 lg:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Inspector site</SheetTitle>
            <SheetDescription>Detail dan aksi untuk site terpilih.</SheetDescription>
          </SheetHeader>
          <InspectorContent {...contentProps} />
        </SheetContent>
      </Sheet>
    </>
  );
}
