import {
  ArrowCounterClockwiseIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CaretUpDownIcon,
  FunnelIcon,
  SirenIcon,
  TrayIcon,
} from '@phosphor-icons/react';

import {
  DashboardFilterSelect,
  DashboardPagination,
  DashboardSearchInput,
  DashboardTableToolbar,
} from '@/components/dashboard-filters/DashboardFilters';
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
import { formatNumber } from '@/utils/formatters';
import { formatDateLabel } from './impactServiceDateRange';

const headers = [
  { label: 'Tanggal', sortKey: 'tanggal' },
  { label: 'Site ID', sortKey: 'site_id' },
  { label: 'Site Name', sortKey: 'site_name' },
  { label: 'NOP', sortKey: 'nop' },
  { label: 'Alarm Name', sortKey: 'alarm_name' },
  { label: 'Category', sortKey: 'category' },
  { label: 'Severity', sortKey: 'severity' },
  { label: 'Aging', sortKey: 'aging' },
  { label: 'Status', sortKey: 'status' },
  { label: 'SOW', sortKey: 'sow' },
  { label: 'Comment', sortKey: null },
];

function asDisplay(value) {
  return value == null || value === '' ? '-' : String(value);
}

function StatusBadge({ value }) {
  const status = String(value || '').toUpperCase();
  if (status === 'OPEN') {
    return <Badge variant="destructive">{status}</Badge>;
  }
  if (status === 'CLEAR') {
    return <Badge className="bg-emerald-500/10 text-emerald-400">{status}</Badge>;
  }
  return <Badge variant="outline">{status || '-'}</Badge>;
}

function SeverityBadge({ value }) {
  const severity = String(value || '');
  const style = severity === 'Critical'
    ? 'bg-red-500/10 text-red-400'
    : severity === 'Major'
      ? 'bg-amber-500/10 text-amber-400'
      : 'bg-sky-500/10 text-sky-400';
  return <Badge className={style}>{severity || '-'}</Badge>;
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

export default function ImpactServiceAlarmTable({
  alarms,
  loading,
  searchTerm,
  statusFilter,
  severityFilter,
  selectedNop,
  page,
  sortBy,
  sortDir,
  onSearchChange,
  onStatusChange,
  onSeverityChange,
  onSortChange,
  onResetTable,
  onPageChange,
  onSelectAlarm,
}) {
  const totalPages = alarms.total_pages || 0;

  return (
    <Card size="sm" className="impact-service-screen-table animate-fade-in border border-border bg-card/95 shadow-sm [--card-spacing:--spacing(3)]">
      <CardHeader className="gap-3 border-b border-border">
        <DashboardTableToolbar>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <SirenIcon weight="duotone" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Alarm Detail Table</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatNumber(alarms.total)} rows | {selectedNop || 'Semua NOP'}
              </p>
            </div>
          </div>

          <DashboardSearchInput
            id="impact-search"
            data-testid="impact-search"
            value={searchTerm}
            onChange={onSearchChange}
            placeholder="Cari site, alarm, ticket"
            aria-label="Cari alarm Impact Service"
            className="w-full lg:w-[250px]"
          />
          <DashboardFilterSelect
            id="impact-status"
            testId="impact-status"
            ariaLabel="Filter status alarm"
            value={statusFilter}
            onChange={onStatusChange}
            options={['OPEN', 'CLEAR']}
            allLabel="Semua Status"
            triggerClassName="w-full lg:w-[140px]"
          />
          <DashboardFilterSelect
            id="impact-severity"
            testId="impact-severity"
            ariaLabel="Filter severity alarm"
            value={severityFilter}
            onChange={onSeverityChange}
            options={['Critical', 'Major', 'Minor', 'Warning']}
            allLabel="Semua Severity"
            triggerClassName="w-full lg:w-[155px]"
          />
          <Badge variant="outline" className="h-8 justify-center px-3">
            <FunnelIcon />
            Filter tabel
          </Badge>
          <Button type="button" variant="ghost" size="sm" onClick={onResetTable}>
            <ArrowCounterClockwiseIcon data-icon="inline-start" />
            Reset tabel
          </Button>
        </DashboardTableToolbar>
      </CardHeader>

      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              {headers.map((header) => (
                <TableHead
                  key={header.label}
                  aria-sort={header.sortKey && sortBy === header.sortKey
                    ? (sortDir === 'asc' ? 'ascending' : 'descending')
                    : undefined}
                  className="h-8 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {header.sortKey ? (
                    <Button
                      data-testid={`impact-sort-${header.sortKey}`}
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="-ml-2 px-2 uppercase tracking-wider"
                      onClick={() => onSortChange(header.sortKey)}
                      aria-label={sortBy === header.sortKey
                        ? `Urutkan ${header.label} ${sortDir === 'asc' ? 'menurun' : 'menaik'}`
                        : `Urutkan berdasarkan ${header.label}`}
                    >
                      {header.label}
                      {sortBy === header.sortKey
                        ? (sortDir === 'asc'
                          ? <ArrowUpIcon data-icon="inline-end" />
                          : <ArrowDownIcon data-icon="inline-end" />)
                        : <CaretUpDownIcon data-icon="inline-end" />}
                    </Button>
                  ) : header.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell colSpan={headers.length}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : alarms.items.length ? (
              alarms.items.map((row) => (
                <TableRow
                  key={row.id}
                  data-testid="impact-alarm-row"
                  tabIndex={0}
                  role="button"
                  onClick={() => onSelectAlarm(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') onSelectAlarm(row.id);
                  }}
                  className="cursor-pointer"
                >
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">{formatDateLabel(row.tanggal)}</TableCell>
                  <TableCell className="px-2 py-1.5 font-mono text-xs font-semibold text-primary">{asDisplay(row.site_id)}</TableCell>
                  <TableCell className="px-2 py-1.5 text-xs"><TruncatedCell value={row.site_name} /></TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">{asDisplay(row.nop)}</TableCell>
                  <TableCell className="px-2 py-1.5 text-xs font-medium"><TruncatedCell value={row.alarm_name} /></TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground"><TruncatedCell value={row.category} /></TableCell>
                  <TableCell className="px-2 py-1.5"><SeverityBadge value={row.severity} /></TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">
                    {row.aging == null ? asDisplay(row.aging_range) : `${row.aging} hari`}
                  </TableCell>
                  <TableCell className="px-2 py-1.5"><StatusBadge value={row.status} /></TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">{asDisplay(row.sow)}</TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground"><TruncatedCell value={row.comment} /></TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={headers.length}>
                  <Empty className="py-12">
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><TrayIcon /></EmptyMedia>
                      <EmptyTitle className="text-base">Tidak ada alarm</EmptyTitle>
                      <EmptyDescription>Tidak ada alarm untuk filter tabel ini.</EmptyDescription>
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
        page={alarms.page || page}
        totalPages={totalPages || 1}
        onPageChange={onPageChange}
        disabled={loading}
        previousTestId="impact-prev-page"
        nextTestId="impact-next-page"
      />
    </Card>
  );
}
