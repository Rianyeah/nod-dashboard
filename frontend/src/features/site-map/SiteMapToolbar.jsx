import { RotateCcw } from 'lucide-react';

import FilterPanel from '../../components/FilterPanel';
import { DashboardSearchInput } from '../../components/dashboard-filters/DashboardFilters';
import { Button } from '../../components/ui/button';

export default function SiteMapToolbar({
  q,
  onQueryChange,
  filters,
  onFilterChange,
  filterOptions,
  onReset,
}) {
  const hasActiveState = Boolean(q?.trim()) || Object.values(filters || {}).some(Boolean);

  return (
    <section
      aria-label="Pencarian dan filter Site Map"
      className="flex flex-col gap-2 rounded-[var(--noc-radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 shadow-[var(--shadow-sm)] lg:flex-row lg:items-center"
    >
      <DashboardSearchInput
        id="site-map-search"
        value={q}
        onChange={onQueryChange}
        placeholder="Cari Site ID, nama, atau kabupaten"
        aria-label="Cari site pada map"
        className="w-full max-w-none lg:max-w-[360px]"
      />

      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 lg:justify-end">
        <p className="text-[10px] leading-4 text-[var(--text-muted)]">
          Filter berlaku untuk map, sector, dan hasil.
        </p>
        <div className="flex min-w-0 items-center gap-1.5">
          <FilterPanel
            filters={filters}
            onFilterChange={onFilterChange}
            options={filterOptions}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!hasActiveState}
            onClick={onReset}
          >
            <RotateCcw data-icon="inline-start" />
            Reset
          </Button>
        </div>
      </div>
    </section>
  );
}
