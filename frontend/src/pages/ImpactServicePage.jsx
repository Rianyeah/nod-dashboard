import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import Breadcrumb from '../components/Breadcrumb';
import ImpactServiceAlarmDialog from '../features/impact-service/ImpactServiceAlarmDialog';
import ImpactServiceAlarmTable from '../features/impact-service/ImpactServiceAlarmTable';
import ImpactServiceCharts from '../features/impact-service/ImpactServiceCharts';
import ImpactServiceFilters from '../features/impact-service/ImpactServiceFilters';
import ImpactServiceHeader from '../features/impact-service/ImpactServiceHeader';
import ImpactServiceKpiGrid from '../features/impact-service/ImpactServiceKpiGrid';
import ImpactServicePrintAlarmTable from '../features/impact-service/ImpactServicePrintAlarmTable';
import {
  ImpactServiceAlert,
  ImpactServiceErrorBoundary,
} from '../features/impact-service/ImpactServiceStates';
import ImpactServiceTopAlarms from '../features/impact-service/ImpactServiceTopAlarms';
import {
  formatLocalDate,
  getSevenDayWindow,
} from '../features/impact-service/impactServiceDateRange';
import {
  fetchImpactServiceAlarmDetail,
  fetchImpactServiceAlarms,
  fetchImpactServiceDailyTrend,
  fetchImpactServiceDistributions,
  fetchImpactServiceFilters,
  fetchImpactServiceSummary,
  fetchImpactServiceTopAlarms,
  fetchImpactServiceTopSites,
} from '../services/api';

const TABLE_LIMIT = 20;
const EMPTY_FILTERS = {
  min_date: null,
  max_date: null,
  today: null,
  default_date: null,
  has_today_data: false,
  nops: [],
};
const EMPTY_DISTRIBUTIONS = {
  by_severity: [],
  by_category: [],
  by_aging_range: [],
  by_sow: [],
  by_nop: [],
};
const EMPTY_ALARMS = {
  items: [],
  total: 0,
  page: 1,
  limit: TABLE_LIMIT,
  total_pages: 0,
};

function ImpactServiceDashboard() {
  const navigate = useNavigate();
  const [filterOptions, setFilterOptions] = useState(EMPTY_FILTERS);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedNop, setSelectedNop] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('tanggal');
  const [sortDir, setSortDir] = useState('desc');

  const [summary, setSummary] = useState(null);
  const [dailyTrend, setDailyTrend] = useState([]);
  const [distributions, setDistributions] = useState(EMPTY_DISTRIBUTIONS);
  const [topAlarms, setTopAlarms] = useState([]);
  const [topSites, setTopSites] = useState([]);
  const [alarms, setAlarms] = useState(EMPTY_ALARMS);
  const [printAlarms, setPrintAlarms] = useState(EMPTY_ALARMS);

  const [filtersLoading, setFiltersLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [filterError, setFilterError] = useState(null);
  const [dashboardError, setDashboardError] = useState(null);
  const [tableError, setTableError] = useState(null);
  const [printLoading, setPrintLoading] = useState(false);
  const [printError, setPrintError] = useState(null);

  const [selectedAlarmId, setSelectedAlarmId] = useState(null);
  const [selectedAlarmDetail, setSelectedAlarmDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    fetchImpactServiceFilters()
      .then((filters) => {
        if (cancelled) return;
        if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
          throw new Error('Invalid Impact Service filter response');
        }

        const normalizedFilters = {
          min_date: filters?.min_date || null,
          max_date: filters?.max_date || null,
          today: filters?.today || null,
          default_date: filters?.default_date || null,
          has_today_data: Boolean(filters?.has_today_data),
          nops: Array.isArray(filters?.nops) ? filters.nops : [],
        };
        if (!normalizedFilters.max_date) {
          throw new Error('Impact Service filter response is missing max_date');
        }

        const defaultDate = normalizedFilters.default_date || normalizedFilters.max_date;
        setFilterOptions(normalizedFilters);
        setStartDate(defaultDate);
        setEndDate(defaultDate);
      })
      .catch((error) => {
        console.error('Failed to load Impact Service filters:', error);
        if (!cancelled) setFilterError('Gagal memuat filter Impact Service.');
      })
      .finally(() => {
        if (!cancelled) setFiltersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const hasValidDateRange = Boolean(startDate && endDate && startDate <= endDate);

  const dashboardParams = useMemo(() => ({
    start_date: startDate,
    end_date: endDate,
    nop: selectedNop || undefined,
  }), [endDate, selectedNop, startDate]);

  const trendParams = useMemo(() => ({
    ...getSevenDayWindow(endDate),
    nop: selectedNop || undefined,
  }), [endDate, selectedNop]);

  const tableParams = useMemo(() => ({
    ...dashboardParams,
    status: statusFilter || undefined,
    severity: severityFilter || undefined,
    q: deferredSearchTerm.trim() || undefined,
    page,
    limit: TABLE_LIMIT,
    sort_by: sortBy,
    sort_dir: sortDir,
  }), [
    dashboardParams,
    deferredSearchTerm,
    page,
    severityFilter,
    sortBy,
    sortDir,
    statusFilter,
  ]);

  const detailParams = useMemo(() => ({
    ...dashboardParams,
  }), [dashboardParams]);

  useEffect(() => {
    if (!hasValidDateRange) return undefined;
    let cancelled = false;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDashboardLoading(true);
    setDashboardError(null);

    Promise.all([
      fetchImpactServiceSummary(dashboardParams),
      fetchImpactServiceDailyTrend(trendParams),
      fetchImpactServiceDistributions(dashboardParams),
      fetchImpactServiceTopAlarms(dashboardParams),
      fetchImpactServiceTopSites(dashboardParams),
    ])
      .then(([nextSummary, nextTrend, nextDistributions, nextTopAlarms, nextTopSites]) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setDailyTrend(nextTrend);
        setDistributions(nextDistributions);
        setTopAlarms(nextTopAlarms);
        setTopSites(nextTopSites);
      })
      .catch((error) => {
        console.error('Failed to refresh Impact Service dashboard:', error);
        if (!cancelled) {
          setDashboardError('Data lama tetap ditampilkan. Periksa koneksi lalu coba ubah filter kembali.');
        }
      })
      .finally(() => {
        if (!cancelled) setDashboardLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dashboardParams, hasValidDateRange, trendParams]);

  useEffect(() => {
    if (!hasValidDateRange) return undefined;
    let cancelled = false;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTableLoading(true);
    setTableError(null);

    fetchImpactServiceAlarms(tableParams)
      .then((nextAlarms) => {
        if (!cancelled) setAlarms(nextAlarms);
      })
      .catch((error) => {
        console.error('Failed to refresh Impact Service alarm table:', error);
        if (!cancelled) {
          setTableError('Tabel gagal diperbarui. Data tabel sebelumnya tetap ditampilkan.');
        }
      })
      .finally(() => {
        if (!cancelled) setTableLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasValidDateRange, tableParams]);

  useEffect(() => {
    if (!selectedAlarmId || !hasValidDateRange) return undefined;
    let cancelled = false;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetailLoading(true);
    setDetailError(null);

    fetchImpactServiceAlarmDetail(selectedAlarmId, detailParams)
      .then((detail) => {
        if (!cancelled) setSelectedAlarmDetail(detail);
      })
      .catch((error) => {
        console.error('Failed to load Impact Service alarm detail:', error);
        if (!cancelled) setDetailError('Detail alarm tidak dapat dimuat.');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailParams, hasValidDateRange, selectedAlarmId]);

  const handleApplyRange = useCallback((range) => {
    setStartDate(formatLocalDate(range.from));
    setEndDate(formatLocalDate(range.to));
    setPage(1);
  }, []);

  const handleNopChange = useCallback((value) => {
    setSelectedNop(value);
    setPage(1);
  }, []);

  const handleReset = useCallback(() => {
    const defaultDate = filterOptions.default_date || filterOptions.max_date || '';
    setStartDate(defaultDate);
    setEndDate(defaultDate);
    setSelectedNop(null);
    setPage(1);
  }, [filterOptions.default_date, filterOptions.max_date]);

  const handleSearchChange = useCallback((value) => {
    setSearchTerm(value);
    setPage(1);
  }, []);

  const handleStatusChange = useCallback((value) => {
    setStatusFilter(value);
    setPage(1);
  }, []);

  const handleSeverityChange = useCallback((value) => {
    setSeverityFilter(value);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((nextSortBy) => {
    const nextSortDir = sortBy === nextSortBy
      ? (sortDir === 'asc' ? 'desc' : 'asc')
      : (nextSortBy === 'tanggal' ? 'desc' : 'asc');
    setSortBy(nextSortBy);
    setSortDir(nextSortDir);
    setPage(1);
  }, [sortBy, sortDir]);

  const handleResetTable = useCallback(() => {
    setSearchTerm('');
    setStatusFilter('');
    setSeverityFilter('');
    setSortBy('tanggal');
    setSortDir('desc');
    setPage(1);
  }, []);

  const handlePrint = useCallback(async () => {
    if (!hasValidDateRange || printLoading) return;

    setPrintLoading(true);
    setPrintError(null);
    try {
      const nextPrintAlarms = await fetchImpactServiceAlarms({
        ...dashboardParams,
        status: 'OPEN',
        page: 1,
        limit: 100,
        sort_by: 'severity',
        sort_dir: 'asc',
      });
      setPrintAlarms(nextPrintAlarms);

      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });

      const previousTitle = document.title;
      document.title = `Impact Service - ${startDate} - ${endDate} - ${selectedNop || 'Semua NOP'}`;
      try {
        window.print();
      } finally {
        document.title = previousTitle;
      }
    } catch (error) {
      console.error('Failed to prepare Impact Service report:', error);
      setPrintError('Laporan gagal disiapkan. Data pada layar tidak berubah.');
    } finally {
      setPrintLoading(false);
    }
  }, [
    dashboardParams,
    endDate,
    hasValidDateRange,
    printLoading,
    selectedNop,
    startDate,
  ]);

  const closeDetail = useCallback(() => {
    setSelectedAlarmId(null);
    setSelectedAlarmDetail(null);
    setDetailError(null);
  }, []);

  return (
    <div className="impact-service-report-root flex min-h-screen flex-col bg-background text-foreground">
      <ImpactServiceHeader
        startDate={startDate}
        endDate={endDate}
        onBack={() => navigate('/home')}
        onPrint={handlePrint}
        printLoading={printLoading}
      >
        <ImpactServiceFilters
          key={`${startDate}-${endDate}`}
          startDate={startDate}
          endDate={endDate}
          minDate={filterOptions.min_date}
          nops={filterOptions.nops}
          selectedNop={selectedNop}
          onApplyRange={handleApplyRange}
          onNopChange={handleNopChange}
          onReset={handleReset}
          disabled={filtersLoading}
        />
      </ImpactServiceHeader>

      <div className="impact-service-no-print">
        <Breadcrumb />
      </div>

      <main className="flex-1 space-y-3 overflow-y-auto p-3 lg:p-4">
        {!hasValidDateRange && !filtersLoading && (
          <ImpactServiceAlert title="Rentang tanggal tidak valid">
            Pastikan tanggal mulai tidak melebihi tanggal akhir.
          </ImpactServiceAlert>
        )}
        {filterError && <ImpactServiceAlert title="Filter tidak tersedia">{filterError}</ImpactServiceAlert>}
        {dashboardError && <ImpactServiceAlert>{dashboardError}</ImpactServiceAlert>}
        {tableError && <ImpactServiceAlert title="Tabel tidak dapat diperbarui">{tableError}</ImpactServiceAlert>}
        {printError && <ImpactServiceAlert title="Laporan tidak dapat dibuat">{printError}</ImpactServiceAlert>}

        <ImpactServiceKpiGrid
          summary={summary}
          loading={dashboardLoading || filtersLoading}
          isSingleDayRange={startDate === endDate}
        />

        <ImpactServiceCharts
          dailyTrend={dailyTrend}
          distributions={distributions}
          topSites={topSites}
          selectedNop={selectedNop}
        />

        <ImpactServiceTopAlarms rows={topAlarms} />

        <ImpactServiceAlarmTable
          alarms={alarms}
          loading={tableLoading || filtersLoading}
          searchTerm={searchTerm}
          statusFilter={statusFilter}
          severityFilter={severityFilter}
          selectedNop={selectedNop}
          page={page}
          sortBy={sortBy}
          sortDir={sortDir}
          onSearchChange={handleSearchChange}
          onStatusChange={handleStatusChange}
          onSeverityChange={handleSeverityChange}
          onSortChange={handleSortChange}
          onResetTable={handleResetTable}
          onPageChange={setPage}
          onSelectAlarm={setSelectedAlarmId}
        />

        <ImpactServicePrintAlarmTable alarms={printAlarms} selectedNop={selectedNop} />
      </main>

      <ImpactServiceAlarmDialog
        open={Boolean(selectedAlarmId)}
        detail={selectedAlarmDetail}
        loading={detailLoading}
        error={detailError}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      />
    </div>
  );
}

export default function ImpactServicePage() {
  return (
    <ImpactServiceErrorBoundary>
      <ImpactServiceDashboard />
    </ImpactServiceErrorBoundary>
  );
}
