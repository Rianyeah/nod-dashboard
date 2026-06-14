import { Component, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import {
  AlertTriangle,
  ArrowLeft,
  CircleAlert,
  Gauge,
  Network,
  Radio,
  Route,
  ShieldAlert,
  Signal,
  Timer,
} from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import {
  DashboardCombobox,
  DashboardFilterBar,
  DashboardFilterChips,
  DashboardFilterPopover,
  DashboardFilterSelect,
  DashboardPagination,
  DashboardPeriodPicker,
} from '../components/dashboard-filters/DashboardFilters';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { TRANSPORT_CHART_COLORS } from '../features/transport-quality/transportQualityChartConfig';
import { TransportQualityCharts } from '../features/transport-quality/TransportQualityCharts';
import {
  DashboardKpiCard,
  DashboardStatusBadge,
} from '../components/ui/DashboardPrimitives';
import {
  fetchTransportQualityBreakdowns,
  fetchTransportQualityDistributions,
  fetchTransportQualityFilters,
  fetchTransportQualityPrioritySites,
  fetchTransportQualitySummary,
  fetchTransportQualityTrend,
} from '../services/api';
import { formatNumber } from '../utils/formatters';

const PL_THRESHOLD = 1;
const LATENCY_THRESHOLD = 5;
const TABLE_LIMIT = 20;
const EMPTY_ADVANCED_FILTERS = {
  kabupaten: '',
  transport_type: '',
  thi_status: '',
  distribution_pl: '',
  pl_status_0_1_pct: '',
  distribution_lat: '',
  jitter_status: '',
};

class TransportQualityErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Transport Quality render failed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--bg-base)] p-6 text-[var(--text-primary)]">
          <section className="glass-card mx-auto mt-16 max-w-xl p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10">
                <ShieldAlert className="size-5 text-red-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Transport Quality</h1>
                <p className="text-sm text-[var(--text-muted)]">Halaman gagal dirender. Coba muat ulang.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="rounded-lg border border-[var(--border-light)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)]"
            >
              Muat ulang halaman
            </button>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}

function formatDateLabel(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`));
}

function formatMetric(value, digits = 2, suffix = '') {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return `${Number(value).toFixed(digits).replace('.', ',')}${suffix}`;
}

function asDisplay(value) {
  if (value == null || value === '') return '-';
  return String(value);
}

function Scorecard({ title, value, subtitle, icon: Icon, accent, glow }) {
  return (
    <DashboardKpiCard title={title} value={value} subtitle={subtitle} icon={Icon} accent={accent} glow={glow} />
  );
}

function PriorityBadge({ value }) {
  const priority = String(value || 'Normal').toUpperCase();
  return (
    <DashboardStatusBadge tone={priority === 'P1' ? 'danger' : priority === 'P2' ? 'warning' : 'success'}>{priority}</DashboardStatusBadge>
  );
}

function StatusBadge({ value, fail }) {
  const label = String(value || '-').toUpperCase();
  const isFail = fail || label === 'FAIL';
  return (
    <DashboardStatusBadge tone={isFail ? 'danger' : label === 'PASS' ? 'success' : 'neutral'}>{label}</DashboardStatusBadge>
  );
}

function MetricCell({ value, bad, suffix = '', digits = 2 }) {
  return (
    <span className={`font-mono text-xs font-semibold tabular-nums ${bad ? 'text-red-300' : 'text-[var(--text-secondary)]'}`}>
      {formatMetric(value, digits, suffix)}
    </span>
  );
}

function TransportQualityDashboard() {
  const navigate = useNavigate();
  const [filterOptions, setFilterOptions] = useState({
    default_date: '',
    periods: [],
    nops: [],
    kabupaten: [],
    transport_types: [],
    thi_statuses: [],
    distribution_pl: [],
    pl_status_0_1_pct: [],
    distribution_lat: [],
    jitter_statuses: [],
  });
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedNop, setSelectedNop] = useState('');
  const [advancedFilters, setAdvancedFilters] = useState(EMPTY_ADVANCED_FILTERS);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [distributions, setDistributions] = useState({ by_packet_loss: [], by_latency: [], by_jitter: [] });
  const [breakdowns, setBreakdowns] = useState({ by_nop: [], by_kabupaten: [], by_transport_type: [] });
  const [prioritySites, setPrioritySites] = useState({ items: [], total: 0, page: 1, limit: TABLE_LIMIT, total_pages: 0 });
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchTransportQualityFilters()
      .then((data) => {
        if (cancelled) return;
        const periods = Array.isArray(data?.periods) ? data.periods : [];
        const latestDate = data?.max_date || periods[0]?.date || '';
        setFilterOptions({
          default_date: latestDate,
          periods,
          nops: data?.nops || [],
          kabupaten: data?.kabupaten || [],
          transport_types: data?.transport_types || [],
          thi_statuses: data?.thi_statuses || [],
          distribution_pl: data?.distribution_pl || [],
          pl_status_0_1_pct: data?.pl_status_0_1_pct || [],
          distribution_lat: data?.distribution_lat || [],
          jitter_statuses: data?.jitter_statuses || [],
        });
        setSelectedDate(latestDate);
        setFiltersLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to load Transport Quality filters:', err);
        if (!cancelled) {
          setError('Gagal memuat filter Transport Quality.');
          setDashboardLoading(false);
          setTableLoading(false);
          setFiltersLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const dashboardParams = useMemo(() => ({
    date: selectedDate || undefined,
    nop: selectedNop || undefined,
    kabupaten: advancedFilters.kabupaten || undefined,
    transport_type: advancedFilters.transport_type || undefined,
    thi_status: advancedFilters.thi_status || undefined,
    distribution_pl: advancedFilters.distribution_pl || undefined,
    pl_status_0_1_pct: advancedFilters.pl_status_0_1_pct || undefined,
    distribution_lat: advancedFilters.distribution_lat || undefined,
    jitter_status: advancedFilters.jitter_status || undefined,
  }), [advancedFilters, selectedDate, selectedNop]);

  const tableParams = useMemo(() => ({
    ...dashboardParams,
    page,
    limit: TABLE_LIMIT,
  }), [dashboardParams, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [dashboardParams]);

  useEffect(() => {
    if (!filtersLoaded || !selectedDate) return;
    let cancelled = false;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDashboardLoading(true);
    setError(null);
    Promise.all([
      fetchTransportQualitySummary(dashboardParams),
      fetchTransportQualityTrend(dashboardParams),
      fetchTransportQualityDistributions(dashboardParams),
      fetchTransportQualityBreakdowns(dashboardParams),
    ])
      .then(([nextSummary, nextTrend, nextDistributions, nextBreakdowns]) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setTrend(Array.isArray(nextTrend) ? nextTrend : []);
        setDistributions(nextDistributions || { by_packet_loss: [], by_latency: [], by_jitter: [] });
        setBreakdowns(nextBreakdowns || { by_nop: [], by_kabupaten: [], by_transport_type: [] });
      })
      .catch((err) => {
        console.error('Failed to load Transport Quality dashboard:', err);
        if (!cancelled) setError('Gagal memuat data Transport Quality.');
      })
      .finally(() => {
        if (!cancelled) setDashboardLoading(false);
      });
    return () => { cancelled = true; };
  }, [dashboardParams, filtersLoaded, selectedDate]);

  useEffect(() => {
    if (!filtersLoaded || !selectedDate) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTableLoading(true);
    fetchTransportQualityPrioritySites(tableParams)
      .then((nextPrioritySites) => {
        if (!cancelled) {
          setPrioritySites(nextPrioritySites || {
            items: [],
            total: 0,
            page: 1,
            limit: TABLE_LIMIT,
            total_pages: 0,
          });
        }
      })
      .catch((err) => {
        console.error('Failed to load Transport Quality priority sites:', err);
        if (!cancelled) setError('Gagal memuat Priority Site List.');
      })
      .finally(() => {
        if (!cancelled) setTableLoading(false);
      });
    return () => { cancelled = true; };
  }, [filtersLoaded, selectedDate, tableParams]);

  const selectedPeriod = useMemo(
    () => filterOptions.periods.find((period) => period.date === selectedDate),
    [filterOptions.periods, selectedDate],
  );

  const resetFilters = () => {
    setSelectedDate(filterOptions.default_date || filterOptions.periods[0]?.date || '');
    setSelectedNop('');
    setAdvancedFilters({ ...EMPTY_ADVANCED_FILTERS });
    setPage(1);
  };

  const removeAdvancedFilter = (key) => {
    setAdvancedFilters((current) => ({ ...current, [key]: '' }));
  };

  const scorecards = useMemo(() => [
    {
      title: 'Total Sites',
      value: formatNumber(summary?.total_sites || 0),
      subtitle: `${formatNumber(summary?.total_records || 0)} records selected`,
      icon: Network,
      accent: TRANSPORT_CHART_COLORS.total,
      glow: 'rgba(96, 165, 250, 0.12)',
    },
    {
      title: 'PL > 1%',
      value: formatNumber(summary?.pl_over_1_sites || 0),
      subtitle: `threshold packet loss ${PL_THRESHOLD}%`,
      icon: Signal,
      accent: TRANSPORT_CHART_COLORS.packetLoss,
      glow: 'rgba(239, 68, 68, 0.12)',
    },
    {
      title: 'Latency > 5ms',
      value: formatNumber(summary?.latency_over_5_sites || 0),
      subtitle: `threshold latency ${LATENCY_THRESHOLD}ms`,
      icon: Timer,
      accent: TRANSPORT_CHART_COLORS.latency,
      glow: 'rgba(245, 158, 11, 0.12)',
    },
    {
      title: 'FLAG PL FAIL',
      value: formatNumber(summary?.flag_pl_fail_sites || 0),
      subtitle: 'high priority packet loss',
      icon: CircleAlert,
      accent: TRANSPORT_CHART_COLORS.p1,
      glow: 'rgba(220, 38, 38, 0.12)',
    },
    {
      title: 'THI FAIL',
      value: formatNumber(summary?.thi_fail_sites || 0),
      subtitle: 'Transport Healthy Index',
      icon: ShieldAlert,
      accent: TRANSPORT_CHART_COLORS.p1,
      glow: 'rgba(220, 38, 38, 0.12)',
    },
    {
      title: 'P1 Sites',
      value: formatNumber(summary?.p1_sites || 0),
      subtitle: `${formatNumber(summary?.p2_sites || 0)} P2 threshold sites`,
      icon: AlertTriangle,
      accent: TRANSPORT_CHART_COLORS.p1,
      glow: 'rgba(220, 38, 38, 0.14)',
    },
  ], [summary]);

  const latestPriority = prioritySites.items.slice(0, 4);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] bg-gradient-to-r from-[var(--bg-base)] via-[var(--bg-surface)] to-[var(--bg-base)] px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3 lg:flex-nowrap">
          <div className="flex min-w-0 items-center gap-3 lg:shrink-0">
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="flex size-9 items-center justify-center rounded-lg border border-[var(--border-light)] text-[var(--text-muted)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)]"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
                <Radio className="size-5 text-[var(--primary-light)]" />
                Transport Quality
              </h1>
              <p className="truncate text-xs text-[var(--text-muted)]">
                Packet loss, latency, jitter, and Transport Healthy Index monitoring.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-end justify-end gap-2 lg:w-auto lg:flex-nowrap">
            <DashboardFilterBar
              className="w-full border-0 bg-transparent p-0 shadow-none backdrop-blur-none lg:w-auto"
              actions={(
                <>
                  <DashboardFilterPopover
                    title="Filter kualitas lanjutan"
                    description="Tujuh filter kualitas diterapkan bersamaan setelah menekan Terapkan."
                    values={advancedFilters}
                    onApply={setAdvancedFilters}
                    onReset={() => ({ ...EMPTY_ADVANCED_FILTERS })}
                    testId="transport-filter-sheet"
                  >
                    {({ draftValues, setDraftValue }) => (
                      <>
                        <DashboardCombobox
                          id="transport-kabupaten"
                          label="Kabupaten"
                          value={draftValues.kabupaten}
                          onChange={(value) => setDraftValue('kabupaten', value)}
                          options={filterOptions.kabupaten}
                          allLabel="Semua Kabupaten"
                        />
                        <DashboardFilterSelect
                          id="transport-type"
                          label="Transport Type"
                          value={draftValues.transport_type}
                          onChange={(value) => setDraftValue('transport_type', value)}
                          options={filterOptions.transport_types}
                        />
                        <DashboardFilterSelect
                          id="transport-thi-status"
                          label="THI Status"
                          value={draftValues.thi_status}
                          onChange={(value) => setDraftValue('thi_status', value)}
                          options={filterOptions.thi_statuses}
                        />
                        <DashboardFilterSelect
                          id="transport-distribution-pl"
                          label="Distribution PL"
                          value={draftValues.distribution_pl}
                          onChange={(value) => setDraftValue('distribution_pl', value)}
                          options={filterOptions.distribution_pl}
                        />
                        <DashboardFilterSelect
                          id="transport-pl-status"
                          label="PL Status 0.1%"
                          value={draftValues.pl_status_0_1_pct}
                          onChange={(value) => setDraftValue('pl_status_0_1_pct', value)}
                          options={filterOptions.pl_status_0_1_pct}
                        />
                        <DashboardFilterSelect
                          id="transport-distribution-lat"
                          label="Distribution Lat"
                          value={draftValues.distribution_lat}
                          onChange={(value) => setDraftValue('distribution_lat', value)}
                          options={filterOptions.distribution_lat}
                        />
                        <DashboardFilterSelect
                          id="transport-jitter-status"
                          label="Jitter Status"
                          value={draftValues.jitter_status}
                          onChange={(value) => setDraftValue('jitter_status', value)}
                          options={filterOptions.jitter_statuses}
                        />
                      </>
                    )}
                  </DashboardFilterPopover>
                  <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                    <ArrowCounterClockwiseIcon data-icon="inline-start" />
                    Reset
                  </Button>
                </>
              )}
              chips={(
                <DashboardFilterChips
                  items={[
                    { key: 'kabupaten', label: 'Kabupaten', value: advancedFilters.kabupaten },
                    { key: 'transport_type', label: 'Transport', value: advancedFilters.transport_type },
                    { key: 'thi_status', label: 'THI', value: advancedFilters.thi_status },
                    { key: 'distribution_pl', label: 'Distribution PL', value: advancedFilters.distribution_pl },
                    { key: 'pl_status_0_1_pct', label: 'PL 0.1%', value: advancedFilters.pl_status_0_1_pct },
                    { key: 'distribution_lat', label: 'Distribution Lat', value: advancedFilters.distribution_lat },
                    { key: 'jitter_status', label: 'Jitter', value: advancedFilters.jitter_status },
                  ]}
                  onRemove={removeAdvancedFilter}
                />
              )}
            >
              <DashboardPeriodPicker
                id="transport-date"
                label="Date / Week"
                value={selectedDate}
                onChange={setSelectedDate}
                options={filterOptions.periods.map((period) => ({
                  value: period.date,
                  label: period.label,
                }))}
                includeAll={false}
              />
              <DashboardCombobox
                id="transport-nop"
                label="NOP"
                value={selectedNop}
                onChange={setSelectedNop}
                options={filterOptions.nops}
                allLabel="Semua NOP"
              />
            </DashboardFilterBar>
            <div className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/70 px-3 py-2 text-right">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Last update</p>
              <p className="font-mono text-xs font-semibold text-[var(--primary-light)]">
                {selectedPeriod?.label || formatDateLabel(selectedDate)}
              </p>
            </div>
          </div>
        </div>
      </header>

      <Breadcrumb />

      <main className="flex-1 space-y-4 overflow-y-auto p-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Data tidak dapat diperbarui</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {dashboardLoading && !summary ? (
            Array.from({ length: 6 }, (_, index) => <div key={index} className="skeleton h-[86px] rounded-xl" />)
          ) : (
            scorecards.map((card) => <Scorecard key={card.title} {...card} />)
          )}
        </section>

        <TransportQualityCharts
          trend={trend}
          distributions={distributions}
          breakdowns={breakdowns}
          latestPriority={latestPriority}
          formatDateLabel={formatDateLabel}
        />

        <section className="glass-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Gauge className="size-4 text-[var(--primary-light)]" />
              <h2 className="text-sm font-semibold tracking-wide text-[var(--text-primary)]">Priority Site List</h2>
              <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] font-mono text-[var(--text-muted)]">
                {formatNumber(prioritySites.total)} rows
              </span>
            </div>
            <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-[10px] text-[var(--text-muted)]">
              <Route className="size-3" />
              PL &gt; {PL_THRESHOLD}% or latency &gt; {LATENCY_THRESHOLD}ms or FAIL status
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  {['Site ID', 'Site Name', 'NOP', 'Kabupaten', 'Transport Type', 'PL', 'Lat', 'Jitter', 'FLAG PL', 'THI', 'Distribution PL', 'Distribution Lat', 'Priority', 'Action Hint'].map((head) => (
                    <th key={head} className="sticky top-0 z-10 whitespace-nowrap bg-[var(--bg-elevated)] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {prioritySites.items.map((row) => (
                  <tr
                    key={row.site_id}
                    className={`transition-colors hover:bg-[var(--bg-hover)]/45 ${row.priority_level === 'P1' ? 'bg-red-500/[0.045]' : ''
                      }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-bold text-[var(--text-primary)]">{row.site_id}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-xs text-[var(--text-secondary)]">{asDisplay(row.site_name)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-secondary)]">{asDisplay(row.nop)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-secondary)]">{asDisplay(row.kabupaten)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-secondary)]">{asDisplay(row.transport_type)}</td>
                    <td className="whitespace-nowrap px-3 py-2"><MetricCell value={row.avg_packet_loss} bad={row.pl_over_threshold} suffix="%" /></td>
                    <td className="whitespace-nowrap px-3 py-2"><MetricCell value={row.latency} bad={row.latency_over_threshold} suffix="ms" /></td>
                    <td className="whitespace-nowrap px-3 py-2"><MetricCell value={row.jitter} digits={3} /></td>
                    <td className="whitespace-nowrap px-3 py-2"><StatusBadge value={row.flag_pl_status} fail={row.flag_pl_fail} /></td>
                    <td className="whitespace-nowrap px-3 py-2"><StatusBadge value={row.thi_status} fail={row.thi_fail} /></td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-secondary)]">{asDisplay(row.distribution_pl)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-secondary)]">{asDisplay(row.distribution_lat)}</td>
                    <td className="whitespace-nowrap px-3 py-2"><PriorityBadge value={row.priority_level} /></td>
                    <td className="min-w-[180px] px-3 py-2 text-xs text-[var(--text-muted)]">{asDisplay(row.action_hint)}</td>
                  </tr>
                ))}
                {!prioritySites.items.length && (
                  <tr>
                    <td colSpan={14} className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">
                      Tidak ada priority site untuk filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <DashboardPagination
            page={prioritySites.page || page}
            totalPages={prioritySites.total_pages || 1}
            onPageChange={setPage}
            disabled={tableLoading}
            className="border-t border-[var(--border)] px-4 py-2"
            testIdPrefix="transport"
          />
        </section>
      </main>
    </div>
  );
}

export default function TransportQualityPage() {
  return (
    <TransportQualityErrorBoundary>
      <TransportQualityDashboard />
    </TransportQualityErrorBoundary>
  );
}
