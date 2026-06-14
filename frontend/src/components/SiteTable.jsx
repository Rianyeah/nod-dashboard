import { useState, useEffect } from 'react';
import { fetchSites } from '../services/api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import StatusBadge from './ui/StatusBadge';
import { formatAvailability, formatOutage } from '../utils/mapColors';
import {
  DashboardPagination,
  DashboardSearchInput,
  DashboardTableToolbar,
} from './dashboard-filters/DashboardFilters';

export default function SiteTable({ bulan, tahun, filters, onSiteSelect, siteCount, toolbar }) {
  const [data, setData] = useState({ data: [], total: 0, page: 1, limit: 15, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const searchTerm = search.trim();
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  useEffect(() => {
    let cancelled = false;

    if (!bulan || !tahun) {
      Promise.resolve().then(() => {
        if (cancelled) return;
        setData({ data: [], total: 0, page: 1, limit: 15, total_pages: 0 });
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    Promise.resolve()
      .then(() => {
        if (!cancelled) setLoading(true);
        return fetchSites({ bulan, tahun, page, limit: 15, q: debouncedSearchTerm || undefined, ...filters });
      })
      .then((nextData) => {
        if (!cancelled) setData(nextData);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bulan, tahun, page, filters, debouncedSearchTerm]);

  const handleSearchChange = (value) => {
    setSearch(value);
    setPage(1);
  };

  const sorted = [...(data.data || [])].sort((a, b) => {
    if (!sortCol) return 0;
    const va = a[sortCol]; const vb = b[sortCol];
    if (va == null && vb == null) return 0;
    if (va == null) return 1; if (vb == null) return -1;
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const columns = [
    { key: 'site_id', label: 'Site ID', w: 'w-24' },
    { key: 'site_name', label: 'Nama Site', w: 'w-48' },
    { key: 'kabupaten', label: 'Kabupaten', w: 'w-32' },
    { key: 'site_class', label: 'Class', w: 'w-20' },
    { key: 'jumlah_cell', label: 'Cell', w: 'w-16' },
    { key: 'avg_availability', label: 'Avail %', w: 'w-24' },
    { key: 'total_outage_menit', label: 'Outage', w: 'w-24' },
    { key: 'rca_dominan', label: 'RCA Dominan', w: 'w-32' },
    { key: 'status_site', label: 'Status', w: 'w-24' },
  ];

  return (
    <div className="glass-card animate-fade-in flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2">
        <div className="min-w-0 flex items-baseline gap-3">
          <h3 className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-widest shrink-0">Daftar Site</h3>
          <span className="text-[10px] font-mono text-[var(--text-muted)]">
            {(siteCount ?? data.total ?? 0).toLocaleString()} sites
          </span>
        </div>
        <DashboardTableToolbar className="ml-auto min-w-0 flex-1 justify-end">
          <DashboardSearchInput
            id="site-search"
            placeholder="Cari site ID, nama, kabupaten..."
            value={search}
            onChange={handleSearchChange}
            className="max-w-[320px]"
          />
          {toolbar}
        </DashboardTableToolbar>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[var(--bg-surface)]">
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={`${col.w} px-3 py-1.5 text-left text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-wider cursor-pointer hover:text-[var(--primary-light)] select-none transition-colors`}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {sortCol === col.key && (
                      <span className="text-[var(--primary-light)]">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}><td colSpan={9} className="px-3 py-1.5"><div className="skeleton h-3 rounded" /></td></tr>
              ))
            ) : sorted.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-[var(--text-muted)]">Tidak ada data</td></tr>
            ) : (
              sorted.map(site => (
                <tr
                  key={site.site_id}
                  onClick={() => onSiteSelect?.(site)}
                  className="dashboard-table-row cursor-pointer transition-colors group"
                >
                  <td className="px-3 py-1.5 font-semibold font-mono text-[var(--primary-light)] group-hover:text-[var(--primary)]">{site.site_id}</td>
                  <td className="px-3 py-1.5 truncate max-w-[220px] text-[var(--text-secondary)]">{site.site_name || '-'}</td>
                  <td className="px-3 py-1.5 text-[var(--text-secondary)]">{site.kabupaten || '-'}</td>
                  <td className="px-3 py-1.5 text-[var(--text-secondary)]">{site.site_class || '-'}</td>
                  <td className="px-3 py-1.5 text-[var(--text-secondary)]">{site.jumlah_cell || '-'}</td>
                  <td className="px-3 py-1.5 font-semibold font-mono">{formatAvailability(site.avg_availability)}</td>
                  <td className="px-3 py-1.5 text-[var(--text-muted)] font-mono">{formatOutage(site.total_outage_menit)}</td>
                  <td className="px-3 py-1.5 text-[var(--text-secondary)] truncate max-w-[140px]" title={site.rca_dominan}>{site.rca_dominan || '-'}</td>
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
        onPageChange={setPage}
        disabled={loading}
        className="border-t border-[var(--border)] px-3 py-1.5"
        testIdPrefix="site"
      />
    </div>
  );
}
