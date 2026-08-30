import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ListFilter } from 'lucide-react';

import SiteTable from '../../components/SiteTable';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../../components/ui/sheet';

function ResultsHandle({ open, total, onClick, controls, ...props }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onClick}
      className="flex h-[42px] w-full items-center justify-between gap-3 px-3 text-left transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]"
      {...props}
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
  );
}

export default function SiteMapResultsDrawer({
  bulan,
  tahun,
  filters,
  q,
  total,
  onSiteSelect,
  onOpenChange,
  open: controlledOpen,
  mobileOpen = false,
  isMobile = false,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [pagination, setPagination] = useState({ scopeKey: null, page: 1 });
  const [sortBy, setSortBy] = useState('site_id');
  const [sortDir, setSortDir] = useState('asc');
  const open = controlledOpen ?? internalOpen;
  const scopeKey = useMemo(
    () => JSON.stringify({ bulan, tahun, filters, q }),
    [bulan, filters, q, tahun],
  );
  const page = pagination.scopeKey === scopeKey ? pagination.page : 1;
  const setPage = (nextPage) => setPagination({ scopeKey, page: nextPage });

  const setDrawerOpen = (nextOpen) => {
    if (controlledOpen == null) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const handleSortChange = (nextSortBy, nextSortDir) => {
    setSortBy(nextSortBy);
    setSortDir(nextSortDir);
    setPage(1);
  };

  const table = open ? (
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
  ) : null;

  return (
    <>
      <section
        aria-label="Hasil site terfilter"
        className={`hidden overflow-hidden rounded-[var(--noc-radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-[var(--shadow-sm)] transition-[max-height] duration-200 lg:block ${open ? 'max-h-[min(46vh,420px)]' : 'max-h-[42px]'}`}
        style={{ minHeight: '42px' }}
      >
        <ResultsHandle
          open={open}
          total={total}
          controls="site-map-results-content"
          onClick={() => setDrawerOpen(!open)}
        />

        <div id="site-map-results-content" hidden={!open} className="h-[min(42vh,378px)] border-t border-[var(--border-strong)] p-2">
          {!isMobile ? table : null}
        </div>
      </section>

      <Sheet open={mobileOpen} onOpenChange={setDrawerOpen}>
        <section
          aria-label="Hasil site terfilter"
          className="min-h-[42px] overflow-hidden rounded-[var(--noc-radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-[var(--shadow-sm)] lg:hidden"
        >
          <SheetTrigger asChild>
            <ResultsHandle open={open} total={total} />
          </SheetTrigger>
        </section>
        <SheetContent side="bottom" className="h-[min(78dvh,620px)] rounded-t-[var(--noc-radius-lg)] p-0 lg:hidden">
          <SheetHeader className="border-b border-[var(--border-strong)] px-4 py-3 pr-12 text-left">
            <SheetTitle>Hasil site terfilter</SheetTitle>
            <SheetDescription>{Number(total || 0).toLocaleString()} site sesuai filter aktif.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 p-2">
            {isMobile ? table : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
