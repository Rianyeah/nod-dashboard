import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3, FileDown, Grid3X3, MapPinned } from 'lucide-react';

import Breadcrumb from '../components/Breadcrumb.jsx';
import SiteDetailModal from '../components/SiteDetailModal.jsx';
import {
  DashboardCombobox,
  DashboardFilterBar,
  DashboardMonthRangePicker,
} from '../components/dashboard-filters/DashboardFilters.jsx';
import {
  buildMonthRange,
  formatMonthRangeLabel,
  getPeriodComparisonLabel,
} from '../components/dashboard-filters/periodRange.js';
import ReportingAreaTable from '../features/reporting/ReportingAreaTable.jsx';
import ReportingCoverageStrip from '../features/reporting/ReportingCoverageStrip.jsx';
import ReportingExecutiveInsights from '../features/reporting/ReportingExecutiveInsights.jsx';
import ReportingPerformanceTrend from '../features/reporting/ReportingPerformanceTrend.jsx';
import ReportingPivot from '../features/reporting/ReportingPivot.jsx';
import ReportingScorecards from '../features/reporting/ReportingScorecards.jsx';
import ReportingSiteDrilldown from '../features/reporting/ReportingSiteDrilldown.jsx';
import { useDashboardThemeTokens } from '../hooks/useDashboardThemeTokens.js';
import {
  fetchFilterOptions,
  fetchReportingAreas,
  fetchReportingAvailableMonths,
  fetchReportingOverview,
} from '../services/api.js';
import { fetchSiteDetailBundle } from '../services/siteDetailBundle.js';


const REPORTING_DEFAULT_NOP = 'SIDOARJO';


function normalizeReportingNop(value) {
  return String(value || '').trim().replace(/^NOP\s+/i, '').toUpperCase();
}


export default function NetworkReportingPage() {
  const navigate = useNavigate();
  const themeTokens = useDashboardThemeTokens();
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState({ start: '', end: '' });
  const [defaultPeriod, setDefaultPeriod] = useState({ start: '', end: '' });
  const [selectedNop, setSelectedNop] = useState(null);
  const [nopOptions, setNopOptions] = useState([]);
  const [filtersReady, setFiltersReady] = useState(false);
  const [filterError, setFilterError] = useState('');
  const [overviewState, setOverviewState] = useState({ requestKey: '', data: null, error: '' });
  const [areasState, setAreasState] = useState({ requestKey: '', data: [], error: '' });
  const [activeTab, setActiveTab] = useState('areas');
  const [selectedArea, setSelectedArea] = useState(null);
  const [printTimestamp, setPrintTimestamp] = useState('');
  const [siteDetail, setSiteDetail] = useState(null);
  const [siteDetailTrend, setSiteDetailTrend] = useState([]);
  const [siteDetailPerformance, setSiteDetailPerformance] = useState(null);

  const resolvedPeriod = useMemo(() => (
    selectedPeriod.start && selectedPeriod.end
      ? buildMonthRange(selectedPeriod.start, selectedPeriod.end)
      : null
  ), [selectedPeriod]);
  const comparisonLabel = selectedPeriod.start && selectedPeriod.end
    ? getPeriodComparisonLabel(selectedPeriod.start, selectedPeriod.end)
    : 'vs periode sebelumnya';
  const reportingRequestKey = filtersReady && selectedPeriod.start && selectedPeriod.end
    ? `${selectedPeriod.start}:${selectedPeriod.end}:${selectedNop || 'regional'}`
    : '';
  const overview = overviewState.data;
  const areas = areasState.data;
  const overviewLoading = Boolean(reportingRequestKey) && overviewState.requestKey !== reportingRequestKey;
  const areasLoading = Boolean(reportingRequestKey) && areasState.requestKey !== reportingRequestKey;
  const overviewError = filterError || (overviewState.requestKey === reportingRequestKey ? overviewState.error : '');
  const areasError = areasState.requestKey === reportingRequestKey ? areasState.error : '';

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchReportingAvailableMonths(), fetchFilterOptions()])
      .then(([months, options]) => {
        if (cancelled) return;
        setAvailableMonths(months || []);
        if (months?.length) {
          const latest = { start: months[0], end: months[0] };
          setDefaultPeriod(latest);
          setSelectedPeriod(latest);
        }
        const nops = options?.nop || [];
        setNopOptions(nops);
        const defaultNop = nops.find((item) => normalizeReportingNop(item) === REPORTING_DEFAULT_NOP);
        setSelectedNop(defaultNop || null);
      })
      .catch(() => {
        if (!cancelled) setFilterError('Filter Reporting tidak dapat dimuat.');
      })
      .finally(() => {
        if (!cancelled) setFiltersReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!reportingRequestKey || !resolvedPeriod) return undefined;
    const controller = new AbortController();

    fetchReportingOverview(selectedPeriod, selectedNop, controller.signal)
      .then((data) => setOverviewState({ requestKey: reportingRequestKey, data, error: '' }))
      .catch((error) => {
        if (error?.code !== 'ERR_CANCELED') {
          setOverviewState((current) => ({ ...current, requestKey: reportingRequestKey, error: 'Ringkasan Reporting tidak dapat diperbarui.' }));
        }
      });
    fetchReportingAreas(selectedPeriod, selectedNop, controller.signal)
      .then((data) => setAreasState({ requestKey: reportingRequestKey, data, error: '' }))
      .catch((error) => {
        if (error?.code !== 'ERR_CANCELED') {
          setAreasState((current) => ({ ...current, requestKey: reportingRequestKey, error: 'Tabel Kabupaten tidak dapat diperbarui.' }));
        }
      });

    return () => controller.abort();
  }, [reportingRequestKey, resolvedPeriod, selectedNop, selectedPeriod]);

  const openSiteDetail = useCallback(async (siteId) => {
    try {
      const bundle = await fetchSiteDetailBundle(siteId);
      setSiteDetail(bundle.detail);
      setSiteDetailTrend(bundle.trendData);
      setSiteDetailPerformance(bundle.performanceData);
    } catch (error) {
      console.error('Failed to load site detail:', error);
    }
  }, []);

  const closeSiteDetail = () => {
    setSiteDetail(null);
    setSiteDetailTrend([]);
    setSiteDetailPerformance(null);
  };

  const handleExportPdf = useCallback(() => {
    const previousTitle = document.title;
    const periodLabel = selectedPeriod.start ? formatMonthRangeLabel(selectedPeriod.start, selectedPeriod.end) : 'Reporting';
    const selectedScope = selectedNop ? normalizeReportingNop(selectedNop) : 'Regional Jatim';
    setPrintTimestamp(new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }));
    document.title = `Network Reporting - ${periodLabel} - ${selectedScope}`;
    requestAnimationFrame(() => {
      window.print();
      document.title = previousTitle;
    });
  }, [selectedNop, selectedPeriod]);

  const scopeLabel = overview?.scope_label || (selectedNop ? normalizeReportingNop(selectedNop) : 'Regional Jatim');

  return (
    <div className="reporting-export-root flex min-h-[100dvh] flex-col bg-[var(--bg-base)]">
      <header className="border-b border-[var(--border)] bg-[var(--bg-header)] px-3 py-3 sm:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => navigate('/home')} title="Kembali ke Dashboard" className="flex size-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><ArrowLeft className="size-4" /></button>
            <span className="flex size-9 items-center justify-center rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/10"><BarChart3 className="size-5 text-[var(--primary-light)]" /></span>
            <div className="min-w-0"><h1 className="truncate text-base font-bold tracking-tight text-[var(--text-primary)]">NETWORK REPORTING</h1><p className="truncate text-[11px] text-[var(--text-muted)]">Availability, Payload, Revenue</p></div>
          </div>
          <div className="reporting-header-controls flex w-full flex-wrap items-end gap-2 xl:w-auto xl:flex-nowrap">
            <button type="button" onClick={handleExportPdf} aria-label="Export reporting to PDF" className="reporting-no-print inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--primary-light)]"><FileDown className="size-3.5" />Export PDF</button>
            <DashboardFilterBar className="w-full border-0 bg-transparent p-0 shadow-none sm:w-auto">
              <DashboardCombobox id="reporting-nop" label="Area" value={selectedNop || ''} onChange={(value) => setSelectedNop(value || null)} options={nopOptions.map((value) => ({ value, label: normalizeReportingNop(value) }))} allLabel="Regional Jatim" />
              <DashboardMonthRangePicker id="reporting-period" label="Periode" value={selectedPeriod} defaultValue={defaultPeriod} availableMonths={availableMonths} onApply={setSelectedPeriod} onReset={setSelectedPeriod} />
            </DashboardFilterBar>
          </div>
        </div>
      </header>
      <Breadcrumb />
      <section className="reporting-print-meta" aria-label="Metadata export reporting">
        <strong>Periode:</strong> {selectedPeriod.start ? formatMonthRangeLabel(selectedPeriod.start, selectedPeriod.end) : '-'}
        {' · '}<strong>Area:</strong> {scopeLabel}
        {' · '}<strong>Perbandingan:</strong> {comparisonLabel}
        {' · '}<strong>Coverage:</strong> {overview?.coverage?.filter((source) => source.status === 'complete').length || 0}/{overview?.coverage?.length || 0} sumber lengkap
        {' · '}<strong>Waktu cetak:</strong> {printTimestamp || '-'}
      </section>

      <main className="flex-1 space-y-4 overflow-y-auto p-3 sm:p-4">
        {overviewError && <p className="rounded-lg border border-[var(--danger)]/20 bg-[var(--danger)]/8 px-3 py-2 text-xs text-[var(--danger)]">{overviewError}</p>}
        {overview?.coverage?.length > 0 && <ReportingCoverageStrip sources={overview.coverage} />}

        <ReportingScorecards overview={overview} comparisonLabel={comparisonLabel} loading={overviewLoading} />

        {overview && <ReportingExecutiveInsights overview={overview} comparisonLabel={comparisonLabel} />}
        <ReportingPerformanceTrend rows={overview?.trend || []} selectedPeriod={selectedPeriod} themeTokens={themeTokens} />

        <div className="reporting-no-print flex w-fit rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-1">
          <button type="button" onClick={() => setActiveTab('areas')} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${activeTab === 'areas' ? 'bg-[var(--primary)]/15 text-[var(--primary-light)]' : 'text-[var(--text-muted)]'}`}><MapPinned className="size-3.5" />Kabupaten & Site</button>
          <button type="button" onClick={() => setActiveTab('pivot')} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${activeTab === 'pivot' ? 'bg-[var(--primary)]/15 text-[var(--primary-light)]' : 'text-[var(--text-muted)]'}`}><Grid3X3 className="size-3.5" />Analisis Pivot</button>
        </div>

        {activeTab === 'areas'
          ? <ReportingAreaTable rows={areas} loading={areasLoading} error={areasError} onSelectArea={setSelectedArea} period={selectedPeriod} nop={selectedNop} />
          : <ReportingPivot period={selectedPeriod} nop={selectedNop} />}
      </main>

      <ReportingSiteDrilldown key={selectedArea?.area_key || 'closed'} area={selectedArea} open={Boolean(selectedArea)} onOpenChange={(open) => { if (!open) setSelectedArea(null); }} period={selectedPeriod} nop={selectedNop} onOpenSite={openSiteDetail} />
      {siteDetail && <SiteDetailModal data={siteDetail} trendData={siteDetailTrend} performanceData={siteDetailPerformance} onClose={closeSiteDetail} />}
    </div>
  );
}
