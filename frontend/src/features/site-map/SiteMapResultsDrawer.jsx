import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, ListFilter } from 'lucide-react';

import SiteTable from '../../components/SiteTable';

export default function SiteMapResultsDrawer({
  bulan,
  tahun,
  filters,
  q,
  total,
  onSiteSelect,
  onOpenChange,
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('site_id');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    setPage(1);
  }, [filters, q, bulan, tahun]);

  const setDrawerOpen = (nextOpen) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const handleSortChange = (nextSortBy, nextSortDir) => {
    setSortBy(nextSortBy);
    setSortDir(nextSortDir);
    setPage(1);
  };

  return (
    <section
      aria-label="Hasil site terfilter"
      className={`overflow-hidden rounded-[var(--noc-radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-[var(--shadow-sm)] transition-[max-height] duration-200 ${open ? 'max-h-[min(46vh,420px)]' : 'max-h-[42px]'}`}
      style={{ minHeight: '42px' }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="site-map-results-content"
        onClick={() => setDrawerOpen(!open)}
        className="flex h-[42px] w-full items-center justify-between gap-3 px-3 text-left transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ListFilter className="h-4 w-4 text-[var(--text-muted)]" />
          <span className="text-[11px] font-semibold text-[var(--text-secondary)]">Hasil terfilter</span>
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            {Number(total || 0).toLocaleString()} site
          </span>
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>

      <div id="site-map-results-content" hidden={!open} className="h-[min(42vh,378px)] border-t border-[var(--border-strong)] p-2">
        <SiteTable
          bulan={bulan}
          tahun={tahun}
          filters={filters}
          q={q}
          page={page}
          onPageChange={setPage}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
          onSiteSelect={onSiteSelect}
          siteCount={total}
        />
      </div>
    </section>
  );
}
