import { useEffect, useRef, useState } from 'react';
import { Database, LoaderCircle, Search, TowerControl } from 'lucide-react';

import { searchTowerPlanSites } from '../../services/api';
import { Input } from '../../components/ui/input';
import { canSelectCurrentSiteResult, selectSiteFromResults } from './towerPlanSiteSelection';

export default function TowerPlanSitePicker({ disabled, onSelect }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [resultsQuery, setResultsQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const firstResultRef = useRef(null);
  const pendingSelectionRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const normalized = query.trim();
    const requestId = requestIdRef.current;
    if (normalized.length < 2) {
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await searchTowerPlanSites(normalized, controller.signal);
        if (requestId !== requestIdRef.current) return;
        const nextItems = response.items || [];
        setItems(nextItems);
        setResultsQuery(normalized);
        setOpen(true);
        if (pendingSelectionRef.current) {
          pendingSelectionRef.current = false;
          const selected = selectSiteFromResults(nextItems, normalized);
          if (selected) {
            setQuery(selected.site_id);
            setOpen(false);
            onSelect(selected.site_id);
          }
        }
      } catch (requestError) {
        if (requestId !== requestIdRef.current) return;
        pendingSelectionRef.current = false;
        if (requestError.name !== 'CanceledError' && requestError.name !== 'AbortError') {
          setItems([]);
          setError('Pencarian Site ID gagal. Mode manual tetap dapat digunakan.');
          setOpen(true);
        }
      } finally {
        if (!controller.signal.aborted && requestId === requestIdRef.current) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [onSelect, query]);

  const chooseSite = (siteId) => {
    setQuery(siteId);
    setOpen(false);
    onSelect(siteId);
  };

  const hasCurrentResults = canSelectCurrentSiteResult(query, resultsQuery, loading);
  const visibleItems = hasCurrentResults ? items : [];

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-autocomplete="list"
          aria-busy={loading}
          aria-controls="tower-plan-site-results"
          aria-expanded={open}
          aria-label="Cari Site ID untuk auto-fill"
          autoComplete="off"
          className="pl-9 pr-9"
          disabled={disabled}
          enterKeyHint="go"
          inputMode="search"
          onChange={(event) => {
            const nextQuery = event.target.value;
            requestIdRef.current += 1;
            pendingSelectionRef.current = false;
            setQuery(nextQuery);
            setItems([]);
            setResultsQuery('');
            setError('');
            setLoading(nextQuery.trim().length >= 2);
            setOpen(true);
          }}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && open) {
              event.preventDefault();
              if (hasCurrentResults) {
                const selected = selectSiteFromResults(items, query);
                if (selected) chooseSite(selected.site_id);
              } else if (loading && query.trim().length >= 2) {
                pendingSelectionRef.current = true;
              }
            }
            if (event.key === 'ArrowDown' && open) {
              event.preventDefault();
              firstResultRef.current?.focus();
            }
            if (event.key === 'Escape') setOpen(false);
          }}
          placeholder="Ketik minimal 2 karakter Site ID..."
          role="combobox"
          value={query}
        />
        {loading && (
          <LoaderCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary" />
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div
          id="tower-plan-site-results"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
          role="listbox"
          aria-busy={loading}
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Database className="size-3.5" />
            Sumber: ransys_gabungan
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5">
            {loading && (
              <p className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                <LoaderCircle className="size-3.5 animate-spin text-primary" />
                Mencari Site ID...
              </p>
            )}
            {error && <p className="px-3 py-4 text-xs text-destructive">{error}</p>}
            {!loading && !error && visibleItems.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                Site ID tidak ditemukan.
              </p>
            )}
            {visibleItems.map((item, index) => (
              <button
                key={item.site_id}
                ref={index === 0 ? firstResultRef : null}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                onClick={() => chooseSite(item.site_id)}
                role="option"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <TowerControl className="size-4 shrink-0 text-primary" />
                  <span className="truncate font-semibold text-foreground">{item.site_id}</span>
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {item.cell_count} cell · ±{item.estimated_antenna_count} antena
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
