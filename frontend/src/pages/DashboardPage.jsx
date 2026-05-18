import { useState, useCallback, useEffect, useMemo } from 'react';
import Header from '../components/Header';
import SummaryCards from '../components/SummaryCards';
import MapboxMap from '../components/MapboxMap';
import SiteTable from '../components/SiteTable';
import FilterPanel from '../components/FilterPanel';
import SiteDetailModal from '../components/SiteDetailModal';
import WorstSitesPanel from '../components/WorstSitesPanel';
import { useMapData } from '../hooks/useMapData';
import { fetchLatestPeriod, fetchSiteAvailability, fetchSiteDetail, fetchTrend } from '../services/api';
import { ChevronDown, ChevronUp, GripHorizontal } from 'lucide-react';

function normalizeSiteFocusData(site, siteId) {
  if (!site) return null;
  return {
    site_id: site.site_id || site.Siteid || siteId,
    site_name: site.site_name || site['Site Name'] || '',
    latitude: site.latitude ?? site.Latitude,
    longitude: site.longitude ?? site.Longitude,
    kabupaten: site.kabupaten || site['Kabupaten/KOTA'] || '',
    site_class: site.site_class || site['Site Class'] || '',
    status_site: site.status_site || site['Status Site'] || '',
    nop: site.nop || site.NOP || '',
    cluster: site.cluster || site['New Cluster'] || '',
    type_site: site.type_site || site['Type Site'] || '',
    avg_availability: site.avg_availability,
    total_outage_menit: site.total_outage_menit,
    jumlah_cell: site.jumlah_cell,
    rca_dominan: site.rca_dominan,
  };
}

function hasCoordinates(site) {
  return Number.isFinite(Number(site?.latitude)) && Number.isFinite(Number(site?.longitude));
}

export default function DashboardPage() {
  const [bulan, setBulan] = useState(() => Number(import.meta.env.VITE_DEFAULT_BULAN) || null);
  const [tahun, setTahun] = useState(() => Number(import.meta.env.VITE_DEFAULT_TAHUN) || null);
  const [nop, setNop] = useState(null);
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [selectedSiteFocusKey, setSelectedSiteFocusKey] = useState(0);
  const [selectedSiteFallback, setSelectedSiteFallback] = useState(null);
  const [siteDetail, setSiteDetail] = useState(null);
  const [siteDetailTrend, setSiteDetailTrend] = useState([]);
  const [siteDetailDaily, setSiteDetailDaily] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [filters, setFilters] = useState({});

  // Resizable layout state
  const [sidebarWidth, setSidebarWidth] = useState(272);
  const [tableHeight, setTableHeight] = useState(28); // percentage
  const [isTableCollapsed, setIsTableCollapsed] = useState(false);
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const [isDraggingTable, setIsDraggingTable] = useState(false);

  const {
    sites,
    loading: mapLoading,
    error: mapError,
    refetch: refetchMapData,
  } = useMapData(bulan, tahun, nop);

  useEffect(() => {
    let cancelled = false;

    fetchLatestPeriod()
      .then((period) => {
        if (cancelled || !period?.bulan || !period?.tahun) return;
        setBulan(Number(period.bulan));
        setTahun(Number(period.tahun));
      })
      .catch((err) => {
        console.error('Failed to load latest availability period:', err);
        if (!cancelled) {
          const fallbackDate = new Date();
          setBulan(fallbackDate.getMonth() + 1);
          setTahun(fallbackDate.getFullYear());
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSiteClick = useCallback((siteId) => {
    setSelectedSiteId(siteId);
  }, []);

  const handleTableSiteSelect = useCallback(async (siteOrId) => {
    const siteId = typeof siteOrId === 'string' ? siteOrId : siteOrId?.site_id;
    if (!siteId) return;

    setShowModal(false);
    setSiteDetail(null);
    setSiteDetailTrend([]);
    setSiteDetailDaily([]);

    let focusFallback = normalizeSiteFocusData(
      typeof siteOrId === 'string' ? null : siteOrId,
      siteId,
    );

    if (!hasCoordinates(focusFallback)) {
      try {
        const detail = await fetchSiteDetail(siteId, bulan, tahun);
        focusFallback = normalizeSiteFocusData(detail, siteId);
      } catch (err) {
        console.error('Failed to load site coordinate fallback:', err);
      }
    }

    setSelectedSiteFallback(hasCoordinates(focusFallback) ? focusFallback : null);
    setSelectedSiteId(siteId);
    setSelectedSiteFocusKey(key => key + 1);
  }, [bulan, tahun]);

  const handleSiteSelect = useCallback(async (siteId) => {
    try {
      const [detail, trend, daily] = await Promise.all([
        fetchSiteDetail(siteId, bulan, tahun),
        fetchTrend(siteId, tahun, bulan),
        fetchSiteAvailability(siteId, bulan, tahun),
      ]);
      setSiteDetail(detail);
      setSiteDetailTrend(trend);
      setSiteDetailDaily(daily);
      setShowModal(true);
      setSelectedSiteId(siteId);
    } catch (err) {
      console.error('Failed to load site detail:', err);
    }
  }, [bulan, tahun]);

  // Listen for custom event from Mapbox popup button
  useEffect(() => {
    const handler = (e) => handleSiteSelect(e.detail);
    window.addEventListener('open-site-detail', handler);
    return () => window.removeEventListener('open-site-detail', handler);
  }, [handleSiteSelect]);

  // Merge NOP into table filters
  const tableFilters = useMemo(() => {
    const f = { ...filters };
    if (nop) f.nop = nop;
    return f;
  }, [filters, nop]);

  const tableKey = useMemo(
    () => `${bulan || 'none'}-${tahun || 'none'}-${JSON.stringify(tableFilters)}`,
    [bulan, tahun, tableFilters],
  );

  // Handle Sidebar Resize
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingSidebar) return;
      const newWidth = Math.max(252, Math.min(e.clientX, 380));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsDraggingSidebar(false);

    if (isDraggingSidebar) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSidebar]);

  // Handle Table Resize
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingTable || isTableCollapsed) return;
      const windowHeight = window.innerHeight;
      const newHeightPx = windowHeight - e.clientY;
      const newHeightPercent = Math.max(24, Math.min((newHeightPx / windowHeight) * 100, 45));
      setTableHeight(newHeightPercent);
    };
    const handleMouseUp = () => setIsDraggingTable(false);

    if (isDraggingTable) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingTable, isTableCollapsed]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--bg-base)]">
      <Header
        bulan={bulan}
        tahun={tahun}
        nop={nop}
        onBulanChange={setBulan}
        onTahunChange={setTahun}
        onNopChange={setNop}
      />

      <main className="flex-1 flex overflow-hidden p-2 gap-1.5 min-h-0">
        {/* Left Sidebar */}
        <aside
          className="shrink-0 rounded-xl border border-white/[0.06] bg-[var(--bg-surface)]/50 flex flex-col overflow-hidden"
          style={{ width: sidebarWidth }}
        >
          <div className="p-2.5 overflow-y-auto flex-1 flex flex-col gap-2.5">
            <SummaryCards bulan={bulan} tahun={tahun} />
            <WorstSitesPanel bulan={bulan} tahun={tahun} />
          </div>
        </aside>

        {/* Sidebar Resizer */}
        <div
          className="w-1 cursor-col-resize rounded-full bg-transparent hover:bg-[var(--primary)]/50 transition-colors shrink-0 z-10"
          onMouseDown={(e) => { e.preventDefault(); setIsDraggingSidebar(true); }}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden gap-1.5 min-w-0">
          {/* Map */}
          <div className="flex-1 min-h-0">
            <MapboxMap
              sites={sites}
              loading={mapLoading}
              onSiteClick={handleSiteClick}
              selectedSiteId={selectedSiteId}
              selectedSiteFocusKey={selectedSiteFocusKey}
              selectedSiteFallback={selectedSiteFallback}
              error={mapError}
              onRetry={refetchMapData}
              bulan={bulan}
              tahun={tahun}
            />
          </div>

          {/* Table Resizer */}
          <div
            className="relative flex h-4 shrink-0 cursor-row-resize items-center justify-center rounded-full bg-transparent transition-colors hover:bg-[var(--primary)]/10"
            onMouseDown={(e) => { e.preventDefault(); setIsDraggingTable(true); }}
          >
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setIsTableCollapsed(value => !value)}
              className="inline-flex h-4 items-center gap-1 rounded-full border border-white/[0.08] bg-[var(--bg-surface)]/95 px-2 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)] shadow-lg transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary-light)]"
              aria-label={isTableCollapsed ? 'Expand daftar site table' : 'Collapse daftar site table'}
            >
              <GripHorizontal className="h-3 w-3" />
              {isTableCollapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Table
            </button>
          </div>

          {/* Bottom Table */}
          <div
            className={`overflow-hidden flex flex-col rounded-xl border border-white/[0.06] bg-[var(--bg-surface)]/30 transition-[height,min-height] duration-300 ${isTableCollapsed ? 'min-h-[42px] p-1.5' : 'min-h-[228px] p-2'}`}
            style={{ height: isTableCollapsed ? '42px' : `${tableHeight}%` }}
          >
            {isTableCollapsed ? (
              <button
                type="button"
                onClick={() => setIsTableCollapsed(false)}
                className="flex h-full items-center justify-between rounded-lg px-3 text-left text-[10px] uppercase tracking-widest text-[var(--text-secondary)] transition-colors hover:bg-white/[0.04]"
              >
                <span className="font-semibold">Daftar Site</span>
                <span className="font-mono text-[var(--text-muted)]">{sites.length.toLocaleString()} markers</span>
              </button>
            ) : (
              <div className="flex-1 overflow-hidden">
                <SiteTable
                  key={tableKey}
                  bulan={bulan}
                  tahun={tahun}
                  filters={tableFilters}
                  onSiteSelect={handleTableSiteSelect}
                  siteCount={null}
                  toolbar={<FilterPanel filters={filters} onFilterChange={setFilters} />}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Site Detail Modal */}
      {showModal && (
        <SiteDetailModal
          data={siteDetail}
          trendData={siteDetailTrend}
          dailyData={siteDetailDaily}
          onClose={() => {
            setShowModal(false);
            setSiteDetail(null);
            setSiteDetailTrend([]);
            setSiteDetailDaily([]);
          }}
        />
      )}
    </div>
  );
}
