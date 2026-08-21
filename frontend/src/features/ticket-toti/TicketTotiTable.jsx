import { ListChecks, RefreshCcw } from 'lucide-react';

import {
  DashboardPagination,
  DashboardSearchInput,
  DashboardTableToolbar,
} from '@/components/dashboard-filters/DashboardFilters';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DashboardTableShell } from '@/components/ui/DashboardPrimitives';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/utils/formatters';

import { displayText, formatDuration } from './ticketTotiUtils';

const HEADERS = [
  'Site ID',
  'Site Name',
  'Nomor Ticket',
  'Kategori',
  'Sub Kategori',
  'Permasalahan',
  'Kondisi Site',
  'Durasi',
];

function TruncatedCell({ value, className = '' }) {
  const label = displayText(value);
  return <span title={label} className={`block max-w-[220px] truncate ${className}`}>{label}</span>;
}

export default function TicketTotiTable({
  tickets,
  loading,
  error,
  search,
  onSearchChange,
  onPageChange,
  onRetry,
}) {
  const items = tickets?.items || [];
  const totalPages = tickets?.total_pages || 0;

  return (
    <DashboardTableShell
      title="Daftar Ticket TOTI"
      description="15 ticket per halaman • urutan request terbaru"
      icon={ListChecks}
      count={`${formatNumber(tickets?.total || 0)} ticket`}
    >
      <div className="space-y-3 border-b border-[var(--border)] px-4 py-3">
        <DashboardTableToolbar
          actions={error ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCcw data-icon="inline-start" /> Coba lagi
            </Button>
          ) : null}
        >
          <DashboardSearchInput
            id="ticket-toti-search"
            value={search}
            onChange={onSearchChange}
            placeholder="Cari nomor ticket, site, atau permasalahan"
            aria-label="Cari Ticket TOTI"
            className="w-full sm:max-w-[360px]"
          />
        </DashboardTableToolbar>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Tabel tidak dapat diperbarui</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[1120px] table-fixed text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--bg-elevated)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            <tr className="border-b border-[var(--border)]">
              {HEADERS.map((header, index) => (
                <th
                  key={header}
                  className={`px-3 py-2 font-semibold ${index === 7 ? 'w-[96px]' : index < 3 ? 'w-[130px]' : ''}`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {loading && !items.length ? (
              Array.from({ length: 8 }, (_, index) => (
                <tr key={index}>
                  <td colSpan={HEADERS.length} className="px-3 py-2">
                    <Skeleton className="h-7 w-full" />
                  </td>
                </tr>
              ))
            ) : items.length ? (
              items.map((row) => {
                const durationLabel = row.closed_at
                  ? formatDuration(row.duration_seconds)
                  : 'Belum close';
                return (
                  <tr key={row.id} className="transition-colors hover:bg-[var(--surface-soft)]/70">
                    <td className="px-3 py-2 font-mono font-semibold text-[var(--primary-light)]"><TruncatedCell value={row.siteid} /></td>
                    <td className="px-3 py-2"><TruncatedCell value={row.sitename} /></td>
                    <td className="px-3 py-2 font-mono tabular-nums"><TruncatedCell value={row.id} /></td>
                    <td className="px-3 py-2"><TruncatedCell value={row.kategori} /></td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]"><TruncatedCell value={row.sub_kategori} /></td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]"><TruncatedCell value={row.permasalahan} /></td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]"><TruncatedCell value={row.kondisi_site} /></td>
                    <td className="px-3 py-2 font-mono tabular-nums text-[var(--text-secondary)]" title={durationLabel}>{durationLabel}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={HEADERS.length} className="px-4 py-12 text-center text-sm text-[var(--text-muted)]">
                  Tidak ada Ticket TOTI pada periode ini
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <DashboardPagination
        className="border-t border-[var(--border)] px-4 py-3"
        page={tickets?.page || 1}
        totalPages={totalPages || 1}
        onPageChange={onPageChange}
        disabled={loading}
        testIdPrefix="ticket-toti"
      />
    </DashboardTableShell>
  );
}
