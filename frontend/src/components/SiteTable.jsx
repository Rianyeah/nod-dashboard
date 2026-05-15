import { useState, useEffect } from 'react';
import { Search, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import { fetchSites } from '../services/api';
import StatusBadge from './ui/StatusBadge';
import { formatAvailability, formatOutage } from '../utils/mapColors';

export default function SiteTable({ bulan, tahun, filters, onSiteSelect }) {
  const [data, setData] = useState({ data: [], total: 0, page: 1, limit: 15, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    setLoading(true);
    fetchSites({ bulan, tahun, page, limit: 15, ...filters })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [bulan, tahun, page, filters]);

  const filtered = data.data?.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.site_id?.toLowerCase().includes(q) || s.site_name?.toLowerCase().includes(q);
  }) || [];

  const sorted = [...filtered].sort((a, b) => {
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
    { key: 'site_id', label: 'Site ID', w: 'w-28' },
    { key: 'site_name', label: 'Nama Site', w: 'w-48' },
    { key: 'kabupaten', label: 'Kabupaten', w: 'w-36' },
    { key: 'site_class', label: 'Class', w: 'w-20' },
    { key: 'avg_availability', label: 'Avail %', w: 'w-24' },
    { key: 'total_outage_menit', label: 'Outage', w: 'w-28' },
    { key: 'status_site', label: 'Status', w: 'w-24' },
  ];

  return (
    <div className="glass-card animate-fade-in flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-3">
        <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-widest shrink-0">Daftar Site</h3>
        <div className="relative flex-1 max-w-xs ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
          <input
            id="site-search"
            type="text"
            placeholder="Cari site ID atau nama..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white/[0.04] border border-white/[0.08] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]/40 focus:border-[var(--primary)]/30 transition-all"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[var(--bg-surface)]">
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={`${col.w} px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider cursor-pointer hover:text-[var(--primary-light)] select-none transition-colors`}
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
          <tbody className="divide-y divide-white/[0.04]">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-2.5"><div className="skeleton h-4 rounded" /></td></tr>
              ))
            ) : sorted.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">Tidak ada data</td></tr>
            ) : (
              sorted.map(site => (
                <tr
                  key={site.site_id}
                  onClick={() => onSiteSelect?.(site.site_id)}
                  className="hover:bg-white/[0.03] cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-2.5 font-semibold font-mono text-[var(--primary-light)] group-hover:text-[var(--primary)]">{site.site_id}</td>
                  <td className="px-4 py-2.5 truncate max-w-[200px] text-[var(--text-secondary)]">{site.site_name || '-'}</td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{site.kabupaten || '-'}</td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{site.site_class || '-'}</td>
                  <td className="px-4 py-2.5 font-semibold font-mono">{formatAvailability(site.avg_availability)}</td>
                  <td className="px-4 py-2.5 text-[var(--text-muted)] font-mono">{formatOutage(site.total_outage_menit)}</td>
                  <td className="px-4 py-2.5"><StatusBadge availability={site.avg_availability} statusSite={site.status_site} size="xs" /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-4 py-2.5 border-t border-white/[0.06] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
        <span className="font-mono">Page {data.page}/{data.total_pages || 1} · {data.total} sites</span>
        <div className="flex gap-1">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] disabled:opacity-20 transition-colors cursor-pointer disabled:cursor-default"><ChevronLeft className="w-3.5 h-3.5" /></button>
          <button onClick={() => setPage(p => p+1)} disabled={page >= (data.total_pages||1)}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] disabled:opacity-20 transition-colors cursor-pointer disabled:cursor-default"><ChevronRight className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    </div>
  );
}
