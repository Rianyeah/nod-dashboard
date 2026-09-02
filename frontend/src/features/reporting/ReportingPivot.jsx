import { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Grid3X3, Play } from 'lucide-react';

import { DashboardCombobox } from '../../components/dashboard-filters/DashboardFilters.jsx';
import { DashboardTableShell } from '../../components/ui/DashboardPrimitives.jsx';
import { fetchReportingPivot, fetchReportingPivotExport } from '../../services/api.js';
import { triggerBlobDownload } from '../../utils/downloadFile.js';
import { formatNumber, formatPayload, formatPercent, formatRevenue } from '../../utils/formatters.js';
import { buildPivotGrid, sortPivotRows, validatePivotDraft } from './reportingPivotState.js';


const DATASETS = {
  performance: {
    label: 'Performance',
    dimensions: ['period', 'nop', 'kabupaten', 'site_id', 'site_class', 'transport_type', 'mapping_status'],
    measures: {
      sites: 'distinct_count', revenue: 'sum', revenue_per_site: 'ratio', payload: 'sum', payload_per_site: 'ratio', traffic: 'sum', availability: 'weighted_avg', outage_minutes: 'sum',
    },
  },
  ticketing: {
    label: 'Ticketing',
    dimensions: ['period', 'nop', 'kabupaten', 'site_id', 'ticket_category', 'backup_result', 'mapping_status'],
    measures: { tickets: 'count', bps_tickets: 'sum', ts_tickets: 'sum', backup_success: 'sum', backup_success_rate: 'ratio' },
  },
  proker: {
    label: 'Proker',
    dimensions: ['period', 'nop', 'kabupaten', 'site_id', 'status', 'mapping_status'],
    measures: { activities: 'count', open_activities: 'sum', closed_activities: 'sum' },
  },
};


function label(value) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}


function formatValue(value, field) {
  if (value == null) return '-';
  if (field.includes('revenue')) return formatRevenue(value);
  if (field.includes('payload')) return formatPayload(value);
  if (field === 'availability' || field.includes('rate')) return formatPercent(value);
  return formatNumber(value);
}


function PivotSortHeader({ sortKey, index, label: headerLabel, sort, onSort, align = 'right', sticky = false }) {
  const active = sort.key === sortKey && (sortKey !== 'cell' || sort.index === index);
  const Icon = sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`${sticky ? 'sticky left-0 z-10 bg-[var(--bg-elevated)]' : ''} px-3 py-2.5 ${align === 'left' ? 'text-left' : 'text-right'} whitespace-nowrap`}>
      <button type="button" onClick={() => onSort({ key: sortKey, index })} className="inline-flex items-center gap-1 hover:text-[var(--text-primary)]">
        {headerLabel}{active ? <Icon className="size-3" /> : null}
      </button>
    </th>
  );
}


export default function ReportingPivot({ period, nop }) {
  const [draft, setDraft] = useState({ dataset: 'performance', rows: ['kabupaten'], column: 'period', values: ['revenue'] });
  const [result, setResult] = useState(null);
  const [appliedSpec, setAppliedSpec] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const [sort, setSort] = useState({ key: 'label', direction: 'asc' });
  const controllerRef = useRef(null);
  const config = DATASETS[draft.dataset];
  const grid = useMemo(() => buildPivotGrid(result || {}), [result]);
  const sortedRows = useMemo(() => sortPivotRows(grid, sort), [grid, sort]);

  const handleSort = ({ key, index }) => setSort((current) => {
    const sameColumn = current.key === key && (key !== 'cell' || current.index === index);
    return {
      key,
      index,
      direction: sameColumn
        ? (current.direction === 'desc' ? 'asc' : 'desc')
        : key === 'label' ? 'asc' : 'desc',
    };
  });

  const setDataset = (dataset) => {
    const next = DATASETS[dataset];
    setDraft({ dataset, rows: ['kabupaten'], column: 'period', values: [Object.keys(next.measures)[0]] });
    setResult(null);
    setAppliedSpec(null);
    setError('');
    setExportError('');
  };
  const setRow = (index, value) => setDraft((current) => {
    const nextRows = [...current.rows];
    if (value) nextRows[index] = value;
    else nextRows.splice(index, 1);
    return {
      ...current,
      rows: nextRows.filter((item, itemIndex, items) => item && items.indexOf(item) === itemIndex),
      column: nextRows.includes(current.column) ? '' : current.column,
    };
  });
  const toggleValue = (field) => setDraft((current) => {
    const exists = current.values.includes(field);
    if (exists) return { ...current, values: current.values.filter((item) => item !== field) };
    if (current.values.length >= 3) return current;
    return { ...current, values: [...current.values, field] };
  });

  const apply = async () => {
    const validation = validatePivotDraft({ rows: draft.rows, columns: draft.column ? [draft.column] : [], values: draft.values.map((field) => ({ field })) });
    if (!validation.valid) {
      setError(validation.message);
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const specification = {
        dataset: draft.dataset,
        period_start: period.start,
        period_end: period.end,
        nop: nop || null,
        rows: draft.rows,
        columns: draft.column ? [draft.column] : [],
        values: draft.values.map((field) => ({ field, aggregation: config.measures[field] })),
        filters: [],
      };
      const response = await fetchReportingPivot(specification, controller.signal);
      setResult(response);
      setAppliedSpec(specification);
      setSort({ key: 'label', direction: 'asc' });
    } catch (requestError) {
      if (requestError?.code === 'ERR_CANCELED') return;
      const detail = requestError?.response?.data?.detail;
      setError(detail?.code === 'pivot_too_large'
        ? `Pivot menghasilkan sekitar ${Number(detail.estimated_cells).toLocaleString('id-ID')} sel. Kurangi dimensi atau periode.`
        : 'Analisis Pivot tidak dapat dimuat.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!appliedSpec || !result || exporting) return;
    setExporting(true);
    setExportError('');
    try {
      const { blob, filename } = await fetchReportingPivotExport(appliedSpec);
      triggerBlobDownload(blob, filename);
    } catch {
      setExportError('File XLSX Pivot tidak dapat dibuat.');
    } finally {
      setExporting(false);
    }
  };

  const dimensionOptions = config.dimensions.map((value) => ({ value, label: label(value) }));
  return (
    <DashboardTableShell
      title="Analisis Pivot"
      icon={Grid3X3}
      description="Susun analisis singkat; data tetap diagregasi di server."
      action={(
        <button type="button" onClick={handleExport} disabled={!result || !appliedSpec || exporting} className="reporting-no-print inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-2.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--primary-light)] disabled:opacity-50">
          <Download className="size-3.5" />{exporting ? 'Menyiapkan' : 'Download XLSX'}
        </button>
      )}
    >
      <div className="reporting-no-print border-b border-[var(--border)] p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <DashboardCombobox id="pivot-dataset" label="Dataset" value={draft.dataset} onChange={setDataset} options={Object.entries(DATASETS).map(([value, item]) => ({ value, label: item.label }))} />
          <DashboardCombobox id="pivot-row-primary" label="Baris 1" value={draft.rows[0]} onChange={(value) => setRow(0, value)} options={dimensionOptions.filter((item) => item.value !== draft.rows[1])} />
          <DashboardCombobox id="pivot-row-secondary" label="Baris 2" value={draft.rows[1] || ''} onChange={(value) => setRow(1, value)} options={dimensionOptions.filter((item) => item.value !== draft.rows[0])} allLabel="Tanpa baris kedua" />
          <DashboardCombobox id="pivot-column" label="Kolom" value={draft.column} onChange={(value) => setDraft((current) => ({ ...current, column: value }))} options={dimensionOptions.filter((item) => !draft.rows.includes(item.value))} allLabel="Tanpa kolom" />
          <div>
            <p className="mb-1 text-[10px] font-semibold text-[var(--text-muted)]">Nilai (maks. 3)</p>
            <div className="flex min-h-9 flex-wrap gap-1.5">
              {Object.keys(config.measures).map((field) => (
                <label key={field} className={`inline-flex cursor-pointer items-center rounded-md border px-2 py-1.5 text-[11px] ${draft.values.includes(field) ? 'border-[var(--primary)]/35 bg-[var(--primary)]/15 text-[var(--primary-light)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>
                  <input type="checkbox" checked={draft.values.includes(field)} onChange={() => toggleValue(field)} className="sr-only" />{label(field)}
                </label>
              ))}
            </div>
          </div>
        </div>
        <button type="button" onClick={apply} disabled={loading || !period?.start} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--primary-light)] disabled:opacity-50">
          <Play className="size-3.5" />{loading ? 'Memproses' : 'Terapkan Pivot'}
        </button>
      </div>
      {error && <p className="border-b border-[var(--danger)]/20 bg-[var(--danger)]/8 px-4 py-3 text-xs text-[var(--danger)]">{error}</p>}
      {exportError && <p className="border-b border-[var(--danger)]/20 bg-[var(--danger)]/8 px-4 py-3 text-xs text-[var(--danger)]">{exportError}</p>}
      {!result && !loading ? (
        <p className="px-4 py-12 text-center text-sm text-[var(--text-muted)]">Pilih susunan lalu terapkan.</p>
      ) : loading ? (
        <div className="space-y-2 p-4">{[1, 2, 3].map((key) => <div key={key} className="skeleton h-10 rounded-lg" />)}</div>
      ) : (
        <div className="max-w-full overflow-x-auto overscroll-x-contain">
          <table className="min-w-max w-full text-xs">
            <thead><tr className="bg-[var(--bg-elevated)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              <PivotSortHeader sortKey="label" label={result.row_dimensions.map(label).join(' / ')} sort={sort} onSort={handleSort} align="left" sticky />
              {grid.columns.map((column, index) => <PivotSortHeader key={column} sortKey="cell" index={index} label={column} sort={sort} onSort={handleSort} />)}
              <PivotSortHeader sortKey="total" label="Total" sort={sort} onSort={handleSort} />
            </tr></thead>
            <tbody className="divide-y divide-[var(--border)]">{sortedRows.map((row) => <tr key={row.label}><th className="sticky left-0 bg-[var(--bg-surface)] px-3 py-2.5 text-left font-semibold text-[var(--text-primary)]">{row.label}</th>{row.cells.map((value, index) => { const field = grid.columns[index].split(' · ').at(-1); return <td key={grid.columns[index]} className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{formatValue(value, field)}</td>; })}<td className="px-3 py-2.5 text-right font-mono font-semibold text-[var(--text-primary)]">{row.total == null ? '-' : formatValue(row.total, result.value_fields[0])}</td></tr>)}</tbody>
            {grid.rows.length > 0 && <tfoot><tr className="border-t border-[var(--border-strong)] bg-[var(--bg-elevated)]"><th className="sticky left-0 bg-[var(--bg-elevated)] px-3 py-2.5 text-left">Total</th>{grid.totals.map((value, index) => { const field = grid.columns[index].split(' · ').at(-1); return <td key={grid.columns[index]} className="px-3 py-2.5 text-right font-mono font-semibold">{value == null ? '-' : formatValue(value, field)}</td>; })}<td className="px-3 py-2.5 text-right font-mono font-semibold">{grid.grandTotal == null ? '-' : formatValue(grid.grandTotal, result.value_fields[0])}</td></tr></tfoot>}
          </table>
        </div>
      )}
    </DashboardTableShell>
  );
}
