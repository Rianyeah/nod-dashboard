import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Battery,
  BatteryWarning,
  CheckCircle2,
  Database,
  Monitor,
  Radio,
  TowerControl,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from 'recharts';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import {
  DashboardCombobox,
  DashboardFilterBar,
} from '../components/dashboard-filters/DashboardFilters';
import {
  DashboardChartPanel,
  DashboardKpiCard,
} from '../components/ui/DashboardPrimitives';
import { DashboardChartEmpty } from '../components/dashboard-charts/DashboardChartEmpty';
import { InsideBarValueLabel } from '../components/dashboard-charts/DashboardChartLabels';
import {
  fetchDataPotensiDashboard,
  fetchDataPotensiFilterOptions,
  fetchDataPotensiSites,
  fetchDataPotensiStatusOptions,
  fetchFilterOptions,
  fetchSiteDetail,
} from '../services/api';
import { formatNumber } from '../utils/formatters';
import SiteDetailModal from '../components/SiteDetailModal';
import DataPotensiSiteTable from '../features/data-potensi/DataPotensiSiteTable';
import { DATA_POTENSI_ADVANCED_FILTERS } from '../features/data-potensi/dataPotensiFilters';

/* ─── Constants ────────────────────────────────────────── */

const DONUT_COLORS = [
  '#6366F1', '#22D3EE', '#F59E0B', '#10B981', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#06B6D4',
  '#A855F7', '#84CC16',
];

const STACKED_COLORS = [
  '#6366F1', '#22D3EE', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#06B6D4',
  '#A855F7', '#84CC16', '#64748B', '#FB923C',
];

const BADGE_OPTIONS = [
  { key: 'battery', label: 'Type Battery' },
  { key: 'rectifier', label: 'Jenis Rectifier' },
  { key: 'belting', label: 'Belting Battery' },
  { key: 'backup_time', label: 'Backup Time Battery' },
];

const TABLE_LIMIT = 20;
const EMPTY_SITES = {
  data: [],
  total: 0,
  page: 1,
  limit: TABLE_LIMIT,
  total_pages: 0,
};
const EMPTY_FILTER_OPTIONS = {
  clusters: [],
  kabupaten: [],
  site_classes: [],
  type_sites: [],
  transport_types: [],
  battery_types: [],
  tower_providers: [],
};
const EMPTY_ADVANCED_FILTERS = Object.fromEntries(
  DATA_POTENSI_ADVANCED_FILTERS.map(({ key }) => [key, '']),
);

/* ── Site Class colors matching Reporting page ── */
const CLASS_COLORS = {
  diamond: { bg: 'rgba(96, 165, 250, 0.15)', text: '#60A5FA', fill: '#60A5FA' },
  platinum: { bg: 'rgba(168, 162, 158, 0.15)', text: '#A8A29E', fill: '#A8A29E' },
  gold: { bg: 'rgba(251, 191, 36, 0.15)', text: '#FBBF24', fill: '#FBBF24' },
  silver: { bg: 'rgba(148, 163, 184, 0.15)', text: '#94A3B8', fill: '#94A3B8' },
  bronze: { bg: 'rgba(217, 119, 6, 0.15)', text: '#D97706', fill: '#D97706' },
};

function getClassColor(label) {
  if (!label) return { bg: 'rgba(255,255,255,0.06)', text: 'var(--text-secondary)', fill: '#64748B' };
  const key = label.toLowerCase().trim();
  return CLASS_COLORS[key] || { bg: 'rgba(255,255,255,0.06)', text: 'var(--text-secondary)', fill: DONUT_COLORS[0] };
}

/* ─── Donut Chart ──────────────────────────────────────── */

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="min-w-[110px] rounded-lg border border-[var(--chart-tooltip-border)] bg-[var(--chart-tooltip-bg)] px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-[var(--text-primary)]">{item.name}</p>
      <p className="font-mono font-medium" style={{ color: item.payload?.fill }}>
        {formatNumber(item.value)} ({item.payload?.percentage?.toFixed(1)}%)
      </p>
    </div>
  );
}

function DonutLegend({ data, colorFn }) {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1.5">
      {data.map((item, i) => {
        const color = colorFn ? colorFn(item.label) : DONUT_COLORS[i % DONUT_COLORS.length];
        return (
          <div key={item.label} className="flex items-center gap-1.5 text-[10px]">
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: typeof color === 'string' ? color : color.fill }}
            />
            <span className="text-[var(--text-secondary)]">
              {item.label} <span className="font-mono font-semibold text-[var(--text-primary)]">{formatNumber(item.value)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ data, title, icon, colorFn }) {
  const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);

  return (
    <DashboardChartPanel title={title} icon={icon}>
      {data.length ? <div className="flex flex-col items-center">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((item, i) => {
                const fill = colorFn
                  ? (typeof colorFn(item.label) === 'string' ? colorFn(item.label) : colorFn(item.label).fill)
                  : DONUT_COLORS[i % DONUT_COLORS.length];
                return <Cell key={i} fill={fill} />;
              })}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
            <text x="50%" y="44%" textAnchor="middle" dominantBaseline="central"
              className="fill-[var(--text-primary)]"
              style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>
              {formatNumber(total)}
            </text>
            <text x="50%" y="56%" textAnchor="middle" dominantBaseline="central"
              className="fill-[var(--text-muted)]"
              style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Total
            </text>
          </PieChart>
        </ResponsiveContainer>
        <DonutLegend data={data} colorFn={colorFn ? (label) => colorFn(label) : null} />
      </div> : <DashboardChartEmpty className="h-[260px]" />}
    </DashboardChartPanel>
  );
}

/* ─── Stacked Bar Chart (breakdown by Kabupaten) ───────── */

function StackedBarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[130px] rounded-lg border border-[var(--chart-tooltip-border)] bg-[var(--chart-tooltip-bg)] px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-[var(--text-primary)]">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="font-mono font-medium" style={{ color: item.fill }}>
          {item.dataKey}: {formatNumber(item.value)}
        </p>
      ))}
    </div>
  );
}

function StackedBarSection({ data, activeBadge, onBadgeChange }) {
  const { chartData, categories } = useMemo(() => {
    const catSet = new Set();
    const rows = data.map((item) => {
      const row = { kabupaten: item.cluster }; // backend reuses "cluster" field for kabupaten
      let total = 0;
      for (const [cat, count] of Object.entries(item.categories)) {
        row[cat] = count;
        total += count;
        catSet.add(cat);
      }
      row._total = total;
      return row;
    });
    return { chartData: rows, categories: [...catSet] };
  }, [data]);

  return (
    <DashboardChartPanel title="Breakdown by Kabupaten" icon={Database}>
      {/* Badge selector */}
      <div className="mb-4 flex flex-wrap gap-2">
        {BADGE_OPTIONS.map((opt) => (
          <Button
            key={opt.key}
            type="button"
            size="xs"
            variant={activeBadge === opt.key ? 'default' : 'outline'}
            onClick={() => onBadgeChange(opt.key)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Chart */}
      {chartData.length ? <ResponsiveContainer width="100%" height={Math.max(320, chartData.length * 40)}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 50, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
          <XAxis type="number" tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} />
          <YAxis
            dataKey="kabupaten"
            type="category"
            width={140}
            tick={{ fill: 'var(--chart-axis)', fontSize: 10 }}
          />
          <Tooltip content={<StackedBarTooltip />} cursor={{ fill: 'var(--chart-cursor)' }} />
          <Legend
            wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
            iconType="square"
            iconSize={10}
          />
          {categories.map((cat, i) => (
            <Bar
              key={cat}
              dataKey={cat}
              stackId="stack"
              fill={STACKED_COLORS[i % STACKED_COLORS.length]}
              radius={i === categories.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
            >
              <LabelList
                dataKey={cat}
                content={(
                  <InsideBarValueLabel
                    color={['#22D3EE', '#10B981', '#F59E0B', '#84CC16', '#FB923C']
                      .includes(STACKED_COLORS[i % STACKED_COLORS.length])
                      ? '#052E24'
                      : '#FFFFFF'}
                  />
                )}
              />
              {/* Label on last bar of each stack */}
              {i === categories.length - 1 && (
                <LabelList
                  valueAccessor={(entry) => entry._total}
                  position="right"
                  formatter={(val) => val > 0 ? formatNumber(val) : ''}
                  style={{ fontSize: '10px', fontWeight: 600, fill: 'var(--text-secondary)' }}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer> : <DashboardChartEmpty className="h-[320px]" />}
    </DashboardChartPanel>
  );
}

/* ─── TP Distribution Chart ────────────────────────────── */

function TpTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[110px] rounded-lg border border-[var(--chart-tooltip-border)] bg-[var(--chart-tooltip-bg)] px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-[var(--text-primary)]">{label}</p>
      <p className="font-mono font-medium text-[var(--primary-light)]">
        {formatNumber(payload[0].value)} sites
      </p>
    </div>
  );
}

function TpDistributionChart({ data }) {
  return (
    <DashboardChartPanel title="Tower Provider Distribution" icon={TowerControl}>
      {data.length ? <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 20, right: 20, left: 20, bottom: 50 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="tp"
            tick={{ fill: 'var(--chart-axis)', fontSize: 10 }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} />
          <Tooltip content={<TpTooltip />} cursor={{ fill: 'var(--chart-cursor)' }} />
          <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={48}>
            <LabelList
              dataKey="count"
              position="top"
              formatter={(val) => val > 0 ? formatNumber(val) : ''}
              style={{ fontSize: '10px', fontWeight: 700, fill: 'var(--text-secondary)' }}
            />
            {data.map((_, i) => (
              <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer> : <DashboardChartEmpty className="h-[320px]" />}
    </DashboardChartPanel>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════════ */

export default function DataPotensiPage() {
  const navigate = useNavigate();

  const [nopOptions, setNopOptions] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  const [selectedNop, setSelectedNop] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('Active');
  const [advancedFilterOptions, setAdvancedFilterOptions] = useState(EMPTY_FILTER_OPTIONS);
  const [advancedFilters, setAdvancedFilters] = useState({ ...EMPTY_ADVANCED_FILTERS });
  const [filtersReady, setFiltersReady] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filterError, setFilterError] = useState(null);

  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState(null);
  const [activeBadge, setActiveBadge] = useState('battery');

  const [sites, setSites] = useState(EMPTY_SITES);
  const [tableLoading, setTableLoading] = useState(true);
  const [tableError, setTableError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('site_id');
  const [sortDir, setSortDir] = useState('asc');

  const [showModal, setShowModal] = useState(false);
  const [siteDetail, setSiteDetail] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchFilterOptions(), fetchDataPotensiStatusOptions()])
      .then(([options, statuses]) => {
        if (cancelled) return;
        setNopOptions(options?.nop || []);
        setStatusOptions(statuses || []);
      })
      .catch((error) => {
        console.error('Failed to load Data Potensi filters:', error);
        if (!cancelled) setFilterError('Gagal memuat filter Data Potensi.');
      })
      .finally(() => {
        if (!cancelled) {
          setFiltersReady(true);
          setFiltersLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!filtersReady) return undefined;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilterError(null);

    fetchDataPotensiFilterOptions({
      nop: selectedNop || undefined,
      status_site: selectedStatus || undefined,
    })
      .then((options) => {
        if (!cancelled) setAdvancedFilterOptions({ ...EMPTY_FILTER_OPTIONS, ...options });
      })
      .catch((error) => {
        console.error('Failed to load Data Potensi advanced filters:', error);
        if (!cancelled) setFilterError('Pilihan filter lanjutan tidak dapat diperbarui.');
      });
    return () => { cancelled = true; };
  }, [filtersReady, selectedNop, selectedStatus]);

  const dashboardParams = useMemo(() => ({
    nop: selectedNop || undefined,
    status_site: selectedStatus || undefined,
    cluster: advancedFilters.cluster || undefined,
    kabupaten: advancedFilters.kabupaten || undefined,
    site_class: advancedFilters.site_class || undefined,
    type_site: advancedFilters.type_site || undefined,
    transport_type: advancedFilters.transport_type || undefined,
    type_battery: advancedFilters.type_battery || undefined,
    tp: advancedFilters.tp || undefined,
  }), [advancedFilters, selectedNop, selectedStatus]);

  const tableParams = useMemo(() => ({
    ...dashboardParams,
    q: deferredSearchTerm.trim() || undefined,
    page,
    limit: TABLE_LIMIT,
    sort_by: sortBy,
    sort_dir: sortDir,
  }), [dashboardParams, deferredSearchTerm, page, sortBy, sortDir]);

  useEffect(() => {
    if (!filtersReady) return undefined;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDashboardLoading(true);
    setDashboardError(null);

    fetchDataPotensiDashboard(dashboardParams)
      .then((data) => {
        if (!cancelled) setDashboardData(data);
      })
      .catch((error) => {
        console.error('Failed to refresh Data Potensi dashboard:', error);
        if (!cancelled) {
          setDashboardError('Data lama tetap ditampilkan. Periksa koneksi lalu coba ubah filter kembali.');
        }
      })
      .finally(() => {
        if (!cancelled) setDashboardLoading(false);
      });
    return () => { cancelled = true; };
  }, [dashboardParams, filtersReady]);

  useEffect(() => {
    if (!filtersReady) return undefined;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTableLoading(true);
    setTableError(null);

    fetchDataPotensiSites(tableParams)
      .then((nextSites) => {
        if (!cancelled) {
          setSites({
            ...EMPTY_SITES,
            ...nextSites,
            data: Array.isArray(nextSites?.data) ? nextSites.data : [],
          });
        }
      })
      .catch((error) => {
        console.error('Failed to refresh Data Potensi table:', error);
        if (!cancelled) {
          setTableError('Tabel gagal diperbarui. Data tabel sebelumnya tetap ditampilkan.');
        }
      })
      .finally(() => {
        if (!cancelled) setTableLoading(false);
      });
    return () => { cancelled = true; };
  }, [filtersReady, tableParams]);

  // Stacked bar data based on active badge
  const stackedBarData = useMemo(() => {
    if (!dashboardData) return [];
    const mapping = {
      battery: dashboardData.battery_by_cluster,
      rectifier: dashboardData.rectifier_by_cluster,
      belting: dashboardData.belting_by_cluster,
      backup_time: dashboardData.backup_time_by_cluster,
    };
    return mapping[activeBadge] || [];
  }, [dashboardData, activeBadge]);

  // Handle site click — open detail modal
  const handleSiteClick = useCallback(async (siteId) => {
    try {
      const detail = await fetchSiteDetail(siteId);
      setSiteDetail(detail);
      setShowModal(true);
    } catch (err) {
      console.error('Failed to load site detail:', err);
    }
  }, []);

  // Site class donut color function matching Reporting page
  const siteClassColorFn = useCallback((label) => {
    const colors = getClassColor(label);
    return colors.fill;
  }, []);

  const handleNopChange = useCallback((value) => {
    setSelectedNop(value);
    setAdvancedFilters({ ...EMPTY_ADVANCED_FILTERS });
    setPage(1);
  }, []);

  const handleStatusChange = useCallback((value) => {
    setSelectedStatus(value);
    setAdvancedFilters({ ...EMPTY_ADVANCED_FILTERS });
    setPage(1);
  }, []);

  const handleAdvancedFiltersApply = useCallback((nextFilters) => {
    setAdvancedFilters({ ...EMPTY_ADVANCED_FILTERS, ...nextFilters });
    setPage(1);
  }, []);

  const handleRemoveFilter = useCallback((filterKey) => {
    setAdvancedFilters((current) => ({ ...current, [filterKey]: '' }));
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((value) => {
    setSearchTerm(value);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((nextSortBy) => {
    setSortDir((currentDirection) => (
      sortBy === nextSortBy && currentDirection === 'asc' ? 'desc' : 'asc'
    ));
    setSortBy(nextSortBy);
    setPage(1);
  }, [sortBy]);

  const handleResetTable = useCallback(() => {
    setSearchTerm('');
    setAdvancedFilters({ ...EMPTY_ADVANCED_FILTERS });
    setSortBy('site_id');
    setSortDir('asc');
    setPage(1);
  }, []);

  const sc = dashboardData?.scorecard || {};

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--bg-base)]">
      {/* Header */}
      <header className="relative bg-gradient-to-r from-[var(--bg-base)] via-[var(--bg-surface)] to-[var(--bg-base)] border-b border-[var(--border)]">
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />
        <div className="absolute top-0 left-1/4 w-96 h-1 bg-gradient-to-r from-transparent via-[var(--primary)]/30 to-transparent blur-sm" />

        <div className="relative z-10 px-3 py-3 flex flex-col gap-3 xl:px-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => navigate('/home')}
              aria-label="Back to home"
              className="rounded-xl"
            >
              <ArrowLeft />
            </Button>
            <div className="w-9 h-9 bg-[var(--primary)]/15 rounded-xl flex items-center justify-center border border-[var(--primary)]/20">
              <Database className="w-5 h-5 text-[var(--primary-light)]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-tight text-[var(--text-primary)]">
                DATA POTENSI
              </h1>
              <p className="text-[11px] text-[var(--text-muted)] tracking-wide">
                Site Infrastructure & Asset Analytics
              </p>
            </div>
          </div>

          {/* Filters */}
          <DashboardFilterBar>
            <DashboardCombobox
              id="data-potensi-nop-filter"
              label="NOP"
              value={selectedNop}
              options={nopOptions}
              onChange={handleNopChange}
              allLabel="Semua NOP"
            />
            <DashboardCombobox
              id="data-potensi-status-filter"
              label="Status Site"
              value={selectedStatus}
              options={statusOptions}
              onChange={handleStatusChange}
              allLabel="Semua Status"
            />
          </DashboardFilterBar>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-3 py-4 xl:px-6 space-y-5">
        {filterError ? (
          <Alert variant="destructive">
            <AlertTitle>Filter tidak dapat diperbarui</AlertTitle>
            <AlertDescription>{filterError}</AlertDescription>
          </Alert>
        ) : null}

        {dashboardError ? (
          <Alert variant="destructive">
            <AlertTitle>Dashboard tidak dapat diperbarui</AlertTitle>
            <AlertDescription>{dashboardError}</AlertDescription>
          </Alert>
        ) : null}

        {/* Section 1: Scorecards */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {dashboardLoading && !dashboardData ? (
            Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-[112px] rounded-xl" />
            ))
          ) : (
            <>
          <DashboardKpiCard
            title="Total Sites"
            icon={TowerControl}
            accent="var(--primary-light)"
            glow="var(--primary-light)/15"
            className="animate-fade-in"
          >
            <p className="mt-2 font-mono text-[28px] font-bold leading-none tabular-nums tracking-tight text-[var(--primary-light)]">
              {formatNumber(sc.total_sites)}
            </p>
            <p className="mt-2 text-[10px] text-[var(--text-secondary)]">
              {sc.total_cluster || '—'} Cluster
            </p>
          </DashboardKpiCard>

          <DashboardKpiCard
            title="Site Lithium"
            icon={Battery}
            accent="#10B981"
            glow="rgba(16, 185, 129, 0.15)"
            className="animate-fade-in"
            style={{ animationDelay: '50ms' }}
          >
            <p className="mt-2 font-mono text-[28px] font-bold leading-none tabular-nums tracking-tight" style={{ color: '#10B981' }}>
              {formatNumber(sc.site_lithium)}
            </p>
            <p className="mt-2 text-[10px] text-[var(--text-secondary)]">
              {sc.site_lithium_pct?.toFixed(1) || '0'}% dari total
            </p>
          </DashboardKpiCard>

          <DashboardKpiCard
            title="Site VRLA"
            icon={BatteryWarning}
            accent="#F59E0B"
            glow="rgba(245, 158, 11, 0.15)"
            className="animate-fade-in"
            style={{ animationDelay: '100ms' }}
          >
            <p className="mt-2 font-mono text-[28px] font-bold leading-none tabular-nums tracking-tight" style={{ color: '#F59E0B' }}>
              {formatNumber(sc.site_vrla)}
            </p>
            <p className="mt-2 text-[10px] text-[var(--text-secondary)]">
              {sc.site_vrla_pct?.toFixed(1) || '0'}% dari total
            </p>
          </DashboardKpiCard>

          <DashboardKpiCard
            title="ENVA Validated"
            icon={CheckCircle2}
            accent="#10B981"
            glow="rgba(16, 185, 129, 0.15)"
            className="animate-fade-in"
            style={{ animationDelay: '150ms' }}
          >
            <p className="mt-2 font-mono text-[28px] font-bold leading-none tabular-nums tracking-tight" style={{ color: '#10B981' }}>
              {formatNumber(sc.enva_validated)}
            </p>
            <p className="mt-2 text-[10px] text-[var(--text-secondary)]">
              {sc.enva_validated_pct?.toFixed(1) || '0'}% dari total
            </p>
          </DashboardKpiCard>

          <DashboardKpiCard
            title="Radio IP Transport"
            icon={Radio}
            accent="#3B82F6"
            glow="rgba(59, 130, 246, 0.15)"
            className="animate-fade-in"
            style={{ animationDelay: '200ms' }}
          >
            <p className="mt-2 font-mono text-[28px] font-bold leading-none tabular-nums tracking-tight" style={{ color: '#3B82F6' }}>
              {formatNumber(sc.radio_ip)}
            </p>
            <p className="mt-2 text-[10px] text-[var(--text-secondary)]">
              {sc.radio_ip_pct?.toFixed(1) || '0'}% dari total
            </p>
          </DashboardKpiCard>

          <DashboardKpiCard
            title="BBLTI Software"
            icon={Monitor}
            accent="#A855F7"
            glow="rgba(168, 85, 247, 0.15)"
            className="animate-fade-in"
            style={{ animationDelay: '250ms' }}
          >
            <p className="mt-2 font-mono text-[28px] font-bold leading-none tabular-nums tracking-tight" style={{ color: '#A855F7' }}>
              {formatNumber(sc.bblti_software)}
            </p>
            <p className="mt-2 text-[10px] text-[var(--text-secondary)]">
              {sc.bblti_software_pct?.toFixed(1) || '0'}% dari total
            </p>
          </DashboardKpiCard>
            </>
          )}
        </section>

        {/* Section 2: Donut Charts */}
        {dashboardLoading && !dashboardData ? (
          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-[340px] rounded-xl" />
            ))}
          </section>
        ) : dashboardData ? (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in" style={{ animationDelay: '250ms' }}>
            <DonutChart
              data={dashboardData.cluster_breakdown || []}
              title="Total Site by Kabupaten"
              icon={Database}
            />
            <DonutChart
              data={dashboardData.transport_type_breakdown || []}
              title="Transport Type Distribution"
              icon={Radio}
            />
            <DonutChart
              data={dashboardData.site_class_breakdown || []}
              title="Site Class Distribution"
              icon={TowerControl}
              colorFn={siteClassColorFn}
            />
          </section>
        ) : null}

        {/* Section 3: Stacked Bar with Badge Selector */}
        {dashboardLoading && !dashboardData ? (
          <Skeleton className="h-[420px] rounded-xl" />
        ) : dashboardData ? (
          <section className="animate-fade-in" style={{ animationDelay: '350ms' }}>
            <StackedBarSection
              data={stackedBarData}
              activeBadge={activeBadge}
              onBadgeChange={setActiveBadge}
            />
          </section>
        ) : null}

        {/* Section 4: TP Distribution */}
        {dashboardLoading && !dashboardData ? (
          <Skeleton className="h-[390px] rounded-xl" />
        ) : dashboardData ? (
          <section className="animate-fade-in" style={{ animationDelay: '450ms' }}>
            <TpDistributionChart data={dashboardData.tp_distribution || []} />
          </section>
        ) : null}

        {/* Section 5: Site Detail Table */}
        <section className="animate-fade-in" style={{ animationDelay: '550ms' }}>
          <DataPotensiSiteTable
            sites={sites}
            loading={tableLoading || filtersLoading}
            error={tableError}
            searchTerm={searchTerm}
            advancedFilters={advancedFilters}
            filterOptions={advancedFilterOptions}
            selectedNop={selectedNop}
            page={page}
            sortBy={sortBy}
            sortDir={sortDir}
            onSearchChange={handleSearchChange}
            onAdvancedFiltersApply={handleAdvancedFiltersApply}
            onRemoveFilter={handleRemoveFilter}
            onSortChange={handleSortChange}
            onResetTable={handleResetTable}
            onPageChange={setPage}
            onSelectSite={handleSiteClick}
          />
        </section>
      </main>

      {/* Site Detail Modal (reused from SiteMapPage) */}
      {showModal && siteDetail && (
        <SiteDetailModal
          data={siteDetail}
          onClose={() => {
            setShowModal(false);
            setSiteDetail(null);
          }}
        />
      )}
    </div>
  );
}
