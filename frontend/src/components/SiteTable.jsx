import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';

import { fetchSites } from '../services/api';
import StatusBadge from './ui/StatusBadge';
import { Button } from './ui/button';
import { formatAvailability, formatOutage } from '../utils/mapColors';
import { DashboardPagination } from './dashboard-filters/DashboardFilters';

const EMPTY_RESULT = { data: [], total: 0, page: 1, limit: 15, total_pages: 0 };

const COLUMNS = [
  { key: 'site_id', label: 'Site ID', width: 'w-24' },
  { key: 'site_name', label: 'Nama Site', width: 'w-48' },
  { key: 'kabupaten', label: 'Kabupaten', width: 'w-32' },
  { key: 'site_class', label: 'Class', width: 'w-20' },
  { key: 'jumlah_cell', label: 'Cell', width: 'w-16' },
  { key: 'avg_availability', label: 'Avail %', width: 'w-24' },
  { key: 'total_outage_menit', label: 'Outage', width: 'w-24' },
  { key: 'rca_dominan', label: 'RCA Dominan', width: 'w-32' },
  { key: 'status_site', label: 'Status', width: 'w-24' },
];

export default function SiteTable({
  bulan,
  tahun,
  filters = {},
  q = '',
  page: controlledPage,
  onPageChange,
  sortBy: controlledSortBy,
  sortDir: controlledSortDir,
  onSortChange,
  onSiteSelect,
  siteCount,
  toolbar,
}) {
  const [internalPage, setInternalPage] = useState(1);
  const [internalSortBy, setInternalSortBy] = useState('site_id');
  const [internalSortDir, setInternalSortDir] = useState('asc');
  const [data, setData] = useState(EMPTY_RESULT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requestKey, setRequestKey] = useState(0);
  const page = controlledPage ?? internalPage;
  const sortBy = controlledSortBy ?? internalSortBy;
  const sortDir = controlledSortDir ?? internalSortDir;

  useEffect(() => {
    const controller = new AbortController();

    if (!bulan || !tahun) {
      Promise.resolve().then(() => {
        if (controller.signal.aborted) return;
        setData(EMPTY_RESULT);
        setError(null);
        setLoading(false);
      });
      return () => controller.abort();
    }

    setLoading(true);
    setError(null);
    fetchSites({
      bulan,
      tahun,
      page,
      limit: 15,
      q: q.trim() || undefined,
      sortBy,
      sortDir,
      signal: controller.signal,
      ...filters,
    })
      .then((nextData) => {
        if (!controller.signal.aborted) setData(nextData);
      })
      .catch((nextError) => {
        if (controller.signal.aborted || nextError?.code === 'ERR_CANCELED') return;
        setError(nextError?.message || 'Daftar site gagal dimuat.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [bulan, tahun, page, filters, q, sortBy, sortDir, requestKey]);

  const toggleSort = (column) => {
    const nextDirection = sortBy === column && sortDir === 'asc' ? 'desc' : 'asc';
    if (onSortChange) {
      onSortChange(column, nextDirection);
      return;
    }
    setInternalSortBy(column);
    setInternalSortDir(nextDirection);
    setInternalPage(1);
  };

  const handlePageChange = (nextPage) => {
    if (onPageChange) onPageChange(nextPage);
    else setInternalPage(nextPage);
  };

  return (
    <div className="glass-card animate-fade-in flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[var(--border-strong)] px-3 py-2">
        <div className="flex min-w-0 items-baseline gap-3">
          <h3 className="shrink-0 text-[11px] font-semibold text-[var(--text-secondary)]">Daftar Site</h3>
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            {(siteCount ?? data.total ?? 0).toLocaleString()} site
          </span>
        </div>
        {toolbar ? <div className="ml-auto">{toolbar}</div> : null}
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[var(--table-header-bg)]">
              {COLUMNS.map((column) => {
                const active = sortBy === column.key;
                return (
                  <th
                    key={column.key}
                    aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`${column.width} px-3 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className="flex min-h-8 w-full items-center gap-1 text-left transition-colors hover:text-[var(--primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                    >
                      {column.label}
                      {active ? (
                        <span aria-hidden="true" className="text-[var(--primary-light)]">
                          {sortDir === 'asc' ? '↑' : '↓'}
                        </span>
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {loading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <tr key={index}>
                  <td colSpan={9} className="px-3 py-1.5"><div className="skeleton h-3 rounded" /></td>
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center">
                  <p role="alert" className="text-[11px] text-[var(--status-danger)]">{error}</p>
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setRequestKey((key) => key + 1)}>
                    <RotateCcw data-icon="inline-start" /> Coba lagi
                  </Button>
                </td>
              </tr>
            ) : data.data?.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-[var(--text-muted)]">
                  Tidak ada site yang cocok dengan filter.
                </td>
              </tr>
            ) : (
              data.data.map((site) => (
                <tr
                  key={site.site_id}
                  onClick={() => onSiteSelect?.(site)}
                  className="dashboard-table-row group cursor-pointer transition-colors"
                >
                  <td className="px-3 py-1.5 font-mono font-semibold text-[var(--primary-light)] group-hover:text-[var(--primary)]">{site.site_id}</td>
                  <td className="max-w-[220px] truncate px-3 py-1.5 text-[var(--text-secondary)]">{site.site_name || '-'}</td>
                  <td className="px-3 py-1.5 text-[var(--text-secondary)]">{site.kabupaten || '-'}</td>
                  <td className="px-3 py-1.5 text-[var(--text-secondary)]">{site.site_class || '-'}</td>
                  <td className="px-3 py-1.5 text-[var(--text-secondary)]">{site.jumlah_cell || '-'}</td>
                  <td className="px-3 py-1.5 font-mono font-semibold">{formatAvailability(site.avg_availability)}</td>
                  <td className="px-3 py-1.5 font-mono text-[var(--text-muted)]">{formatOutage(site.total_outage_menit)}</td>
                  <td className="max-w-[140px] truncate px-3 py-1.5 text-[var(--text-secondary)]" title={site.rca_dominan}>{site.rca_dominan || '-'}</td>
                  <td className="px-3 py-1.5"><StatusBadge availability={site.avg_availability} statusSite={site.status_site} size="xs" /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <DashboardPagination
        page={data.page || page}
        totalPages={data.total_pages || 1}
        onPageChange={handlePageChange}
        disabled={loading || Boolean(error)}
        className="border-t border-[var(--border-strong)] px-3 py-1.5"
        testIdPrefix="site"
      />
    </div>
  );
}
