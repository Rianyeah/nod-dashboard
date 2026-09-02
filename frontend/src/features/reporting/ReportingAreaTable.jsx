import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Download, MapPinned } from 'lucide-react';

import { formatReportingPeriodTitle } from '../../components/dashboard-filters/periodRange.js';
import { DashboardTableShell } from '../../components/ui/DashboardPrimitives.jsx';
import { fetchReportingAreaExport } from '../../services/api.js';
import { triggerBlobDownload } from '../../utils/downloadFile.js';
import { formatNumber, formatPayload, formatPercent, formatRevenue, formatRevenueShort, formatTraffic } from '../../utils/formatters.js';
import ReportingMetricValue from './ReportingMetricValue.jsx';
import { buildAreaGrandTotal } from './reportingPerformanceMetrics.js';
import { rankAndSortAreas, toAreaMobileMetric } from './reportingTableState.js';


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


export default function ReportingAreaTable({ rows = [], loading = false, error, onSelectArea, period, nop }) {
  const [rank, setRank] = useState('all');
  const [sort, setSort] = useState({ field: 'revenue', direction: 'desc' });
  const [expanded, setExpanded] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const grandTotal = useMemo(
    () => (!loading && !error ? buildAreaGrandTotal(rows) : null),
    [error, loading, rows],
  );
  const visibleRows = useMemo(() => rankAndSortAreas(rows, {
    metric: sort.field,
    rank,
    direction: rank === 'all' ? sort.direction : undefined,
    limit: 10,
  }), [rank, rows, sort]);

  const handleSort = (field) => {
    setRank('all');
    setSort((current) => ({
      field,
      direction: current.field === field && current.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const handleRank = (value) => {
    setRank(value);
    if (value !== 'all') {
      setSort((current) => ({ ...current, direction: value === 'bottom' ? 'asc' : 'desc' }));
    }
  };

  const handleExport = async () => {
    if (!period?.start || !period?.end || exporting) return;
    setExporting(true);
    setExportError('');
    try {
      const { blob, filename } = await fetchReportingAreaExport(period, nop);
      triggerBlobDownload(blob, filename);
    } catch {
      setExportError('File XLSX Kabupaten & Site tidak dapat dibuat.');
    } finally {
      setExporting(false);
    }
  };

  const periodTitle = period?.start && period?.end
    ? formatReportingPeriodTitle(period.start, period.end)
    : '';

  const action = (
    <div className="reporting-no-print flex flex-wrap items-end gap-2">
      <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-0.5">
        {['all', 'top', 'bottom'].map((value) => (
          <button key={value} type="button" onClick={() => handleRank(value)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${rank === value ? 'bg-[var(--primary)]/15 text-[var(--primary-light)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
            {value === 'all' ? 'Semua' : value === 'top' ? 'Top 10' : 'Bottom 10'}
          </button>
        ))}
      </div>
      <button type="button" onClick={handleExport} disabled={exporting || !period?.start || loading} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-2.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--primary-light)] disabled:opacity-50">
        <Download className="size-3.5" />{exporting ? 'Menyiapkan' : 'Download XLSX'}
      </button>
    </div>
  );

  return (
    <DashboardTableShell title={`Kabupaten & Site${periodTitle ? ` ${periodTitle}` : ''}`} icon={MapPinned} count={visibleRows.length} action={action}>
      {error && <p className="border-b border-[var(--danger)]/20 bg-[var(--danger)]/8 px-4 py-3 text-xs text-[var(--danger)]">{error}</p>}
      {exportError && <p className="border-b border-[var(--danger)]/20 bg-[var(--danger)]/8 px-4 py-3 text-xs text-[var(--danger)]">{exportError}</p>}
      {loading ? (
        <div className="space-y-2 p-4">{[1, 2, 3, 4].map((key) => <div key={key} className="skeleton h-12 rounded-lg" />)}</div>
      ) : visibleRows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">Tidak ada area pada periode ini.</p>
      ) : (
        <>
          <div className="hidden max-w-full overflow-x-auto md:block">
            <table className="min-w-[1240px] w-full text-left">
              <thead>
                <tr>
                  <SortHeader field="kabupaten" label="Kabupaten/Kota" active={sort.field === 'kabupaten'} direction={sort.direction} onSort={handleSort} align="left" />
                  <SortHeader field="total_sites" label="Site" active={sort.field === 'total_sites'} direction={sort.direction} onSort={handleSort} />
                  <SortHeader field="u30_sites" label="U30" active={sort.field === 'u30_sites'} direction={sort.direction} onSort={handleSort} />
                  <SortHeader field="u60_sites" label="U60" active={sort.field === 'u60_sites'} direction={sort.direction} onSort={handleSort} />
                  <SortHeader field="revenue" label="Revenue" active={sort.field === 'revenue'} direction={sort.direction} onSort={handleSort} />
                  <SortHeader field="payload" label="Payload" active={sort.field === 'payload'} direction={sort.direction} onSort={handleSort} />
                  <SortHeader field="avg_availability" label="Availability" active={sort.field === 'avg_availability'} direction={sort.direction} onSort={handleSort} />
                  <SortHeader field="traffic" label="Traffic" active={sort.field === 'traffic'} direction={sort.direction} onSort={handleSort} />
                  <SortHeader field="ticket_backup" label="Ticket / Backup" active={sort.field === 'ticket_backup'} direction={sort.direction} onSort={handleSort} />
                  <SortHeader field="proker" label="Proker" active={sort.field === 'proker'} direction={sort.direction} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {visibleRows.map((row) => (
                  <tr key={row.area_key} onClick={() => onSelectArea(row)} className="cursor-pointer hover:bg-[var(--bg-hover)]/60 focus-within:bg-[var(--bg-hover)]/60">
                    <td className="px-3 py-3 font-semibold text-[var(--text-primary)]"><button type="button" className="flex items-center gap-2 text-left"><ChevronRight className="size-3.5 text-[var(--primary-light)]" />{row.kabupaten}</button></td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{formatNumber(row.total_sites)}</td>
                    <td className="px-3 py-3 text-right"><ReportingMetricValue value={row.u30_sites} delta={row.u30_mom_pct} formatValue={formatNumber} valueClassName="text-[var(--danger)]" /></td>
                    <td className="px-3 py-3 text-right"><ReportingMetricValue value={row.u60_sites} delta={row.u60_mom_pct} formatValue={formatNumber} valueClassName="text-[var(--warning)]" /></td>
                    <td className="px-3 py-3 text-right"><ReportingMetricValue value={row.revenue} delta={row.revenue_delta_pct} formatValue={formatRevenueShort} valueClassName="text-[var(--success)]" /></td>
                    <td className="px-3 py-3 text-right"><ReportingMetricValue value={row.payload} delta={row.payload_delta_pct} formatValue={formatPayload} valueClassName="text-[var(--chart-info)]" /></td>
                    <td className="px-3 py-3 text-right"><ReportingMetricValue value={row.avg_availability} delta={row.availability_delta_pct} formatValue={formatPercent} digits={2} valueClassName="text-[var(--text-primary)]" /></td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{formatTraffic(row.traffic)}</td>
                    <td className="px-3 py-3 text-right text-xs text-[var(--text-secondary)]">BPS {formatNumber(row.ticket_swfm_bps)} / TS {formatNumber(row.ticket_swfm_ts)} / {formatPercent(row.backup_sukses_rate)}</td>
                    <td className="px-3 py-3 text-right text-xs text-[var(--text-secondary)]">{formatNumber(row.proker_open)} open / {formatNumber(row.proker_closed)} close</td>
                  </tr>
                ))}
              </tbody>
              {grandTotal ? (
                <tfoot>
                  <tr className="border-t-2 border-[var(--border-strong)] bg-[var(--surface-soft)]">
                    <td className="px-3 py-3 font-semibold text-[var(--text-primary)]">Grand Total</td>
                    <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums">{formatNumber(grandTotal.total_sites)}</td>
                    <td className="px-3 py-3 text-right"><ReportingMetricValue value={grandTotal.u30_sites} delta={grandTotal.u30_mom_pct} formatValue={formatNumber} valueClassName="text-[var(--danger)]" /></td>
                    <td className="px-3 py-3 text-right"><ReportingMetricValue value={grandTotal.u60_sites} delta={grandTotal.u60_mom_pct} formatValue={formatNumber} valueClassName="text-[var(--warning)]" /></td>
                    <td className="px-3 py-3 text-right"><ReportingMetricValue value={grandTotal.revenue} delta={grandTotal.revenue_delta_pct} formatValue={formatRevenueShort} valueClassName="text-[var(--success)]" /></td>
                    <td className="px-3 py-3 text-right"><ReportingMetricValue value={grandTotal.payload} delta={grandTotal.payload_delta_pct} formatValue={formatPayload} valueClassName="text-[var(--chart-info)]" /></td>
                    <td className="px-3 py-3 text-right"><ReportingMetricValue value={grandTotal.avg_availability} delta={grandTotal.availability_delta_pct} formatValue={formatPercent} digits={2} valueClassName="text-[var(--text-primary)]" /></td>
                    <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums text-[var(--text-secondary)]">{formatTraffic(grandTotal.traffic)}</td>
                    <td className="px-3 py-3 text-right text-xs font-semibold text-[var(--text-secondary)]">BPS {formatNumber(grandTotal.ticket_swfm_bps)} / TS {formatNumber(grandTotal.ticket_swfm_ts)} / {formatPercent(grandTotal.backup_sukses_rate)}</td>
                    <td className="px-3 py-3 text-right text-xs font-semibold text-[var(--text-secondary)]">{formatNumber(grandTotal.proker_open)} open / {formatNumber(grandTotal.proker_closed)} close</td>
                  </tr>
                </tfoot>
              ) : null}
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
                      <div className="mt-1 flex gap-3 text-[10px]"><span className="text-[var(--danger)]">U30 <ReportingMetricValue value={item.u30.value} delta={item.u30.delta} formatValue={formatNumber} /></span><span className="text-[var(--warning)]">U60 <ReportingMetricValue value={item.u60.value} delta={item.u60.delta} formatValue={formatNumber} /></span></div>
                    </div>
                    <ChevronRight className="mt-1 size-4 text-[var(--primary-light)]" />
                  </button>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div><p className="text-[10px] text-[var(--text-muted)]">Revenue</p><ReportingMetricValue value={item.revenue.value} delta={item.revenue.delta} formatValue={formatRevenue} valueClassName="text-[var(--success)]" /></div>
                    <div><p className="text-[10px] text-[var(--text-muted)]">Payload</p><ReportingMetricValue value={item.payload.value} delta={item.payload.delta} formatValue={formatPayload} valueClassName="text-[var(--text-primary)]" /></div>
                    <div><p className="text-[10px] text-[var(--text-muted)]">Availability</p><ReportingMetricValue value={item.availability.value} delta={item.availability.delta} formatValue={formatPercent} digits={2} valueClassName="text-[var(--text-primary)]" /></div>
                  </div>
                  <button type="button" onClick={() => setExpanded(open ? null : row.area_key)} className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)]">
                    <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} /> Detail
                  </button>
                  {open && <p className="mt-2 text-[11px] leading-5 text-[var(--text-muted)]">Traffic {formatTraffic(row.traffic)} / BPS {formatNumber(row.ticket_swfm_bps)} / Backup {formatPercent(row.backup_sukses_rate)} / Proker {formatNumber(row.proker_open)} open</p>}
                </article>
              );
            })}
            {grandTotal ? (
              <article className="bg-[var(--surface-soft)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-[var(--text-primary)]">Grand Total</h3>
                  <span className="text-xs text-[var(--text-muted)]">{formatNumber(grandTotal.total_sites)} site</span>
                </div>
                <div className="mt-2 flex gap-4 text-[11px]"><span className="text-[var(--danger)]">U30 <ReportingMetricValue value={grandTotal.u30_sites} delta={grandTotal.u30_mom_pct} formatValue={formatNumber} /></span><span className="text-[var(--warning)]">U60 <ReportingMetricValue value={grandTotal.u60_sites} delta={grandTotal.u60_mom_pct} formatValue={formatNumber} /></span></div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-[10px] text-[var(--text-muted)]">Revenue</p><ReportingMetricValue value={grandTotal.revenue} delta={grandTotal.revenue_delta_pct} formatValue={formatRevenue} valueClassName="text-[var(--success)]" /></div>
                  <div><p className="text-[10px] text-[var(--text-muted)]">Payload</p><ReportingMetricValue value={grandTotal.payload} delta={grandTotal.payload_delta_pct} formatValue={formatPayload} valueClassName="text-[var(--text-primary)]" /></div>
                  <div><p className="text-[10px] text-[var(--text-muted)]">Availability</p><ReportingMetricValue value={grandTotal.avg_availability} delta={grandTotal.availability_delta_pct} formatValue={formatPercent} digits={2} valueClassName="text-[var(--text-primary)]" /></div>
                </div>
              </article>
            ) : null}
          </div>
        </>
      )}
    </DashboardTableShell>
  );
}
