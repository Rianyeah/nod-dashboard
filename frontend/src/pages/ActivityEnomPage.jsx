/* eslint-disable react-hooks/set-state-in-effect */
import { Component, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  CaretUpDownIcon,
  CaretUpIcon,
} from '@phosphor-icons/react';
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import {
  DashboardCombobox,
  DashboardFilterBar,
  DashboardFilterSelect,
  DashboardPagination,
  DashboardPeriodPicker,
  DashboardSearchInput,
  DashboardTableToolbar,
} from '../components/dashboard-filters/DashboardFilters';
import { cn } from '../lib/utils';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ACTIVITY_CHART_COLORS } from '../features/activity-enom/activityEnomChartConfig';
import { ActivityEnomCharts } from '../features/activity-enom/ActivityEnomCharts';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
  DashboardKpiCard,
  DashboardStatusBadge,
  DashboardTableShell,
} from '../components/ui/DashboardPrimitives';
import {
  fetchActivityEnomActivities,
  fetchActivityEnomActivityDetail,
  fetchActivityEnomBreakdowns,
  fetchActivityEnomFilters,
  fetchActivityEnomSummary,
  fetchActivityEnomTopActivities,
  fetchActivityEnomTrend,
} from '../services/api';
import { formatNumber } from '../utils/formatters';

const TABLE_LIMIT = 20;
const MONTH_FORMATTER = new Intl.DateTimeFormat('id-ID', { month: 'long' });
const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });

const ACTIVITY_TABLE_COLUMNS = [
  { sortKey: 'create_date', label: 'Bulan' },
  { sortKey: 'site_id', label: 'Site ID' },
  { sortKey: 'site_name', label: 'Site Name' },
  { sortKey: 'nop', label: 'NOP' },
  { sortKey: 'kabupaten', label: 'Kabupaten' },
  { sortKey: 'part', label: 'Kategori' },
  { sortKey: 'activity', label: 'Activity' },
  { sortKey: 'status', label: 'Status' },
  { sortKey: 'week_done', label: 'Week Done' },
  { sortKey: 'date_done', label: 'Date Done' },
];

class ActivityEnomErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Activity ENOM render failed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--bg-base)] p-6 text-[var(--text-primary)]">
          <section className="glass-card mx-auto mt-16 max-w-xl p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10">
                <ClipboardList className="size-5 text-amber-300" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Activity ENOM</h1>
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

function asDisplay(value) {
  if (value == null || value === '') return '-';
  return String(value);
}

function formatDateLabel(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`));
}

function formatMonthLabel(value, withYear = false) {
  if (!value) return '-';
  const formatter = withYear ? MONTH_YEAR_FORMATTER : MONTH_FORMATTER;
  return formatter.format(new Date(`${value}T00:00:00`));
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return '0%';
  return `${Number(value).toFixed(1).replace('.', ',')}%`;
}

function StatusBadge({ value }) {
  const status = String(value || '').toUpperCase();
  const tone = status === 'OPEN' ? 'danger' : status === 'CLOSE' ? 'success' : 'neutral';
  return <DashboardStatusBadge tone={tone}>{status || '-'}</DashboardStatusBadge>;
}

function ActivityDetailModal({ detail, loading, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const fields = [
    ['Source Row', detail?.source_row_number],
    ['Bulan', detail?.create_date ? formatMonthLabel(detail.create_date, true) : '-'],
    ['Site ID', detail?.site_id],
    ['Site Name', detail?.site_name],
    ['NOP', detail?.nop],
    ['Kabupaten', detail?.kabupaten],
    ['Kategori', detail?.part],
    ['Activity', detail?.activity],
    ['Status', detail?.status],
    ['Week Done', detail?.week_done],
    ['Date Done', detail?.date_done ? formatDateLabel(detail.date_done) : '-'],
    ['Baseline Activity', detail?.baseline_activity],
    ['Info', detail?.info],
    ['Analisis', detail?.analisis],
    ['Remark 1', detail?.remark_1],
    ['Remark 2', detail?.remark_2],
    ['Milestone', detail?.milestone],
    ['XCEK', detail?.xcek],
    ['Workshop', detail?.workshop],
    ['Target Workshop', detail?.target_workshop],
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--overlay-scrim)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Activity ENOM detail"
        className="glass-card max-h-[86vh] w-full max-w-4xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Activity Detail</p>
            <h2 className="mt-1 truncate text-lg font-bold text-[var(--text-primary)]">
              {loading ? 'Loading activity...' : asDisplay(detail?.activity)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
            aria-label="Close activity detail"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[calc(86vh-82px)] overflow-y-auto p-5">
          {loading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {Array.from({ length: 10 }, (_, index) => <div key={index} className="skeleton h-14 rounded-lg" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {fields.map(([label, value]) => (
                <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/45 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
                  <p className="mt-1 break-words text-sm text-[var(--text-primary)]">{asDisplay(value)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ActivityEnomDashboard() {
  const navigate = useNavigate();
  const [filterOptions, setFilterOptions] = useState({ months: [], nops: [], categories: [], default_month: null });
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedNop, setSelectedNop] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('create_date');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [breakdowns, setBreakdowns] = useState({
    breakdown_title: 'NOP Contribution',
    ranking_title: 'Ranking NOP',
    contribution: [],
    ranking: [],
    by_category: [],
    by_status: [],
    by_week_done: [],
  });
  const [topActivities, setTopActivities] = useState([]);
  const [activities, setActivities] = useState({ items: [], total: 0, page: 1, limit: TABLE_LIMIT, total_pages: 0 });
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedActivityId, setSelectedActivityId] = useState(null);
  const [selectedActivityDetail, setSelectedActivityDetail] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchActivityEnomFilters()
      .then((data) => {
        if (cancelled) return;
        const months = Array.isArray(data?.months) ? data.months : [];
        const defaultMonth = data?.default_month || months[0]?.value || '';
        setFilterOptions({
          months,
          nops: Array.isArray(data?.nops) ? data.nops : [],
          categories: Array.isArray(data?.categories) ? data.categories : [],
          default_month: data?.default_month || null,
        });
        setSelectedMonth(defaultMonth);
        setFiltersLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to load Activity ENOM filters:', err);
        if (!cancelled) {
          setError('Gagal memuat filter Activity ENOM.');
          setDashboardLoading(false);
          setTableLoading(false);
          setFiltersLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [selectedMonth, selectedNop, selectedCategory, statusFilter, search, sortBy, sortDir]);

  const debouncedSearch = useDebouncedValue(search, 300);

  const dashboardParams = useMemo(() => ({
    month_date: selectedMonth,
    nop: selectedNop || undefined,
    category: selectedCategory || undefined,
  }), [selectedCategory, selectedMonth, selectedNop]);

  const tableParams = useMemo(() => ({
    ...dashboardParams,
    status: statusFilter || undefined,
    q: debouncedSearch.trim() || undefined,
    page,
    limit: TABLE_LIMIT,
    sort_by: sortBy,
    sort_dir: sortDir,
  }), [dashboardParams, debouncedSearch, page, sortBy, sortDir, statusFilter]);

  useEffect(() => {
    if (!selectedMonth) return;
    let cancelled = false;
    setDashboardLoading(true);
    setError(null);
    Promise.all([
      fetchActivityEnomSummary(dashboardParams),
      fetchActivityEnomTrend(dashboardParams),
      fetchActivityEnomBreakdowns(dashboardParams),
      fetchActivityEnomTopActivities({ ...dashboardParams, limit: 10 }),
    ])
      .then(([nextSummary, nextTrend, nextBreakdowns, nextTopActivities]) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setTrend(nextTrend || []);
        setBreakdowns(nextBreakdowns || {});
        setTopActivities(nextTopActivities || []);
      })
      .catch((err) => {
        console.error('Failed to load Activity ENOM dashboard:', err);
        if (!cancelled) setError('Gagal memuat data Activity ENOM.');
      })
      .finally(() => {
        if (!cancelled) setDashboardLoading(false);
      });
    return () => { cancelled = true; };
  }, [dashboardParams, selectedMonth]);

  useEffect(() => {
    if (!selectedMonth) return;
    let cancelled = false;
    setTableLoading(true);
    fetchActivityEnomActivities(tableParams)
      .then((nextActivities) => {
        if (!cancelled) {
          setActivities(nextActivities || {
            items: [],
            total: 0,
            page: 1,
            limit: TABLE_LIMIT,
            total_pages: 0,
          });
        }
      })
      .catch((err) => {
        console.error('Failed to load Activity ENOM table:', err);
        if (!cancelled) setError('Gagal memuat tabel Activity ENOM.');
      })
      .finally(() => {
        if (!cancelled) setTableLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedMonth, tableParams]);

  useEffect(() => {
    if (!selectedActivityId || !selectedMonth) return;
    let cancelled = false;
    setModalLoading(true);
    setSelectedActivityDetail(null);
    fetchActivityEnomActivityDetail(selectedActivityId, dashboardParams)
      .then((detail) => {
        if (!cancelled) setSelectedActivityDetail(detail);
      })
      .catch((err) => {
        console.error('Failed to load Activity ENOM detail:', err);
        if (!cancelled) setSelectedActivityId(null);
      })
      .finally(() => {
        if (!cancelled) setModalLoading(false);
      });
    return () => { cancelled = true; };
  }, [dashboardParams, selectedActivityId, selectedMonth]);

  const closeModal = useCallback(() => {
    setSelectedActivityId(null);
    setSelectedActivityDetail(null);
  }, []);

  const monthOptions = useMemo(() => (
    (filterOptions.months || []).map((month) => ({
      value: month.value,
      label: formatMonthLabel(month.value),
    }))
  ), [filterOptions.months]);

  const contributionTitle = selectedNop ? 'Kabupaten Contribution' : 'NOP Contribution';
  const rankingTitle = selectedNop ? 'Ranking Kabupaten' : 'Ranking NOP';
  const totalPages = activities.total_pages || 0;
  const resetTableFilters = () => {
    setSearch('');
    setStatusFilter('');
    setSortBy('create_date');
    setSortDir('desc');
    setPage(1);
  };
  const handleTableSort = useCallback((columnKey) => {
    if (sortBy === columnKey) {
      setSortDir((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(columnKey);
      setSortDir('asc');
    }
    setPage(1);
  }, [sortBy]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg-base)]">
      <header className="border-b border-[var(--border)] bg-[var(--bg-header)] px-6 py-4 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border-light)] text-[var(--text-muted)] transition-colors hover:border-[var(--primary)]/30 hover:bg-[var(--primary)]/10 hover:text-[var(--primary-light)]"
              aria-label="Back to home"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="flex size-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10">
              <ClipboardList className="size-5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight text-[var(--text-primary)]">Activity ENOM</h1>
              <p className="truncate text-xs text-[var(--text-muted)]">
                Proker operational activity - {formatMonthLabel(selectedMonth, true)}
              </p>
            </div>
          </div>
          <DashboardFilterBar className="w-full border-0 bg-transparent p-0 shadow-none md:w-auto">
            <DashboardPeriodPicker
              id="activity-enom-month"
              label="Bulan"
              value={selectedMonth}
              onChange={setSelectedMonth}
              options={monthOptions}
              includeAll={false}
            />
            <DashboardCombobox
              id="activity-enom-nop"
              label="NOP"
              value={selectedNop}
              onChange={setSelectedNop}
              options={filterOptions.nops}
              allLabel="Semua NOP"
            />
            <DashboardCombobox
              id="activity-enom-category"
              label="Kategori"
              value={selectedCategory}
              onChange={setSelectedCategory}
              options={filterOptions.categories}
              allLabel="Semua Kategori"
            />
          </DashboardFilterBar>
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

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {dashboardLoading && !summary ? (
            Array.from({ length: 5 }, (_, index) => <div key={index} className="skeleton h-[96px] rounded-xl" />)
          ) : (
            <>
              <DashboardKpiCard title="Total Activity" value={formatNumber(summary?.total_activity)} icon={ClipboardList} accent={ACTIVITY_CHART_COLORS.total} glow="rgba(96,165,250,0.14)" />
              <DashboardKpiCard title="Impacted Site" value={formatNumber(summary?.impacted_sites)} icon={Users} accent={ACTIVITY_CHART_COLORS.sites} glow="rgba(167,139,250,0.14)" />
              <DashboardKpiCard title="OPEN Activity" value={formatNumber(summary?.open_activity)} icon={Activity} accent={ACTIVITY_CHART_COLORS.open} glow="rgba(239,68,68,0.14)" />
              <DashboardKpiCard title="CLOSE Activity" value={formatNumber(summary?.close_activity)} icon={CheckCircle2} accent={ACTIVITY_CHART_COLORS.close} glow="rgba(16,185,129,0.14)" />
              <DashboardKpiCard title="Completion Rate" value={formatPercent(summary?.completion_rate)} icon={TrendingUp} accent={ACTIVITY_CHART_COLORS.category} glow="rgba(245,158,11,0.14)" />
            </>
          )}
        </section>

        <ActivityEnomCharts
          trend={trend}
          breakdowns={breakdowns}
          selectedNop={selectedNop}
          rankingTitle={rankingTitle}
          contributionTitle={contributionTitle}
          formatMonthLabel={formatMonthLabel}
          topActivities={topActivities}
        />

        <DashboardTableShell
          title="Activity Detail Table"
          icon={ClipboardList}
          count={`${formatNumber(activities.total)} rows`}
          action={(
            <DashboardTableToolbar
              data-testid="activity-enom-table-toolbar"
              className="w-full items-center lg:w-auto lg:flex-nowrap [&>div:first-child]:items-center [&>div:first-child]:lg:flex-nowrap"
            >
              <DashboardSearchInput
                id="activity-enom-search"
                value={search}
                onChange={setSearch}
                placeholder="Search site, activity, kabupaten..."
                className="min-w-[240px] sm:max-w-[360px]"
              />
              <DashboardFilterSelect
                id="activity-enom-status"
                label=""
                ariaLabel="Filter status activity"
                value={statusFilter}
                onChange={setStatusFilter}
                options={['OPEN', 'CLOSE']}
                allLabel="Semua Status"
                triggerClassName="min-w-[132px]"
              />
              <Badge variant="outline" className="h-8 shrink-0">
                {selectedNop || 'Semua NOP'}
              </Badge>
              <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={resetTableFilters}>
                <ArrowCounterClockwiseIcon data-icon="inline-start" />
                Reset tabel
              </Button>
            </DashboardTableToolbar>
          )}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  {ACTIVITY_TABLE_COLUMNS.map((column) => {
                    const isActive = sortBy === column.sortKey;
                    const ariaSort = isActive
                      ? (sortDir === 'asc' ? 'ascending' : 'descending')
                      : 'none';
                    const nextDirection = isActive && sortDir === 'asc' ? 'descending' : 'ascending';

                    return (
                      <th
                        key={column.sortKey}
                        aria-sort={ariaSort}
                        className="sticky top-0 z-10 whitespace-nowrap bg-[var(--bg-elevated)] px-1 py-1.5"
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          data-testid={`activity-enom-sort-${column.sortKey}`}
                          aria-label={`Urutkan ${column.label} ${nextDirection}`}
                          title={`Urutkan ${column.label} ${nextDirection}`}
                          onClick={() => handleTableSort(column.sortKey)}
                          className={cn(
                            'h-7 justify-start gap-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]',
                            isActive && 'text-[var(--primary-light)]',
                          )}
                        >
                          <span>{column.label}</span>
                          {isActive ? (
                            sortDir === 'asc'
                              ? <CaretUpIcon data-icon="inline-end" />
                              : <CaretDownIcon data-icon="inline-end" />
                          ) : (
                            <CaretUpDownIcon data-icon="inline-end" className="opacity-45" />
                          )}
                        </Button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {tableLoading && !activities.items.length ? (
                  Array.from({ length: 8 }, (_, index) => (
                    <tr key={index}>
                      <td colSpan={10} className="px-3 py-2"><div className="skeleton h-9 rounded-lg" /></td>
                    </tr>
                  ))
                ) : activities.items.length ? (
                  activities.items.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedActivityId(row.id)}
                      className="cursor-pointer transition-colors hover:bg-[var(--bg-hover)]/60"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--text-secondary)]">{formatMonthLabel(row.create_date)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-semibold text-[var(--primary-light)]">{asDisplay(row.site_id)}</td>
                      <td className="min-w-[180px] px-3 py-2.5 text-xs text-[var(--text-primary)]">{asDisplay(row.site_name)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--text-secondary)]">{asDisplay(row.nop)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--text-secondary)]">{asDisplay(row.kabupaten)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--text-secondary)]">{asDisplay(row.part)}</td>
                      <td className="min-w-[240px] px-3 py-2.5 text-xs font-medium text-[var(--text-primary)]">{asDisplay(row.activity)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5"><StatusBadge value={row.status} /></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--text-secondary)]">{asDisplay(row.week_done)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--text-secondary)]">{row.date_done ? formatDateLabel(row.date_done) : '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">
                      Tidak ada activity untuk filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <DashboardPagination
            page={activities.page || page}
            totalPages={totalPages || 1}
            onPageChange={setPage}
            disabled={tableLoading}
            className="border-t border-[var(--border)] px-4 py-2"
            testIdPrefix="activity-enom"
          />
        </DashboardTableShell>

        {!filtersLoaded && <div className="skeleton h-10 rounded-lg" />}
      </main>

      {selectedActivityId && (
        <ActivityDetailModal detail={selectedActivityDetail} loading={modalLoading} onClose={closeModal} />
      )}
    </div>
  );
}

export default function ActivityEnomPage() {
  return (
    <ActivityEnomErrorBoundary>
      <ActivityEnomDashboard />
    </ActivityEnomErrorBoundary>
  );
}
