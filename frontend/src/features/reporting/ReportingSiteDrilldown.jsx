import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, Server } from 'lucide-react';

import { DashboardCombobox } from '../../components/dashboard-filters/DashboardFilters.jsx';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../components/ui/sheet.jsx';
import { fetchReportingSites } from '../../services/api.js';
import { formatPayload, formatPercent, formatRevenueShort } from '../../utils/formatters.js';
import ReportingMetricValue from './ReportingMetricValue.jsx';


const TARGET_STATUS_OPTIONS = [
  { value: 'all', label: 'Semua status' },
  { value: 'achieved', label: 'Achieved' },
  { value: 'not_achieved', label: 'Not achieved' },
  { value: 'unavailable', label: 'Data belum lengkap' },
];


function SortHeader({ field, label, active, direction, onSort, align = 'right' }) {
  const Icon = direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`bg-[var(--bg-elevated)] px-3 py-2 ${align === 'left' ? 'text-left' : 'text-right'} whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]`}>
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 hover:text-[var(--text-primary)]">
        {label}{active ? <Icon className="size-3" /> : null}
      </button>
    </th>
  );
}


function SiteRow({ item, onOpenSite, mobile = false }) {
  if (mobile) {
    return (
      <button type="button" onClick={() => onOpenSite(item.site_id)} className="block w-full px-4 py-3 text-left hover:bg-[var(--bg-hover)]">
        <div className="flex items-start justify-between gap-3">
          <div><strong className="text-sm text-[var(--text-primary)]">{item.site_id}</strong><p className="text-xs text-[var(--text-muted)]">{item.site_name || 'Nama site belum terpetakan'}</p></div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
          <span><small className="block text-[var(--text-muted)]">Revenue</small><ReportingMetricValue value={item.revenue} delta={item.revenue_mom_pct} formatValue={formatRevenueShort} valueClassName="text-[var(--success)]" /></span>
          <span><small className="block text-[var(--text-muted)]">Payload</small><ReportingMetricValue value={item.payload} delta={item.payload_mom_pct} formatValue={formatPayload} valueClassName="text-[var(--chart-info)]" /></span>
          <span><small className="block text-[var(--text-muted)]">Availability</small><ReportingMetricValue value={item.avg_availability} delta={item.availability_delta_pct} formatValue={formatPercent} digits={2} valueClassName="text-[var(--text-primary)]" /></span>
        </div>
        <p className="mt-2 text-[10px] text-[var(--text-muted)]">{item.site_class || 'Site Class belum tersedia'} / {item.status_site || 'Status belum tersedia'} / {item.transport_type || 'Transport belum tersedia'}</p>
      </button>
    );
  }
  return (
    <tr onClick={() => onOpenSite(item.site_id)} className="cursor-pointer hover:bg-[var(--bg-hover)]/60">
      <td className="px-3 py-2.5"><strong className="block text-[var(--text-primary)]">{item.site_id}</strong><span className="text-[11px] text-[var(--text-muted)]">{item.site_name || '-'}</span></td>
      <td className="px-3 py-2.5 text-[var(--text-secondary)]">{item.site_class || '-'}</td>
      <td className="px-3 py-2.5 text-[var(--text-secondary)]">{item.status_site || '-'}</td>
      <td className="px-3 py-2.5 text-right"><ReportingMetricValue value={item.revenue} delta={item.revenue_mom_pct} formatValue={formatRevenueShort} valueClassName="text-[var(--success)]" /></td>
      <td className="px-3 py-2.5 text-right"><ReportingMetricValue value={item.payload} delta={item.payload_mom_pct} formatValue={formatPayload} valueClassName="text-[var(--chart-info)]" /></td>
      <td className="px-3 py-2.5 text-right"><ReportingMetricValue value={item.avg_availability} delta={item.availability_delta_pct} formatValue={formatPercent} digits={2} valueClassName="text-[var(--text-primary)]" /></td>
    </tr>
  );
}


export default function ReportingSiteDrilldown({ area, open, onOpenChange, period, nop, onOpenSite }) {
  const [query, setQuery] = useState({ page: 1, page_size: 25, sort_by: 'revenue', sort_dir: 'desc', rank: 'all', rank_limit: 10, rank_metric: 'revenue', target_status: 'all', site_class: '', q: '' });
  const [requestState, setRequestState] = useState({ requestKey: '', result: null, error: '' });
  const requestQuery = useMemo(() => ({
    ...query,
    site_class: query.site_class || undefined,
    q: query.q.trim() || undefined,
  }), [query]);
  const requestKey = open && area && period?.start && period?.end
    ? `${area.area_key}:${period.start}:${period.end}:${nop || 'regional'}:${JSON.stringify(requestQuery)}`
    : '';
  const result = requestState.result;
  const loading = Boolean(requestKey) && requestState.requestKey !== requestKey;
  const error = requestState.requestKey === requestKey ? requestState.error : '';

  useEffect(() => {
    if (!requestKey) return undefined;
    const controller = new AbortController();
    fetchReportingSites(area.area_key, { period, nop, ...requestQuery }, controller.signal)
      .then((data) => setRequestState({ requestKey, result: data, error: '' }))
      .catch((requestError) => {
        if (requestError?.code !== 'ERR_CANCELED') {
          setRequestState({ requestKey, result: null, error: 'Detail site tidak dapat dimuat.' });
        }
      });
    return () => controller.abort();
  }, [area, nop, period, requestKey, requestQuery]);

  const update = (key, value) => setQuery((current) => ({ ...current, [key]: value, page: 1 }));
  const handleSort = (field) => setQuery((current) => ({
    ...current,
    sort_by: field,
    sort_dir: current.sort_by === field && current.sort_dir === 'desc' ? 'asc' : 'desc',
    rank_metric: field,
    rank: 'all',
    page: 1,
  }));
  const handleRank = (value) => setQuery((current) => ({
    ...current,
    rank: value,
    sort_dir: value === 'bottom' ? 'asc' : value === 'top' ? 'desc' : current.sort_dir,
    page: 1,
  }));
  const totalPages = Math.max(1, Math.ceil(Number(result?.total || 0) / Number(result?.page_size || 25)));
  const showGrandTotal = !loading && !error && result?.items?.length > 0 && result?.grand_total;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="data-[side=right]:w-full data-[side=right]:sm:max-w-4xl">
        <SheetHeader className="border-b border-[var(--border)] px-4 py-4 pr-14 sm:px-6">
          <SheetTitle className="flex items-center gap-2"><Server className="size-4 text-[var(--primary-light)]" />{area?.kabupaten || 'Detail site'}</SheetTitle>
          <SheetDescription>{result ? `${Number(result.total).toLocaleString('id-ID')} site sesuai filter` : 'Kabupaten ke site'}</SheetDescription>
        </SheetHeader>
        <div className="reporting-no-print grid gap-2 border-b border-[var(--border)] p-4 sm:grid-cols-2 xl:grid-cols-3">
          <label className="relative"><span className="mb-1 block text-[10px] font-semibold text-[var(--text-muted)]">Cari site</span><Search className="absolute bottom-2.5 left-3 size-3.5 text-[var(--text-muted)]" /><input value={query.q} onChange={(event) => update('q', event.target.value)} placeholder="Site ID atau nama" className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] pl-9 pr-3 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--primary)]" /></label>
          <DashboardCombobox id="reporting-site-target" label="Target Achieved" value={query.target_status} onChange={(value) => update('target_status', value)} options={TARGET_STATUS_OPTIONS} />
          <DashboardCombobox id="reporting-site-class" label="Site Class" value={query.site_class} onChange={(value) => update('site_class', value)} options={(result?.site_classes || []).map((value) => ({ value, label: value }))} allLabel="Semua Class" />
          <div className="flex items-end gap-1 sm:col-span-2 xl:col-span-3">
            {['all', 'top', 'bottom'].map((value) => <button key={value} type="button" onClick={() => handleRank(value)} className={`rounded-md border px-3 py-1.5 text-[11px] font-semibold ${query.rank === value ? 'border-[var(--primary)]/30 bg-[var(--primary)]/15 text-[var(--primary-light)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>{value === 'all' ? 'Semua' : value === 'top' ? 'Top 10' : 'Bottom 10'}</button>)}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && <p className="m-4 rounded-lg bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">{error}</p>}
          {loading ? <div className="space-y-2 p-4">{[1, 2, 3, 4].map((key) => <div key={key} className="skeleton h-14 rounded-lg" />)}</div> : result?.items?.length ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-[780px] w-full text-xs">
                  <thead><tr>
                    <SortHeader field="site_id" label="Site" active={query.sort_by === 'site_id'} direction={query.sort_dir} onSort={handleSort} align="left" />
                    <SortHeader field="site_class" label="Class" active={query.sort_by === 'site_class'} direction={query.sort_dir} onSort={handleSort} align="left" />
                    <SortHeader field="status_site" label="Status" active={query.sort_by === 'status_site'} direction={query.sort_dir} onSort={handleSort} align="left" />
                    <SortHeader field="revenue" label="Revenue" active={query.sort_by === 'revenue'} direction={query.sort_dir} onSort={handleSort} />
                    <SortHeader field="payload" label="Payload" active={query.sort_by === 'payload'} direction={query.sort_dir} onSort={handleSort} />
                    <SortHeader field="availability" label="Availability" active={query.sort_by === 'availability'} direction={query.sort_dir} onSort={handleSort} />
                  </tr></thead>
                  <tbody className="divide-y divide-[var(--border)]">{result.items.map((item) => <SiteRow key={item.site_id} item={item} onOpenSite={onOpenSite} />)}</tbody>
                  {showGrandTotal ? (
                    <tfoot>
                      <tr className="border-t-2 border-[var(--border-strong)] bg-[var(--surface-soft)]">
                        <td className="px-3 py-3 font-semibold text-[var(--text-primary)]">Grand Total<span className="block text-[10px] font-normal text-[var(--text-muted)]">{Number(result.grand_total.total_sites).toLocaleString('id-ID')} site</span></td>
                        <td className="px-3 py-3 text-[var(--text-muted)]">-</td>
                        <td className="px-3 py-3 text-[var(--text-muted)]">-</td>
                        <td className="px-3 py-3 text-right"><ReportingMetricValue value={result.grand_total.revenue} delta={result.grand_total.revenue_mom_pct} formatValue={formatRevenueShort} valueClassName="text-[var(--success)]" /></td>
                        <td className="px-3 py-3 text-right"><ReportingMetricValue value={result.grand_total.payload} delta={result.grand_total.payload_mom_pct} formatValue={formatPayload} valueClassName="text-[var(--chart-info)]" /></td>
                        <td className="px-3 py-3 text-right"><ReportingMetricValue value={result.grand_total.avg_availability} delta={result.grand_total.availability_delta_pct} formatValue={formatPercent} digits={2} valueClassName="text-[var(--text-primary)]" /></td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
              <div className="divide-y divide-[var(--border)] md:hidden">
                {result.items.map((item) => <SiteRow key={item.site_id} item={item} onOpenSite={onOpenSite} mobile />)}
                {showGrandTotal ? (
                  <article className="bg-[var(--surface-soft)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3"><strong className="text-sm text-[var(--text-primary)]">Grand Total</strong><span className="text-xs text-[var(--text-muted)]">{Number(result.grand_total.total_sites).toLocaleString('id-ID')} site</span></div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                      <span><small className="block text-[var(--text-muted)]">Revenue</small><ReportingMetricValue value={result.grand_total.revenue} delta={result.grand_total.revenue_mom_pct} formatValue={formatRevenueShort} valueClassName="text-[var(--success)]" /></span>
                      <span><small className="block text-[var(--text-muted)]">Payload</small><ReportingMetricValue value={result.grand_total.payload} delta={result.grand_total.payload_mom_pct} formatValue={formatPayload} valueClassName="text-[var(--chart-info)]" /></span>
                      <span><small className="block text-[var(--text-muted)]">Availability</small><ReportingMetricValue value={result.grand_total.avg_availability} delta={result.grand_total.availability_delta_pct} formatValue={formatPercent} digits={2} valueClassName="text-[var(--text-primary)]" /></span>
                    </div>
                  </article>
                ) : null}
              </div>
            </>
          ) : !loading && <p className="px-4 py-12 text-center text-sm text-[var(--text-muted)]">Tidak ada site sesuai filter.</p>}
        </div>
        <div className="reporting-no-print flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--text-muted)]">
          <span>Halaman {result?.page || 1} dari {totalPages}</span>
          <div className="flex gap-1"><button type="button" disabled={(result?.page || 1) <= 1} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))} className="rounded-md border border-[var(--border)] p-2 disabled:opacity-40"><ChevronLeft className="size-3.5" /></button><button type="button" disabled={(result?.page || 1) >= totalPages} onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))} className="rounded-md border border-[var(--border)] p-2 disabled:opacity-40"><ChevronRight className="size-3.5" /></button></div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
