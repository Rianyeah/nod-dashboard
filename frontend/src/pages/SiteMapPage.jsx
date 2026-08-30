import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Header from '../components/Header';
import MapboxMap from '../components/MapboxMap';
import SiteDetailModal from '../components/SiteDetailModal';
import Breadcrumb from '../components/Breadcrumb';
import SiteMapToolbar from '../features/site-map/SiteMapToolbar';
import SiteMapContextStrip from '../features/site-map/SiteMapContextStrip';
import SiteMapInspector from '../features/site-map/SiteMapInspector';
import SiteMapResultsDrawer from '../features/site-map/SiteMapResultsDrawer';
import { nearbySites } from '../features/site-map/siteMapSpatial';
import {
  normalizeSiteMapFilters,
  parseSiteMapSearchParams,
  writeSiteMapSearchParams,
} from '../features/site-map/siteMapState';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useMapData } from '../hooks/useMapData';
import { fetchFilterOptions, fetchLatestPeriod, fetchSiteDetail } from '../services/api';
import { fetchSiteDetailBundle } from '../services/siteDetailBundle';

function normalizeSiteFocusData(site, siteId) {
  if (!site) return null;
  return {
    site_id: String(site.site_id || site.Siteid || siteId || '').toUpperCase(),
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
  if (site?.latitude == null || site?.longitude == null) return false;
  return Number.isFinite(Number(site.latitude)) && Number.isFinite(Number(site.longitude));
}

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
}

export default function SiteMapPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStateRef = useRef(parseSiteMapSearchParams(searchParams));
  const fallbackAbortRef = useRef(null);
  const siteDetailAbortRef = useRef(null);
  const lastWrittenUrlRef = useRef(searchParams.toString());
  const applyingUrlRef = useRef(null);
  const initialState = initialStateRef.current;

  const [bulan, setBulan] = useState(initialState.bulan || null);
  const [tahun, setTahun] = useState(initialState.tahun || null);
  const [nop, setNop] = useState(initialState.nop || null);
  const [filters, setFilters] = useState({
    ...(initialState.kabupaten ? { kabupaten: initialState.kabupaten } : {}),
    ...(initialState.cluster ? { cluster: initialState.cluster } : {}),
    ...(initialState.kelas ? { kelas: initialState.kelas } : {}),
  });
  const [query, setQuery] = useState(initialState.q || '');
  const [selectedSiteId, setSelectedSiteId] = useState(initialState.site || null);
  const [selectedSiteFocusKey, setSelectedSiteFocusKey] = useState(0);
  const [selectedSiteFallback, setSelectedSiteFallback] = useState(null);
  const [selectedSiteLoading, setSelectedSiteLoading] = useState(Boolean(initialState.site));
  const [selectedSiteError, setSelectedSiteError] = useState(null);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [layoutResizeKey, setLayoutResizeKey] = useState(0);
  const [sectorStatus, setSectorStatus] = useState({ kind: 'off', count: 0, lod: 'none' });
  const [siteDetail, setSiteDetail] = useState(null);
  const [siteDetailTrend, setSiteDetailTrend] = useState([]);
  const [siteDetailPerformance, setSiteDetailPerformance] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [filterOptions, setFilterOptions] = useState({ kabupaten: [], cluster: [], kelas: [], nop: [] });
  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  const mapFilters = useMemo(() => normalizeSiteMapFilters({
    ...filters,
    nop,
    q: debouncedQuery,
  }), [debouncedQuery, filters, nop]);

  const {
    sites,
    total,
    withCoordinates,
    loading: mapLoading,
    error: mapDataError,
    refetch: refetchMapData,
  } = useMapData(bulan, tahun, mapFilters);

  const selectedMarkerSite = useMemo(
    () => sites.find((site) => site.site_id === selectedSiteId) || null,
    [selectedSiteId, sites],
  );
  const selectedSite = selectedMarkerSite
    || (selectedSiteFallback?.site_id === selectedSiteId ? selectedSiteFallback : null);
  const selectedNearbySites = useMemo(
    () => nearbySites(selectedSite, sites),
    [selectedSite, sites],
  );
  const selectedOutsideFilters = Boolean(selectedSiteId && selectedSite && !selectedMarkerSite);

  useEffect(() => {
    let cancelled = false;
    fetchFilterOptions()
      .then((options) => {
        if (!cancelled) setFilterOptions(options);
      })
      .catch((error) => {
        console.error('Failed to load filter options:', error);
        if (!cancelled) setFilterOptions({ kabupaten: [], cluster: [], kelas: [], nop: [] });
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchLatestPeriod()
      .then((period) => {
        if (cancelled || !period?.bulan || !period?.tahun) return;
        if (!initialStateRef.current.bulan) setBulan((current) => current || Number(period.bulan));
        if (!initialStateRef.current.tahun) setTahun((current) => current || Number(period.tahun));
      })
      .catch((error) => {
        console.error('Failed to load latest availability period:', error);
        if (cancelled) return;
        const fallbackDate = new Date();
        if (!initialStateRef.current.bulan) setBulan((current) => current || fallbackDate.getMonth() + 1);
        if (!initialStateRef.current.tahun) setTahun((current) => current || fallbackDate.getFullYear());
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const currentUrl = searchParams.toString();
    if (lastWrittenUrlRef.current === currentUrl) {
      lastWrittenUrlRef.current = null;
      return;
    }

    applyingUrlRef.current = currentUrl;
    const nextState = parseSiteMapSearchParams(searchParams);
    if (nextState.bulan) setBulan(nextState.bulan);
    if (nextState.tahun) setTahun(nextState.tahun);
    setNop(nextState.nop || null);
    setFilters({
      ...(nextState.kabupaten ? { kabupaten: nextState.kabupaten } : {}),
      ...(nextState.cluster ? { cluster: nextState.cluster } : {}),
      ...(nextState.kelas ? { kelas: nextState.kelas } : {}),
    });
    setQuery(nextState.q || '');
    setSelectedSiteFallback(null);
    setSelectedSiteError(null);
    setSelectedSiteId(nextState.site || null);
    setSelectedSiteFocusKey((key) => key + 1);
  }, [searchParams]);

  useEffect(() => {
    const currentUrl = searchParams.toString();
    if (applyingUrlRef.current === currentUrl) {
      applyingUrlRef.current = null;
      return;
    }

    const nextParams = writeSiteMapSearchParams(searchParams, {
      bulan,
      tahun,
      nop,
      ...filters,
      q: debouncedQuery,
      site: selectedSiteId,
    });
    const nextUrl = nextParams.toString();
    if (nextUrl === currentUrl) return;
    lastWrittenUrlRef.current = nextUrl;
    setSearchParams(nextParams, { replace: true });
  }, [bulan, debouncedQuery, filters, nop, searchParams, selectedSiteId, setSearchParams, tahun]);

  useEffect(() => {
    fallbackAbortRef.current?.abort();
    setSelectedSiteError(null);

    if (!selectedSiteId || selectedMarkerSite || (
      selectedSiteFallback?.site_id === selectedSiteId && hasCoordinates(selectedSiteFallback)
    )) {
      setSelectedSiteLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    fallbackAbortRef.current = controller;
    setSelectedSiteLoading(true);
    fetchSiteDetail(selectedSiteId, bulan, tahun, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return;
        const normalized = normalizeSiteFocusData(detail, selectedSiteId);
        if (!normalized) throw new Error('Data site tidak ditemukan.');
        setSelectedSiteFallback(normalized);
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.code === 'ERR_CANCELED') return;
        setSelectedSiteError(error?.message || 'Data site tidak ditemukan.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setSelectedSiteLoading(false);
      });

    return () => controller.abort();
  }, [bulan, selectedMarkerSite, selectedSiteFallback, selectedSiteId, tahun]);

  useEffect(() => () => {
    fallbackAbortRef.current?.abort();
    siteDetailAbortRef.current?.abort();
  }, []);

  const handleSelectSite = useCallback((siteOrId) => {
    const siteId = String(typeof siteOrId === 'string' ? siteOrId : siteOrId?.site_id || '').toUpperCase();
    if (!siteId) return;
    const normalized = typeof siteOrId === 'string' ? null : normalizeSiteFocusData(siteOrId, siteId);
    if (normalized) setSelectedSiteFallback(normalized);
    setSelectedSiteError(null);
    setSelectedSiteId(siteId);
    setSelectedSiteFocusKey((key) => key + 1);
    setResultsOpen(false);
    if (isMobileViewport()) setMobileInspectorOpen(true);
    setLayoutResizeKey((key) => key + 1);
  }, []);

  const handleClearSelection = useCallback(() => {
    fallbackAbortRef.current?.abort();
    setSelectedSiteId(null);
    setSelectedSiteFallback(null);
    setSelectedSiteError(null);
    setSelectedSiteLoading(false);
    setMobileInspectorOpen(false);
    setLayoutResizeKey((key) => key + 1);
  }, []);

  const handleResetToolbar = useCallback(() => {
    setQuery('');
    setFilters({});
  }, []);

  const handleClearAllFilters = useCallback(() => {
    setQuery('');
    setFilters({});
    setNop(null);
  }, []);

  const handleResultsOpenChange = useCallback((nextOpen) => {
    setResultsOpen(nextOpen);
    if (nextOpen && isMobileViewport()) setMobileInspectorOpen(false);
    setLayoutResizeKey((key) => key + 1);
  }, []);

  const handleSectorStatusChange = useCallback((nextStatus) => {
    setSectorStatus(nextStatus);
  }, []);

  const handleOpenDetail = useCallback(async (siteId) => {
    siteDetailAbortRef.current?.abort();
    const controller = new AbortController();
    siteDetailAbortRef.current = controller;
    try {
      const bundle = await fetchSiteDetailBundle(siteId, {
        bulan,
        tahun,
        signal: controller.signal,
      });
      setSiteDetail(bundle.detail);
      setSiteDetailTrend(bundle.trendData);
      setSiteDetailPerformance(bundle.performanceData);
      setShowModal(true);
    } catch (error) {
      if (controller.signal.aborted || error?.code === 'ERR_CANCELED') return;
      console.error('Failed to load site detail:', error);
    }
  }, [bulan, tahun]);

  return (
    <div className="dashboard-canvas flex min-h-[100dvh] flex-col overflow-hidden lg:h-[100dvh]">
      <Header
        bulan={bulan}
        tahun={tahun}
        nop={nop}
        nopOptions={filterOptions.nop}
        onBulanChange={setBulan}
        onTahunChange={setTahun}
        onNopChange={setNop}
      />
      <Breadcrumb />

      <main className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 lg:overflow-hidden">
        <SiteMapToolbar
          q={query}
          onQueryChange={setQuery}
          filters={filters}
          onFilterChange={setFilters}
          filterOptions={filterOptions}
          onReset={handleResetToolbar}
        />

        <SiteMapContextStrip
          total={total}
          withCoordinates={withCoordinates}
          selectedSiteId={selectedSiteId}
          sectorStatus={sectorStatus}
        />

        <div className="grid min-h-[480px] flex-1 gap-2 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(300px,340px)]">
          <div className="min-h-[420px] min-w-0 lg:min-h-0">
            <MapboxMap
              sites={sites}
              loading={mapLoading}
              error={mapDataError}
              onRetry={refetchMapData}
              onSiteSelect={handleSelectSite}
              onSectorStatusChange={handleSectorStatusChange}
              selectedSiteId={selectedSiteId}
              selectedSiteFocusKey={selectedSiteFocusKey}
              selectedSiteFallback={selectedSiteFallback}
              filters={mapFilters}
              layoutResizeKey={layoutResizeKey}
            />
          </div>

          <SiteMapInspector
            site={selectedSite}
            nearby={selectedNearbySites}
            outsideFilters={selectedOutsideFilters}
            loading={selectedSiteLoading}
            error={selectedSiteError}
            onClearSelection={handleClearSelection}
            onClearFilters={handleClearAllFilters}
            onOpenDetail={handleOpenDetail}
            onSelectNearby={handleSelectSite}
            mobileOpen={mobileInspectorOpen}
            onMobileOpenChange={setMobileInspectorOpen}
          />
        </div>

        <SiteMapResultsDrawer
          bulan={bulan}
          tahun={tahun}
          filters={mapFilters}
          q={debouncedQuery}
          total={total}
          onSiteSelect={handleSelectSite}
          open={resultsOpen}
          onOpenChange={handleResultsOpenChange}
        />
      </main>

      {showModal ? (
        <SiteDetailModal
          data={siteDetail}
          trendData={siteDetailTrend}
          performanceData={siteDetailPerformance}
          onClose={() => {
            setShowModal(false);
            setSiteDetail(null);
            setSiteDetailTrend([]);
            setSiteDetailPerformance(null);
          }}
        />
      ) : null}
    </div>
  );
}
