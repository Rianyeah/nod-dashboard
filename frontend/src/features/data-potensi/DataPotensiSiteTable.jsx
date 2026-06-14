import {
  ArrowCounterClockwiseIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CaretUpDownIcon,
  DatabaseIcon,
  TrayIcon,
} from '@phosphor-icons/react';

import {
  DashboardFilterChips,
  DashboardFilterPopover,
  DashboardFilterSelect,
  DashboardPagination,
  DashboardSearchInput,
  DashboardTableToolbar,
} from '@/components/dashboard-filters/DashboardFilters';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DATA_POTENSI_ADVANCED_FILTERS } from '@/features/data-potensi/dataPotensiFilters';
import { formatNumber } from '@/utils/formatters';

const HEADERS = [
  { key: 'site_id', label: 'Site ID' },
  { key: 'site_name', label: 'Site Name' },
  { key: 'cluster', label: 'Cluster' },
  { key: 'kabupaten', label: 'Kabupaten' },
  { key: 'site_class', label: 'Class' },
  { key: 'type_site', label: 'Type' },
  { key: 'transport_type', label: 'Transport' },
  { key: 'type_battery', label: 'Battery' },
  { key: 'jenis_rectifier', label: 'Rectifier' },
  { key: 'tp', label: 'TP' },
  { key: 'status_site', label: 'Status' },
];

function asDisplay(value) {
  if (value == null || value === '') return '-';

  const display = String(value).trim();
  return ['tidak ada', 'tidak tersedia', 'n/a', '#n/a', '-'].includes(display.toLowerCase())
    ? 'Tidak ada'
    : display;
}

function TruncatedCell({ value, className = '' }) {
  const display = asDisplay(value);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`block max-w-[260px] truncate ${className}`}>{display}</span>
      </TooltipTrigger>
      <TooltipContent>{display}</TooltipContent>
    </Tooltip>
  );
}

function StatusBadge({ value }) {
  const status = String(value || '').toUpperCase();
  if (status === 'ACTIVE') {
    return <Badge className="bg-emerald-500/10 text-emerald-500">Active</Badge>;
  }
  if (status === 'NON ACTIVE') {
    return <Badge variant="destructive">Non Active</Badge>;
  }
  return <Badge variant="outline">{asDisplay(value)}</Badge>;
}

export default function DataPotensiSiteTable({
  sites,
  loading,
  error,
  searchTerm,
  advancedFilters,
  filterOptions,
  selectedNop,
  page,
  sortBy,
  sortDir,
  onSearchChange,
  onAdvancedFiltersApply,
  onRemoveFilter,
  onSortChange,
  onResetTable,
  onPageChange,
  onSelectSite,
}) {
  const totalPages = sites.total_pages || 0;
  const filterChips = DATA_POTENSI_ADVANCED_FILTERS.map((filter) => ({
    key: filter.key,
    label: filter.label,
    value: advancedFilters[filter.key],
  }));

  return (
    <Card size="sm" className="animate-fade-in border border-border bg-card/95 shadow-sm [--card-spacing:--spacing(3)]">
      <CardHeader className="gap-3 border-b border-border">
        <DashboardTableToolbar>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <DatabaseIcon weight="duotone" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Detail Site</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatNumber(sites.total)} rows | {selectedNop || 'Semua NOP'}
              </p>
            </div>
          </div>

          <DashboardSearchInput
            id="data-potensi-search"
            data-testid="data-potensi-search"
            value={searchTerm}
            onChange={onSearchChange}
            placeholder="Cari Site ID atau Nama"
            aria-label="Cari site Data Potensi"
            className="w-full lg:w-[260px]"
          />

          <DashboardFilterPopover
            title="Filter lanjutan"
            description="Filter ini diterapkan ke KPI, seluruh chart, dan tabel Data Potensi."
            values={advancedFilters}
            onApply={onAdvancedFiltersApply}
            onReset={() => Object.fromEntries(
              DATA_POTENSI_ADVANCED_FILTERS.map(({ key }) => [key, '']),
            )}
            triggerLabel="Filter lanjutan"
            testId="data-potensi-advanced-filter"
          >
            {({ draftValues, setDraftValue }) => (
              DATA_POTENSI_ADVANCED_FILTERS.map((filter) => (
                <DashboardFilterSelect
                  key={filter.key}
                  id={`data-potensi-${filter.key}`}
                  label={filter.label}
                  value={draftValues[filter.key]}
                  onChange={(value) => setDraftValue(filter.key, value)}
                  options={filterOptions[filter.optionsKey] || []}
                  allLabel={filter.allLabel}
                  triggerClassName="w-full"
                />
              ))
            )}
          </DashboardFilterPopover>

          <Button type="button" variant="ghost" size="sm" onClick={onResetTable}>
            <ArrowCounterClockwiseIcon data-icon="inline-start" />
            Reset tabel
          </Button>
        </DashboardTableToolbar>

        <DashboardFilterChips items={filterChips} onRemove={onRemoveFilter} />

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Tabel tidak dapat diperbarui</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardHeader>

      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              {HEADERS.map((header) => (
                <TableHead
                  key={header.key}
                  aria-sort={sortBy === header.key
                    ? (sortDir === 'asc' ? 'ascending' : 'descending')
                    : undefined}
                  className="h-8 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  <Button
                    data-testid={`data-potensi-sort-${header.key}`}
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="-ml-2 px-2 uppercase tracking-wider"
                    onClick={() => onSortChange(header.key)}
                    aria-label={sortBy === header.key
                      ? `Urutkan ${header.label} ${sortDir === 'asc' ? 'menurun' : 'menaik'}`
                      : `Urutkan berdasarkan ${header.label}`}
                  >
                    {header.label}
                    {sortBy === header.key
                      ? (sortDir === 'asc'
                        ? <ArrowUpIcon data-icon="inline-end" />
                        : <ArrowDownIcon data-icon="inline-end" />)
                      : <CaretUpDownIcon data-icon="inline-end" />}
                  </Button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell colSpan={HEADERS.length}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : sites.data.length ? (
              sites.data.map((site) => (
                <TableRow
                  key={site.site_id}
                  data-testid="data-potensi-site-row"
                  tabIndex={0}
                  role="button"
                  onClick={() => onSelectSite(site.site_id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectSite(site.site_id);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <TableCell className="px-2 py-1.5 font-mono text-xs font-semibold text-primary">
                    {asDisplay(site.site_id)}
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-xs"><TruncatedCell value={site.site_name} /></TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">{asDisplay(site.cluster)}</TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">{asDisplay(site.kabupaten)}</TableCell>
                  <TableCell className="px-2 py-1.5 text-xs"><Badge variant="outline">{asDisplay(site.site_class)}</Badge></TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">{asDisplay(site.type_site)}</TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">{asDisplay(site.transport_type)}</TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">{asDisplay(site.type_battery)}</TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">{asDisplay(site.jenis_rectifier)}</TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">{asDisplay(site.tp)}</TableCell>
                  <TableCell className="px-2 py-1.5"><StatusBadge value={site.status_site} /></TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={HEADERS.length}>
                  <Empty className="py-12">
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><TrayIcon /></EmptyMedia>
                      <EmptyTitle className="text-base">Tidak ada site</EmptyTitle>
                      <EmptyDescription>Tidak ada site untuk filter yang dipilih.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <DashboardPagination
        className="border-t border-border px-3 py-2"
        page={sites.page || page}
        totalPages={totalPages || 1}
        onPageChange={onPageChange}
        disabled={loading}
        previousTestId="data-potensi-prev-page"
        nextTestId="data-potensi-next-page"
      />
    </Card>
  );
}
