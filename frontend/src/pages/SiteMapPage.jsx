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
  const explorerState = useMemo(
    () => parseSiteMapSearchParams(searchParams),
    [searchParams],
  );
  const updateExplorerState = useCallback((updates) => {
    const nextParams = writeSiteMapSearchParams(searchParams, {
      ...explorerState,
      ...updates,
    });
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [explorerState, searchParams, setSearchParams]);

  const bulan = explorerState.bulan || null;
  const tahun = explorerState.tahun || null;
  const nop = explorerState.nop || null;
  const query = searchParams.get('q') || '';
  const selectedSiteId = explorerState.site || null;
  const filters = useMemo(() => ({
    ...(explorerState.kabupaten ? { kabupaten: explorerState.kabupaten } : {}),
    ...(explorerState.cluster ? { cluster: explorerState.cluster } : {}),
    ...(explorerState.kelas ? { kelas: explorerState.kelas } : {}),
  }), [explorerState.cluster, explorerState.kabupaten, explorerState.kelas]);

  const fallbackAbortRef = useRef(null);
  const siteDetailAbortRef = useRef(null);
  const [selectedSiteFocusKey, setSelectedSiteFocusKey] = useState(0);
  const [selectedSiteFallback, setSelectedSiteFallback] = useState(null);
  const [selectedSiteRequest, setSelectedSiteRequest] = useState({
    requestKey: null,
    loading: false,
    error: null,
  });
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
  const selectedSiteNeedsFallback = Boolean(selectedSiteId && !selectedMarkerSite && !(
    selectedSiteFallback?.site_id === selectedSiteId && hasCoordinates(selectedSiteFallback)
  ));
  const selectedSiteRequestKey = selectedSiteId
    ? `${selectedSiteId}:${bulan || 'none'}:${tahun || 'none'}`
    : null;
  const hasCurrentSelectedSiteRequest = selectedSiteRequest.requestKey === selectedSiteRequestKey;
  const selectedSiteLoading = selectedSiteNeedsFallback
    && (!hasCurrentSelectedSiteRequest || selectedSiteRequest.loading);
  const selectedSiteError = selectedSiteNeedsFallback && hasCurrentSelectedSiteRequest
    ? selectedSiteRequest.error
    : null;

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
    if (bulan && tahun) return undefined;

    let cancelled = false;
    fetchLatestPeriod()
      .then((period) => {
        if (cancelled || !period?.bulan || !period?.tahun) return;
        updateExplorerState({
          bulan: bulan || Number(period.bulan),
          tahun: tahun || Number(period.tahun),
        });
      })
      .catch((error) => {
        console.error('Failed to load latest availability period:', error);
        if (cancelled) return;
        const fallbackDate = new Date();
        updateExplorerState({
          bulan: bulan || fallbackDate.getMonth() + 1,
          tahun: tahun || fallbackDate.getFullYear(),
        });
      });
    return () => { cancelled = true; };
  }, [bulan, tahun, updateExplorerState]);

  useEffect(() => {
    fallbackAbortRef.current?.abort();
    if (!selectedSiteNeedsFallback) return undefined;

    const controller = new AbortController();
    fallbackAbortRef.current = controller;
    Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) return null;
        setSelectedSiteRequest({
          requestKey: selectedSiteRequestKey,
          loading: true,
          error: null,
        });
        return fetchSiteDetail(selectedSiteId, bulan, tahun, controller.signal);
      })
      .then((detail) => {
        if (controller.signal.aborted || !detail) return;
        const normalized = normalizeSiteFocusData(detail, selectedSiteId);
        if (!hasCoordinates(normalized)) throw new Error('Koordinat site tidak ditemukan.');
        setSelectedSiteFallback(normalized);
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.code === 'ERR_CANCELED') return;
        setSelectedSiteRequest({
          requestKey: selectedSiteRequestKey,
          loading: false,
          error: error?.message || 'Data site tidak ditemukan.',
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSelectedSiteRequest((current) => (
            current.requestKey === selectedSiteRequestKey
              ? { ...current, loading: false }
              : current
          ));
        }
      });

    return () => controller.abort();
  }, [bulan, selectedSiteId, selectedSiteNeedsFallback, selectedSiteRequestKey, tahun]);

  useEffect(() => () => {
    fallbackAbortRef.current?.abort();
    siteDetailAbortRef.current?.abort();
  }, []);

  const handleSelectSite = useCallback((siteOrId) => {
    const siteId = String(typeof siteOrId === 'string' ? siteOrId : siteOrId?.site_id || '').toUpperCase();
    if (!siteId) return;
    const normalized = typeof siteOrId === 'string' ? null : normalizeSiteFocusData(siteOrId, siteId);
    if (normalized) setSelectedSiteFallback(normalized);
    updateExplorerState({ site: siteId });
    setSelectedSiteFocusKey((key) => key + 1);
    setResultsOpen(false);
    if (isMobileViewport()) setMobileInspectorOpen(true);
    setLayoutResizeKey((key) => key + 1);
  }, [
    setLayoutResizeKey,
    setMobileInspectorOpen,
    setResultsOpen,
    setSelectedSiteFallback,
    setSelectedSiteFocusKey,
    updateExplorerState,
  ]);

  const handleClearSelection = useCallback(() => {
    fallbackAbortRef.current?.abort();
    updateExplorerState({ site: null });
    setSelectedSiteFallback(null);
    setMobileInspectorOpen(false);
    setLayoutResizeKey((key) => key + 1);
  }, [
    setLayoutResizeKey,
    setMobileInspectorOpen,
    setSelectedSiteFallback,
    updateExplorerState,
  ]);

  const handleQueryChange = useCallback((value) => {
    const nextParams = new URLSearchParams(searchParams);
    if (value) nextParams.set('q', value);
    else nextParams.delete('q');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleFilterChange = useCallback((nextFilters) => {
    updateExplorerState({
      kabupaten: nextFilters.kabupaten || null,
      cluster: nextFilters.cluster || null,
      kelas: nextFilters.kelas || null,
    });
  }, [updateExplorerState]);

  const handleResetToolbar = useCallback(() => {
    updateExplorerState({ q: null, kabupaten: null, cluster: null, kelas: null });
  }, [updateExplorerState]);

  const handleClearAllFilters = useCallback(() => {
    updateExplorerState({ q: null, nop: null, kabupaten: null, cluster: null, kelas: null });
  }, [updateExplorerState]);

  const handleResultsOpenChange = useCallback((nextOpen) => {
    setResultsOpen(nextOpen);
    if (nextOpen && isMobileViewport()) setMobileInspectorOpen(false);
    setLayoutResizeKey((key) => key + 1);
  }, [setLayoutResizeKey, setMobileInspectorOpen, setResultsOpen]);

  const handleSectorStatusChange = useCallback((nextStatus) => {
    setSectorStatus(nextStatus);
  }, [setSectorStatus]);

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
  }, [
    bulan,
    setShowModal,
    setSiteDetail,
    setSiteDetailPerformance,
    setSiteDetailTrend,
    tahun,
  ]);

  return (
    <div className="dashboard-canvas flex min-h-[100dvh] flex-col overflow-hidden lg:h-[100dvh]">
      <Header
        bulan={bulan}
        tahun={tahun}
        nop={nop}
        nopOptions={filterOptions.nop}
        onBulanChange={(value) => updateExplorerState({ bulan: value })}
        onTahunChange={(value) => updateExplorerState({ tahun: value })}
        onNopChange={(value) => updateExplorerState({ nop: value })}
      />
      <Breadcrumb />

      <main className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 lg:overflow-hidden">
        <SiteMapToolbar
          q={query}
          onQueryChange={handleQueryChange}
          filters={filters}
          onFilterChange={handleFilterChange}
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
