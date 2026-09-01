import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, MapPinned } from 'lucide-react';

import { DashboardCombobox } from '../../components/dashboard-filters/DashboardFilters.jsx';
import { DashboardStatusBadge, DashboardTableShell } from '../../components/ui/DashboardPrimitives.jsx';
import { formatNumber, formatPayload, formatPercent, formatRevenue, formatRevenueShort, formatTraffic } from '../../utils/formatters.js';
import { rankAndSortAreas, toAreaMobileMetric } from './reportingTableState.js';


const METRICS = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'payload', label: 'Payload' },
  { value: 'availability', label: 'Availability' },
  { value: 'total_sites', label: 'Total Site' },
];


function SlaBadge({ status }) {
  const tone = status === 'met' ? 'success' : status === 'missed' ? 'warning' : 'neutral';
  const label = status === 'met' ? 'SLA' : status === 'missed' ? 'Miss' : 'N/A';
  return <DashboardStatusBadge tone={tone}>{label}</DashboardStatusBadge>;
}


function SortHeader({ field, label, active, direction, onSort, align = 'right' }) {
  const Icon = direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`bg-[var(--bg-elevated)] px-3 py-2.5 ${align === 'left' ? 'text-left' : 'text-right'} text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] whitespace-nowrap`}>
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 hover:text-[var(--text-primary)]">
        {label}{active && <Icon className="size-3" />}
      </button>
    </th>
  );
}


export default function ReportingAreaTable({ rows = [], loading = false, error, onSelectArea }) {
  const [metric, setMetric] = useState('revenue');
  const [rank, setRank] = useState('all');
  const [sort, setSort] = useState({ field: 'revenue', direction: 'desc' });
  const [expanded, setExpanded] = useState(null);
  const visibleRows = useMemo(() => rankAndSortAreas(rows, {
    metric: rank === 'all' ? sort.field : metric,
    rank,
    direction: rank === 'all' ? sort.direction : undefined,
    limit: 10,
  }), [metric, rank, rows, sort]);

  const handleSort = (field) => setSort((current) => ({
    field,
    direction: current.field === field && current.direction === 'desc' ? 'asc' : 'desc',
  }));

  const action = (
    <div className="reporting-no-print flex flex-wrap items-end gap-2">
      <DashboardCombobox id="reporting-rank-metric" label="Urutkan" value={metric} onChange={setMetric} options={METRICS} allLabel="Revenue" />
      <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-0.5">
        {['all', 'top', 'bottom'].map((value) => (
          <button key={value} type="button" onClick={() => setRank(value)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${rank === value ? 'bg-[var(--primary)]/15 text-[var(--primary-light)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
            {value === 'all' ? 'Semua' : value === 'top' ? 'Top 10' : 'Bottom 10'}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <DashboardTableShell title="Kabupaten & Site" icon={MapPinned} count={visibleRows.length} action={action}>
      {error && <p className="border-b border-[var(--danger)]/20 bg-[var(--danger)]/8 px-4 py-3 text-xs text-[var(--danger)]">{error}</p>}
      {loading ? (
        <div className="space-y-2 p-4">{[1, 2, 3, 4].map((key) => <div key={key} className="skeleton h-12 rounded-lg" />)}</div>
      ) : visibleRows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">Tidak ada area pada periode ini.</p>
      ) : (
        <>
          <div className="hidden max-w-full overflow-x-auto md:block">
            <table className="min-w-[1060px] w-full text-left">
              <thead>
                <tr>
                  <SortHeader field="kabupaten" label="Kabupaten/Kota" active={sort.field === 'kabupaten'} direction={sort.direction} onSort={handleSort} align="left" />
                  <SortHeader field="total_sites" label="Site" active={sort.field === 'total_sites'} direction={sort.direction} onSort={handleSort} />
                  <SortHeader field="revenue" label="Revenue" active={sort.field === 'revenue'} direction={sort.direction} onSort={handleSort} />
                  <SortHeader field="payload" label="Payload" active={sort.field === 'payload'} direction={sort.direction} onSort={handleSort} />
                  <SortHeader field="avg_availability" label="Availability" active={sort.field === 'avg_availability'} direction={sort.direction} onSort={handleSort} />
                  <th className="bg-[var(--bg-elevated)] px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Traffic</th>
                  <th className="bg-[var(--bg-elevated)] px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Ticket / Backup</th>
                  <th className="bg-[var(--bg-elevated)] px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Proker</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {visibleRows.map((row) => (
                  <tr key={row.area_key} onClick={() => onSelectArea(row)} className="cursor-pointer hover:bg-[var(--bg-hover)]/60 focus-within:bg-[var(--bg-hover)]/60">
                    <td className="px-3 py-3 font-semibold text-[var(--text-primary)]"><button type="button" className="flex items-center gap-2 text-left"><ChevronRight className="size-3.5 text-[var(--primary-light)]" />{row.kabupaten}</button></td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{formatNumber(row.total_sites)}</td>
                    <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums text-[var(--success)]">{formatRevenueShort(row.revenue)}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-[var(--chart-info)]">{formatPayload(row.payload)}</td>
                    <td className="px-3 py-3 text-right"><span className="mr-2 font-mono tabular-nums">{formatPercent(row.avg_availability)}</span><SlaBadge status={row.sla_status} /></td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{formatTraffic(row.traffic)}</td>
                    <td className="px-3 py-3 text-right text-xs text-[var(--text-secondary)]">BPS {formatNumber(row.ticket_swfm_bps)} · TS {formatNumber(row.ticket_swfm_ts)} · {formatPercent(row.backup_sukses_rate)}</td>
                    <td className="px-3 py-3 text-right text-xs text-[var(--text-secondary)]">{formatNumber(row.proker_open)} open · {formatNumber(row.proker_closed)} close</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[var(--border)] md:hidden">
            {visibleRows.map((row) => {
              const item = toAreaMobileMetric(row);
              const open = expanded === row.area_key;
              return (
                <article key={row.area_key} className="px-4 py-3">
                  <button type="button" onClick={() => onSelectArea(row)} className="flex w-full items-start justify-between gap-3 text-left">
                    <div>
                      <h3 className="font-semibold text-[var(--text-primary)]">{item.identity}</h3>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">{formatNumber(item.sites)} site</p>
                    </div>
                    <ChevronRight className="mt-1 size-4 text-[var(--primary-light)]" />
                  </button>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div><p className="text-[10px] text-[var(--text-muted)]">Revenue</p><strong className="font-mono text-[var(--success)]">{formatRevenue(item.revenue)}</strong></div>
                    <div><p className="text-[10px] text-[var(--text-muted)]">Payload</p><strong className="font-mono text-[var(--text-primary)]">{formatPayload(item.payload)}</strong></div>
                    <div><p className="text-[10px] text-[var(--text-muted)]">Availability</p><strong className="font-mono text-[var(--text-primary)]">{formatPercent(item.availability.value)}</strong></div>
                  </div>
                  <button type="button" onClick={() => setExpanded(open ? null : row.area_key)} className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)]">
                    <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} /> Detail
                  </button>
                  {open && <p className="mt-2 text-[11px] leading-5 text-[var(--text-muted)]">Traffic {formatTraffic(row.traffic)} · BPS {formatNumber(row.ticket_swfm_bps)} · Backup {formatPercent(row.backup_sukses_rate)} · Proker {formatNumber(row.proker_open)} open</p>}
                </article>
              );
            })}
          </div>
        </>
      )}
    </DashboardTableShell>
  );
}
