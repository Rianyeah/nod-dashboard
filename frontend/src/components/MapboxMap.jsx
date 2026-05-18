import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMarkerColor } from '../utils/mapColors';
import { fetchSiteAvailability } from '../services/api';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const SITE_LAYER_IDS = ['site-pin-label', 'site-pin', 'site-pin-halo'];
const RADIUS_SOURCE_ID = 'site-radius-source';
const RADIUS_LAYER_IDS = ['site-radius-fill', 'site-radius-glow', 'site-radius-outline'];
const LEGACY_LAYER_IDS = ['clusters', 'cluster-count', 'unclustered-point', 'unclustered-label', 'unclustered-glow'];
const DEFAULT_PITCH = 2;
const FOCUSED_PITCH = 55;
const PITCH_ZOOM_THRESHOLD = 11;
const FOCUS_ZOOM = 13;
const FOCUS_DURATION_MS = 1400;
const NEIGHBOR_RADIUS_KM = 1;

function emptyFeatureCollection() {
  return {
    type: 'FeatureCollection',
    features: [],
  };
}

function applyDuskScene(mapInstance) {
  if (typeof mapInstance.setConfigProperty === 'function') {
    mapInstance.setConfigProperty('basemap', 'lightPreset', 'dusk');
    mapInstance.setConfigProperty('basemap', 'showPointOfInterestLabels', false);
    mapInstance.setConfigProperty('basemap', 'showTransitLabels', false);
  }

  mapInstance.setFog({
    color: 'rgb(42, 47, 67)',
    'high-color': 'rgb(136, 111, 132)',
    'horizon-blend': 0.22,
    'space-color': 'rgb(8, 12, 22)',
    'star-intensity': 0.12,
  });

  if (!mapInstance.getSource('mapbox-dem')) {
    mapInstance.addSource('mapbox-dem', {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14,
    });
  }

  mapInstance.setTerrain({ source: 'mapbox-dem', exaggeration: 1.15 });

  if (mapInstance.getSource('composite') && !mapInstance.getLayer('nod-3d-buildings')) {
    mapInstance.addLayer({
      id: 'nod-3d-buildings',
      source: 'composite',
      'source-layer': 'building',
      filter: ['==', ['get', 'extrude'], 'true'],
      type: 'fill-extrusion',
      minzoom: 12,
      slot: 'middle',
      paint: {
        'fill-extrusion-color': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12,
          '#8A7C89',
          16,
          '#D6A36E',
        ],
        'fill-extrusion-height': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12,
          0,
          15,
          ['coalesce', ['get', 'height'], 12],
        ],
        'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
        'fill-extrusion-opacity': 0.62,
        'fill-extrusion-ambient-occlusion-intensity': 0.45,
        'fill-extrusion-flood-light-color': '#F2B37D',
        'fill-extrusion-flood-light-intensity': 0.16,
      },
    });
  }
}

function siteToPopupData(site) {
  return {
    site_id: site.site_id,
    site_name: site.site_name || '',
    kabupaten: site.kabupaten || '',
    site_class: site.site_class || '',
    avg_availability: site.avg_availability,
    total_outage_menit: site.total_outage_menit,
    jumlah_cell: site.jumlah_cell,
    latitude: site.latitude,
    longitude: site.longitude,
    color: getMarkerColor(site.avg_availability, site.status_site),
  };
}

function buildSitesGeoJson(sites = []) {
  return {
    type: 'FeatureCollection',
    features: sites
      .map(site => ({
        ...site,
        latitude: Number(site.latitude),
        longitude: Number(site.longitude),
      }))
      .filter(site => Number.isFinite(site.latitude) && Number.isFinite(site.longitude))
      .map(site => ({
        type: 'Feature',
        properties: {
          site_id: site.site_id,
          site_name: site.site_name || '',
          kabupaten: site.kabupaten || '',
          site_class: site.site_class || '',
          status_site: site.status_site || '',
          avg_availability: site.avg_availability,
          total_outage_menit: site.total_outage_menit,
          jumlah_cell: site.jumlah_cell,
          latitude: site.latitude,
          longitude: site.longitude,
          color: getMarkerColor(site.avg_availability, site.status_site),
        },
        geometry: { type: 'Point', coordinates: [site.longitude, site.latitude] },
      })),
  };
}

function formatAvailability(value) {
  return value == null ? 'N/A' : `${Number(value).toFixed(2)}%`;
}

function formatCell(value) {
  return value == null ? '-' : Number(value).toLocaleString();
}

function formatOutageMinutes(value) {
  if (value == null) return 'N/A';
  if (Number(value) < 60) return `${Math.round(Number(value))} min`;
  return `${Math.round(Number(value) / 60).toLocaleString()}h`;
}

function buildSparklinePath(values, width = 218, height = 48, padding = 8) {
  const points = values
    .map((value, index) => ({ value: Number(value), index }))
    .filter(point => Number.isFinite(point.value));

  if (points.length < 2) return '';

  const min = Math.min(90, ...points.map(point => point.value));
  const max = Math.max(100, ...points.map(point => point.value));
  const range = Math.max(max - min, 1);
  const step = (width - padding * 2) / Math.max(points.length - 1, 1);

  return points
    .map((point, visibleIndex) => {
      const x = padding + visibleIndex * step;
      const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
      return `${visibleIndex === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function dailySparklineHtml(rows = [], monthAvailability = null) {
  const orderedRows = [...rows]
    .filter(row => row.availability != null)
    .sort((a, b) => Number(a.tgl) - Number(b.tgl));
  const values = orderedRows.map(row => row.availability);
  const path = buildSparklinePath(values);
  const monthAvg = monthAvailability != null ? Number(monthAvailability).toFixed(2) : 'N/A';

  if (!path) {
    return '<div style="height:46px;display:flex;align-items:center;justify-content:center;color:#64748B;font-size:10px">Daily trend tidak tersedia</div>';
  }

  return `
    <div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:9px;color:#64748B;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Daily Availability</span>
        <b style="font-size:10px;color:#34D399;white-space:nowrap">Month Avg ${monthAvg}%</b>
      </div>
      <svg width="218" height="48" viewBox="0 0 218 48" style="display:block;width:100%;height:48px;overflow:visible">
        <path d="${path} L210,46 L8,46 Z" fill="rgba(16,185,129,.16)" stroke="none"></path>
        <path d="${path}" fill="none" stroke="#34D399" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    </div>
  `;
}

function distanceKm(from, to) {
  const toRad = (value) => value * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(to.latitude - from.latitude);
  const dLng = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function createCircleFeature(center, radiusKm, steps = 96) {
  const [longitude, latitude] = center;
  const coordinates = [];
  const earthRadiusKm = 6371;
  const latRad = latitude * Math.PI / 180;
  const lngRad = longitude * Math.PI / 180;
  const angularDistance = radiusKm / earthRadiusKm;

  for (let i = 0; i <= steps; i += 1) {
    const bearing = 2 * Math.PI * i / steps;
    const pointLat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance)
      + Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
    );
    const pointLng = lngRad + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(pointLat)
    );

    coordinates.push([pointLng * 180 / Math.PI, pointLat * 180 / Math.PI]);
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
  };
}

export default function MapboxMap({
  sites,
  loading,
  error,
  onRetry,
  onSiteClick,
  selectedSiteId,
  selectedSiteFocusKey = 0,
  selectedSiteFallback,
  bulan,
  tahun,
}) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const popup = useRef(null);
  const neighborMarkers = useRef([]);
  const sitesRef = useRef([]);
  const focusSiteRef = useRef(null);
  const dailyAvailabilityCache = useRef(new Map());
  const cameraProgrammatic = useRef(false);
  const lastFocusedRequest = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const sitesGeoJson = useMemo(() => buildSitesGeoJson(sites), [sites]);

  useEffect(() => {
    sitesRef.current = sites || [];
  }, [sites]);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/standard',
      config: {
        basemap: {
          lightPreset: 'dusk',
          showPointOfInterestLabels: false,
          showTransitLabels: false,
        },
      },
      center: [112.65, -7.45],
      zoom: 8.35,
      minZoom: 6,
      maxZoom: 18,
      pitch: DEFAULT_PITCH,
      bearing: -18,
      antialias: true,
      attributionControl: true,
    });
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');
    map.current.on('style.load', () => applyDuskScene(map.current));
    map.current.on('load', () => {
      applyDuskScene(map.current);
      setMapLoaded(true);
    });
    return () => {
      popup.current?.remove();
      popup.current = null;
      neighborMarkers.current.forEach(marker => marker.remove());
      neighborMarkers.current = [];
      map.current?.remove();
      map.current = null;
    };
  }, []);

  const clearNeighborMarkers = useCallback(() => {
    neighborMarkers.current.forEach(marker => marker.remove());
    neighborMarkers.current = [];
  }, []);

  const clearRadius = useCallback(() => {
    const source = map.current?.getSource(RADIUS_SOURCE_ID);
    if (source) source.setData(emptyFeatureCollection());
  }, []);

  const updateRadius = useCallback((coordinates) => {
    if (!map.current) return;

    const radiusGeoJson = {
      type: 'FeatureCollection',
      features: [createCircleFeature(coordinates, NEIGHBOR_RADIUS_KM)],
    };

    if (map.current.getSource(RADIUS_SOURCE_ID)) {
      map.current.getSource(RADIUS_SOURCE_ID).setData(radiusGeoJson);
      if (map.current.getLayer('site-radius-fill')) {
        map.current.setPaintProperty('site-radius-fill', 'fill-color', '#F97316');
        map.current.setPaintProperty('site-radius-fill', 'fill-opacity', 0.28);
      }
      if (map.current.getLayer('site-radius-glow')) {
        map.current.setPaintProperty('site-radius-glow', 'line-color', '#FF8A1F');
        map.current.setPaintProperty('site-radius-glow', 'line-width', 12);
        map.current.setPaintProperty('site-radius-glow', 'line-opacity', 0.32);
        map.current.setPaintProperty('site-radius-glow', 'line-blur', 3);
      }
      if (map.current.getLayer('site-radius-outline')) {
        map.current.setPaintProperty('site-radius-outline', 'line-color', '#FFB020');
        map.current.setPaintProperty('site-radius-outline', 'line-width', 5);
        map.current.setPaintProperty('site-radius-outline', 'line-opacity', 1);
      }
      return;
    }

    map.current.addSource(RADIUS_SOURCE_ID, {
      type: 'geojson',
      data: radiusGeoJson,
    });

    const beforePinLayer = map.current.getLayer('site-pin-halo') ? 'site-pin-halo' : undefined;

    map.current.addLayer({
      id: 'site-radius-fill',
      type: 'fill',
      source: RADIUS_SOURCE_ID,
      slot: 'top',
      paint: {
        'fill-color': '#F97316',
        'fill-opacity': 0.28,
      },
    }, beforePinLayer);

    map.current.addLayer({
      id: 'site-radius-glow',
      type: 'line',
      source: RADIUS_SOURCE_ID,
      slot: 'top',
      paint: {
        'line-color': '#FF8A1F',
        'line-width': 12,
        'line-opacity': 0.32,
        'line-blur': 3,
      },
    });

    map.current.addLayer({
      id: 'site-radius-outline',
      type: 'line',
      source: RADIUS_SOURCE_ID,
      slot: 'top',
      paint: {
        'line-color': '#FFB020',
        'line-width': 5,
        'line-opacity': 1,
      },
    });
  }, []);

  const renderNeighborMarkers = useCallback((siteData) => {
    const currentSites = sitesRef.current;
    if (!map.current || !currentSites.length) return;

    clearNeighborMarkers();

    const center = {
      latitude: Number(siteData.latitude),
      longitude: Number(siteData.longitude),
    };

    const neighbors = currentSites
      .filter(site => site.site_id !== siteData.site_id && site.latitude && site.longitude)
      .map(site => ({
        ...site,
        distance: distanceKm(center, {
          latitude: Number(site.latitude),
          longitude: Number(site.longitude),
        }),
      }))
      .filter(site => site.distance <= NEIGHBOR_RADIUS_KM)
      .sort((a, b) => a.distance - b.distance);

    neighborMarkers.current = neighbors.map((site) => {
      const element = document.createElement('div');
      element.className = 'nod-neighbor-card';
      element.style.zIndex = '4';
      element.innerHTML = `
        <div style="
          min-width:118px;
          padding:8px 9px;
          border:1px solid rgba(147,197,253,0.34);
          border-radius:8px;
          background:rgba(15,23,42,0.72);
          box-shadow:0 10px 24px rgba(0,0,0,0.28);
          backdrop-filter:blur(8px);
          color:#E2E8F0;
          font-family:Inter,sans-serif;
          font-size:10px;
          line-height:1.25;
          pointer-events:none;
        ">
          <div style="display:flex;align-items:center;gap:5px;margin-bottom:6px">
            <span style="width:6px;height:6px;border-radius:999px;background:${getMarkerColor(site.avg_availability, site.status_site)}"></span>
            <strong style="font-size:10px;color:#F8FAFC">${site.site_id}</strong>
          </div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 8px">
            <span style="color:#94A3B8">Avail</span><b style="text-align:right;color:${getMarkerColor(site.avg_availability, site.status_site)}">${formatAvailability(site.avg_availability)}</b>
            <span style="color:#94A3B8">Cell</span><b style="text-align:right">${formatCell(site.jumlah_cell)}</b>
            <span style="color:#94A3B8">Outage</span><b style="text-align:right">${formatOutageMinutes(site.total_outage_menit)}</b>
          </div>
        </div>
      `;

      return new mapboxgl.Marker({
        element,
        anchor: 'bottom',
        offset: [0, -12],
      })
        .setLngLat([site.longitude, site.latitude])
        .addTo(map.current);
    });
  }, [clearNeighborMarkers]);

  const openSitePopup = useCallback((siteData, coordinates) => {
    if (!map.current) return;

    const p = siteData;
    const avail = formatAvailability(p.avg_availability);
    const outage = p.total_outage_menit != null ? `${Math.round(p.total_outage_menit)} min` : 'N/A';
    const chartId = `nod-popup-daily-${String(p.site_id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;

    popup.current?.remove();
    popup.current = new mapboxgl.Popup({
      anchor: 'top',
      offset: { top: [0, 16] },
      maxWidth: '258px',
      className: 'nod-popup',
    }).setLngLat(coordinates).setHTML(`
      <div style="padding:12px;font-family:Inter,sans-serif;width:248px">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">
          <span style="width:8px;height:8px;border-radius:50%;background:${p.color};box-shadow:0 0 8px ${p.color}"></span>
          <span style="font-size:13px;font-weight:800;color:#F1F5F9;line-height:1">${p.site_id}</span>
        </div>
        <p style="font-size:10px;color:#94A3B8;margin:0 0 10px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.site_name}</p>
        <div id="${chartId}" style="margin-bottom:10px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);border-radius:8px;padding:8px 9px">
          <div style="height:65px;display:flex;align-items:center;justify-content:center;color:#64748B;font-size:10px">Memuat daily trend...</div>
        </div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:5px 10px;font-size:10px;align-items:center">
          <span style="color:#64748B">Avail</span>
          <b style="color:${p.color};font-size:13px;text-align:right">${avail}</b>
          <span style="color:#64748B">Outage</span>
          <b style="color:#F1F5F9;text-align:right">${outage}</b>
          <span style="color:#64748B">Cell</span>
          <b style="color:#F1F5F9;text-align:right">${formatCell(p.jumlah_cell)}</b>
          <span style="color:#64748B">Class</span>
          <b style="color:#F1F5F9;text-align:right">${p.site_class || '-'}</b>
        </div>
        <button onclick="window.dispatchEvent(new CustomEvent('open-site-detail',{detail:'${p.site_id}'}))"
          style="margin-top:10px;width:100%;padding:7px;background:linear-gradient(135deg,#1E40AF,#3B82F6);color:#fff;border:none;border-radius:7px;font-size:10px;font-weight:700;cursor:pointer;letter-spacing:0.2px;transition:opacity 0.2s"
          onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
          Lihat Detail Lengkap
        </button>
      </div>
    `).addTo(map.current);

    popup.current.getElement().style.zIndex = '30';

    popup.current.on('close', () => {
      clearNeighborMarkers();
    });

    if (bulan && tahun) {
      const cacheKey = `${p.site_id}-${tahun}-${bulan}`;
      const cachedRows = dailyAvailabilityCache.current.get(cacheKey);
      if (cachedRows) {
        const chartEl = document.getElementById(chartId);
        if (chartEl) chartEl.innerHTML = dailySparklineHtml(cachedRows, p.avg_availability);
        return;
      }

      fetchSiteAvailability(p.site_id, bulan, tahun)
        .then((rows) => {
          dailyAvailabilityCache.current.set(cacheKey, rows);
          const chartEl = document.getElementById(chartId);
          if (chartEl) chartEl.innerHTML = dailySparklineHtml(rows, p.avg_availability);
        })
        .catch(() => {
          const chartEl = document.getElementById(chartId);
          if (chartEl) {
            chartEl.innerHTML = '<div style="height:65px;display:flex;align-items:center;justify-content:center;color:#F87171;font-size:10px">Daily trend gagal dimuat</div>';
          }
        });
    }
  }, [bulan, tahun, clearNeighborMarkers]);

  const focusSite = useCallback((siteData, coordinates, { notify = false } = {}) => {
    if (!map.current) return;

    popup.current?.remove();
    clearNeighborMarkers();
    clearRadius();
    updateRadius(coordinates);
    if (notify) onSiteClick?.(siteData.site_id, coordinates);

    cameraProgrammatic.current = true;
    map.current.flyTo({
      center: coordinates,
      zoom: Math.max(map.current.getZoom(), FOCUS_ZOOM),
      pitch: FOCUSED_PITCH,
      bearing: -18,
      duration: FOCUS_DURATION_MS,
      essential: true,
    });

    map.current.once('moveend', () => {
      cameraProgrammatic.current = false;
      openSitePopup(siteData, coordinates);
      renderNeighborMarkers(siteData);
    });
  }, [onSiteClick, openSitePopup, clearNeighborMarkers, clearRadius, updateRadius, renderNeighborMarkers]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const syncPitchToZoom = () => {
      if (!map.current || cameraProgrammatic.current) return;
      const targetPitch = map.current.getZoom() >= PITCH_ZOOM_THRESHOLD ? FOCUSED_PITCH : DEFAULT_PITCH;
      if (Math.abs(map.current.getPitch() - targetPitch) < 1) return;
      map.current.easeTo({ pitch: targetPitch, duration: 550 });
    };

    map.current.on('zoomend', syncPitchToZoom);
    return () => {
      map.current?.off('zoomend', syncPitchToZoom);
    };
  }, [mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded || !selectedSiteId) return;

    const requestKey = `${selectedSiteId}:${selectedSiteFocusKey}`;
    if (requestKey === lastFocusedRequest.current) return;

    const site = sitesRef.current.find(s => s.site_id === selectedSiteId)
      || (selectedSiteFallback?.site_id === selectedSiteId ? selectedSiteFallback : null);
    const longitude = Number(site?.longitude);
    const latitude = Number(site?.latitude);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;

    lastFocusedRequest.current = requestKey;
    focusSite(siteToPopupData({ ...site, longitude, latitude }), [longitude, latitude]);
  }, [selectedSiteId, selectedSiteFocusKey, selectedSiteFallback, mapLoaded, focusSite]);

  useEffect(() => {
    focusSiteRef.current = focusSite;
  }, [focusSite]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    [...SITE_LAYER_IDS, ...RADIUS_LAYER_IDS, ...LEGACY_LAYER_IDS].forEach(id => {
      if (map.current.getLayer(id)) map.current.removeLayer(id);
    });
    if (map.current.getSource(RADIUS_SOURCE_ID)) map.current.removeSource(RADIUS_SOURCE_ID);
    if (map.current.getSource('sites-source')) map.current.removeSource('sites-source');

    map.current.addSource('sites-source', {
      type: 'geojson',
      data: emptyFeatureCollection(),
      cluster: false,
    });

    map.current.addLayer({
      id: 'site-pin-halo',
      type: 'circle',
      source: 'sites-source',
      slot: 'top',
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 8, 10, 12, 14, 16],
        'circle-opacity': 0.34,
        'circle-blur': 0.55,
      },
    });

    map.current.addLayer({
      id: 'site-pin',
      type: 'circle',
      source: 'sites-source',
      slot: 'top',
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 4.6, 10, 6.2, 14, 7.6],
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 6, 1.3, 10, 1.8],
        'circle-stroke-color': 'rgba(255,255,255,0.94)',
        'circle-opacity': 0.95,
      },
    });

    map.current.addLayer({
      id: 'site-pin-label',
      type: 'symbol',
      source: 'sites-source',
      minzoom: 10,
      slot: 'top',
      layout: {
        'text-field': ['get', 'site_id'],
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 11,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': 'rgba(0, 0, 0, 0.8)',
        'text-halo-width': 2,
      },
    });

    const handleSiteClick = (e) => {
      const p = e.features[0].properties;
      const c = e.features[0].geometry.coordinates.slice();
      focusSiteRef.current?.(p, c, { notify: true });
    };

    const setPointerCursor = () => { map.current.getCanvas().style.cursor = 'pointer'; };
    const clearPointerCursor = () => { map.current.getCanvas().style.cursor = ''; };

    map.current.on('click', 'site-pin', handleSiteClick);
    map.current.on('click', 'site-pin-label', handleSiteClick);
    ['site-pin', 'site-pin-label'].forEach(layer => {
      map.current.on('mouseenter', layer, setPointerCursor);
      map.current.on('mouseleave', layer, clearPointerCursor);
    });

    return () => {
      if (!map.current) return;
      map.current.off('click', 'site-pin', handleSiteClick);
      map.current.off('click', 'site-pin-label', handleSiteClick);
      ['site-pin', 'site-pin-label'].forEach(layer => {
        if (!map.current.getLayer(layer)) return;
        map.current.off('mouseenter', layer, setPointerCursor);
        map.current.off('mouseleave', layer, clearPointerCursor);
      });
    };
  }, [mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const source = map.current.getSource('sites-source');
    if (source) source.setData(sitesGeoJson);
  }, [sitesGeoJson, mapLoaded]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-white/[0.06]">
      {loading && (
        <div className="absolute inset-0 z-20 bg-[var(--bg-base)]/80 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-[var(--text-muted)]">Memuat peta...</span>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute left-3 top-3 z-20 max-w-[280px] rounded-lg border border-amber-400/30 bg-[var(--bg-surface)]/90 p-3 shadow-xl backdrop-blur-md">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-amber-300">Marker peta gagal dimuat</div>
          <div className="mt-1 text-[11px] leading-snug text-[var(--text-secondary)]">
            Data tabel masih bisa dipakai. Klik ulang untuk memuat marker.
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 rounded-md border border-amber-300/30 px-2.5 py-1 text-[10px] font-semibold text-amber-200 transition-colors hover:bg-amber-300/10"
          >
            Retry
          </button>
        </div>
      )}
      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
}
