import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMarkerColor } from '../utils/mapColors';
import { fetchMapSectorViewport, fetchMapSectors } from '../services/api';
import { describeMapboxError, validateMapboxRuntime } from '../utils/mapboxRuntime';
import {
  buildSectorViewportDescriptor,
  sectorStatusLabel,
  SECTOR_MIN_ZOOM,
  shouldShowSectorBandLegend,
} from '../utils/sectorViewport';
import { Layers, Globe2, Satellite } from 'lucide-react';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const SITE_LAYER_IDS = ['site-pin-label', 'site-pin', 'site-pin-halo'];
const SITE_CLUSTER_LAYER_IDS = ['site-cluster-count', 'site-cluster', 'site-cluster-halo'];
const RADIUS_SOURCE_ID = 'site-radius-source';
const RADIUS_LAYER_IDS = ['site-radius-fill', 'site-radius-glow', 'site-radius-outline'];
const SECTOR_VIEWPORT_SOURCE_ID = 'sector-viewport-source';
const SECTOR_SELECTED_SOURCE_ID = 'sector-selected-source';
const SECTOR_LAYER_IDS = [
  'sector-selected-outline',
  'sector-selected-fill',
  'sector-viewport-outline',
  'sector-viewport-fill',
];
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

const EMPTY_GEOJSON = emptyFeatureCollection();

const BAND_FILL_COLOR = [
  'match',
  ['get', 'band'],
  'L900', '#F59E0B',
  'L1800', '#3B82F6',
  'L2100', '#10B981',
  'L2300', '#A855F7',
  '#64748B',
];

const BAND_LINE_COLOR = [
  'match',
  ['get', 'band'],
  'L900', '#FCD34D',
  'L1800', '#93C5FD',
  'L2100', '#6EE7B7',
  'L2300', '#C4B5FD',
  '#94A3B8',
];

const UNCLUSTERED_SITE_FILTER = ['!', ['has', 'point_count']];

function addSiteSourceAndLayers(mapInstance, data = EMPTY_GEOJSON) {
  if (!mapInstance.getSource('sites-source')) {
    mapInstance.addSource('sites-source', {
      type: 'geojson',
      data,
      cluster: true,
      clusterRadius: 42,
      clusterMaxZoom: 11,
    });
  }

  if (!mapInstance.getLayer('site-cluster-halo')) {
    mapInstance.addLayer({
      id: 'site-cluster-halo',
      type: 'circle',
      source: 'sites-source',
      filter: ['has', 'point_count'],
      slot: 'top',
      paint: {
        'circle-color': '#38BDF8',
        'circle-radius': ['step', ['get', 'point_count'], 17, 20, 21, 75, 25],
        'circle-opacity': 0.18,
        'circle-blur': 0.5,
      },
    });
  }
  if (!mapInstance.getLayer('site-cluster')) {
    mapInstance.addLayer({
      id: 'site-cluster',
      type: 'circle',
      source: 'sites-source',
      filter: ['has', 'point_count'],
      slot: 'top',
      paint: {
        'circle-color': ['step', ['get', 'point_count'], '#2563EB', 20, '#1D4ED8', 75, '#1E40AF'],
        'circle-radius': ['step', ['get', 'point_count'], 13, 20, 16, 75, 19],
        'circle-stroke-color': 'rgba(255,255,255,0.82)',
        'circle-stroke-width': 1.4,
        'circle-opacity': 0.92,
      },
    });
  }
  if (!mapInstance.getLayer('site-cluster-count')) {
    mapInstance.addLayer({
      id: 'site-cluster-count',
      type: 'symbol',
      source: 'sites-source',
      filter: ['has', 'point_count'],
      slot: 'top',
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 11,
      },
      paint: {
        'text-color': '#F8FAFC',
        'text-halo-color': 'rgba(15,23,42,0.45)',
        'text-halo-width': 0.8,
      },
    });
  }
  if (!mapInstance.getLayer('site-pin-halo')) {
    mapInstance.addLayer({
      id: 'site-pin-halo',
      type: 'circle',
      source: 'sites-source',
      filter: UNCLUSTERED_SITE_FILTER,
      slot: 'top',
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 8, 10, 12, 14, 16],
        'circle-opacity': 0.34,
        'circle-blur': 0.55,
      },
    });
  }
  if (!mapInstance.getLayer('site-pin')) {
    mapInstance.addLayer({
      id: 'site-pin',
      type: 'circle',
      source: 'sites-source',
      filter: UNCLUSTERED_SITE_FILTER,
      slot: 'top',
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 4.6, 10, 6.2, 14, 7.6],
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 6, 1.3, 10, 1.8],
        'circle-stroke-color': 'rgba(255,255,255,0.94)',
        'circle-opacity': 0.95,
      },
    });
  }
  if (!mapInstance.getLayer('site-pin-label')) {
    mapInstance.addLayer({
      id: 'site-pin-label',
      type: 'symbol',
      source: 'sites-source',
      filter: UNCLUSTERED_SITE_FILTER,
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
  }
}

function addSectorSourcesAndLayers(mapInstance, {
  viewportData = EMPTY_GEOJSON,
  selectedData = EMPTY_GEOJSON,
  visibility = 'none',
} = {}) {
  if (!mapInstance.getSource(SECTOR_VIEWPORT_SOURCE_ID)) {
    mapInstance.addSource(SECTOR_VIEWPORT_SOURCE_ID, {
      type: 'geojson',
      data: viewportData,
    });
  }
  if (!mapInstance.getSource(SECTOR_SELECTED_SOURCE_ID)) {
    mapInstance.addSource(SECTOR_SELECTED_SOURCE_ID, {
      type: 'geojson',
      data: selectedData,
    });
  }

  if (!mapInstance.getLayer('sector-viewport-fill')) {
    mapInstance.addLayer({
      id: 'sector-viewport-fill',
      type: 'fill',
      source: SECTOR_VIEWPORT_SOURCE_ID,
      minzoom: SECTOR_MIN_ZOOM,
      slot: 'top',
      layout: { visibility },
      paint: {
        'fill-color': [
          'match', ['get', 'lod'],
          'lite', '#E85D68',
          'medium', '#F97316',
          BAND_FILL_COLOR,
        ],
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.20, 12, 0.28, 16, 0.32],
      },
    });
  }
  if (!mapInstance.getLayer('sector-viewport-outline')) {
    mapInstance.addLayer({
      id: 'sector-viewport-outline',
      type: 'line',
      source: SECTOR_VIEWPORT_SOURCE_ID,
      minzoom: SECTOR_MIN_ZOOM,
      slot: 'top',
      layout: { visibility },
      paint: {
        'line-color': [
          'match', ['get', 'lod'],
          'lite', '#FDA4AF',
          'medium', '#FDBA74',
          BAND_LINE_COLOR,
        ],
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 13, 1.5, 16, 2.2],
        'line-opacity': 0.86,
      },
    });
  }
  if (!mapInstance.getLayer('sector-selected-fill')) {
    mapInstance.addLayer({
      id: 'sector-selected-fill',
      type: 'fill',
      source: SECTOR_SELECTED_SOURCE_ID,
      slot: 'top',
      layout: { visibility },
      paint: {
        'fill-color': BAND_FILL_COLOR,
        'fill-opacity': 0.55,
      },
    });
  }
  if (!mapInstance.getLayer('sector-selected-outline')) {
    mapInstance.addLayer({
      id: 'sector-selected-outline',
      type: 'line',
      source: SECTOR_SELECTED_SOURCE_ID,
      slot: 'top',
      layout: { visibility },
      paint: {
        'line-color': '#FDE68A',
        'line-width': 3.2,
        'line-opacity': 0.95,
      },
    });
  }
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

function normalizeSiteData(site, coordinates) {
  const longitude = Number(coordinates?.[0] ?? site?.longitude);
  const latitude = Number(coordinates?.[1] ?? site?.latitude);
  return {
    site_id: site?.site_id || '',
    site_name: site?.site_name || '',
    kabupaten: site?.kabupaten || '',
    site_class: site?.site_class || '',
    status_site: site?.status_site || '',
    nop: site?.nop || '',
    cluster: site?.cluster || '',
    type_site: site?.type_site || '',
    avg_availability: site?.avg_availability == null ? null : Number(site.avg_availability),
    total_outage_menit: site?.total_outage_menit == null ? null : Number(site.total_outage_menit),
    jumlah_cell: site?.jumlah_cell == null ? null : Number(site.jumlah_cell),
    rca_dominan: site?.rca_dominan || '',
    latitude,
    longitude,
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
          nop: site.nop || '',
          cluster: site.cluster || '',
          type_site: site.type_site || '',
          avg_availability: site.avg_availability,
          total_outage_menit: site.total_outage_menit,
          jumlah_cell: site.jumlah_cell,
          rca_dominan: site.rca_dominan || '',
          latitude: site.latitude,
          longitude: site.longitude,
          color: getMarkerColor(site.avg_availability, site.status_site),
        },
        geometry: { type: 'Point', coordinates: [site.longitude, site.latitude] },
      })),
  };
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
  onSiteSelect,
  onSectorStatusChange,
  selectedSiteId,
  selectedSiteFocusKey = 0,
  selectedSiteFallback,
  filters = {},
  layoutResizeKey = 0,
}) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const sitesRef = useRef([]);
  const onSiteSelectRef = useRef(onSiteSelect);
  const cameraProgrammatic = useRef(false);
  const lastFocusedRequest = useRef(null);
  const sectorViewportRef = useRef(EMPTY_GEOJSON);
  const selectedSectorsRef = useRef(EMPTY_GEOJSON);
  const viewportAbortRef = useRef(null);
  const selectedSectorAbortRef = useRef(null);
  const viewportRequestKeyRef = useRef(null);
  const viewportDebounceRef = useRef(null);
  const resizeFrame = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInitError, setMapInitError] = useState(null);
  const [mapRetryKey, setMapRetryKey] = useState(0);
  const [mapStyle, setMapStyle] = useState('standard');
  const [showSectors, setShowSectors] = useState(false);
  const mapStyleRef = useRef('standard');
  const showSectorsRef = useRef(false);
  const [sectorViewportState, setSectorViewport] = useState({ key: null, geoJson: EMPTY_GEOJSON });
  const [selectedSectorState, setSelectedSectors] = useState({ siteId: null, geoJson: EMPTY_GEOJSON });
  const [sectorStatus, setSectorStatus] = useState({ kind: 'off', count: 0, lod: 'none' });
  const [viewportDescriptor, setViewportDescriptor] = useState(null);
  const sitesGeoJson = useMemo(() => buildSitesGeoJson(sites), [sites]);
  const sectorViewport = showSectors
    && viewportDescriptor
    && sectorViewportState.key === viewportDescriptor.key
    ? sectorViewportState.geoJson
    : EMPTY_GEOJSON;
  const selectedSectors = showSectors
    && selectedSiteId
    && selectedSectorState.siteId === selectedSiteId
    ? selectedSectorState.geoJson
    : EMPTY_GEOJSON;
  const showBandLegend = showSectors
    && shouldShowSectorBandLegend(sectorStatus, selectedSectors.features.length);
  const sectorStatusText = sectorStatusLabel(sectorStatus);

  useEffect(() => {
    sitesRef.current = sites || [];
  }, [sites]);

  useEffect(() => {
    onSiteSelectRef.current = onSiteSelect;
  }, [onSiteSelect]);

  useEffect(() => {
    onSectorStatusChange?.(sectorStatus);
  }, [onSectorStatusChange, sectorStatus]);

  const scheduleMapResize = useCallback((delay = 0) => {
    if (!map.current || typeof window === 'undefined') return;

    const resize = () => {
      if (!map.current) return;
      if (resizeFrame.current) window.cancelAnimationFrame(resizeFrame.current);

      resizeFrame.current = window.requestAnimationFrame(() => {
        resizeFrame.current = null;
        map.current?.resize();
      });
    };

    if (delay > 0) {
      window.setTimeout(resize, delay);
      return;
    }

    resize();
  }, []);

  useEffect(() => {
    const node = mapContainer.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => scheduleMapResize());
    observer.observe(node);

    return () => observer.disconnect();
  }, [scheduleMapResize]);

  useEffect(() => {
    scheduleMapResize();
    scheduleMapResize(340);
  }, [layoutResizeKey, scheduleMapResize]);

  useEffect(() => {
    if (!map.current || !mapLoaded || !showSectors) return undefined;

    const publishDescriptor = () => {
      if (viewportDebounceRef.current) {
        window.clearTimeout(viewportDebounceRef.current);
      }
      viewportDebounceRef.current = window.setTimeout(() => {
        viewportDebounceRef.current = null;
        if (!map.current) return;
        try {
          const descriptor = buildSectorViewportDescriptor(map.current, filters);
          if (descriptor.lod === 'none') {
            viewportAbortRef.current?.abort();
            viewportRequestKeyRef.current = descriptor.key;
            setViewportDescriptor(null);
            setSectorViewport({ key: null, geoJson: EMPTY_GEOJSON });
            setSectorStatus({ kind: 'zoom-required', count: 0, lod: 'none' });
            return;
          }
          setSectorStatus({ kind: 'loading', count: 0, lod: descriptor.lod });
          setViewportDescriptor(previous => previous?.key === descriptor.key ? previous : descriptor);
        } catch (error) {
          setViewportDescriptor(null);
          setSectorViewport({ key: null, geoJson: EMPTY_GEOJSON });
          setSectorStatus({ kind: 'error', count: 0, lod: 'none', message: error.message });
        }
      }, 180);
    };

    publishDescriptor();

    map.current.on('zoomend', publishDescriptor);
    map.current.on('moveend', publishDescriptor);
    return () => {
      map.current?.off('zoomend', publishDescriptor);
      map.current?.off('moveend', publishDescriptor);
      if (viewportDebounceRef.current) {
        window.clearTimeout(viewportDebounceRef.current);
        viewportDebounceRef.current = null;
      }
    };
  }, [filters, mapLoaded, showSectors]);

  useEffect(() => {
    if (!showSectors || !viewportDescriptor) return undefined;

    viewportAbortRef.current?.abort();
    const descriptor = viewportDescriptor;
    const controller = new AbortController();
    viewportAbortRef.current = controller;
    viewportRequestKeyRef.current = descriptor.key;

    fetchMapSectorViewport({
      bbox: descriptor.bbox,
      zoom: descriptor.zoom,
      filters: {
        nop: descriptor.nop || undefined,
        kabupaten: descriptor.kabupaten || undefined,
        cluster: descriptor.cluster || undefined,
        kelas: descriptor.kelas || undefined,
        q: descriptor.q || undefined,
      },
      signal: controller.signal,
    })
      .then((geoJson) => {
        if (controller.signal.aborted || viewportRequestKeyRef.current !== descriptor.key) return;
        const metadata = geoJson?.metadata || {};
        if (metadata.limit_exceeded || metadata.zoom_required) {
          setSectorViewport({ key: descriptor.key, geoJson: EMPTY_GEOJSON });
          setSectorStatus({ kind: 'limit', count: 0, lod: metadata.lod || descriptor.lod });
          return;
        }
        const nextGeoJson = geoJson || EMPTY_GEOJSON;
        setSectorViewport({ key: descriptor.key, geoJson: nextGeoJson });
        setSectorStatus({
          kind: 'ready',
          count: nextGeoJson.features?.length || 0,
          lod: metadata.lod || descriptor.lod,
        });
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.code === 'ERR_CANCELED') return;
        console.error('Failed to load bounded sector polygons:', err);
        if (viewportRequestKeyRef.current === descriptor.key) {
          setSectorViewport({ key: descriptor.key, geoJson: EMPTY_GEOJSON });
          setSectorStatus({ kind: 'error', count: 0, lod: descriptor.lod });
        }
      });

    return () => controller.abort();
  }, [showSectors, viewportDescriptor]);

  useEffect(() => {
    selectedSectorAbortRef.current?.abort();
    if (!showSectors || !selectedSiteId) {
      return undefined;
    }

    const controller = new AbortController();
    selectedSectorAbortRef.current = controller;

    fetchMapSectors({ siteId: selectedSiteId, signal: controller.signal })
      .then((geoJson) => {
        if (!controller.signal.aborted) {
          setSelectedSectors({ siteId: selectedSiteId, geoJson: geoJson || EMPTY_GEOJSON });
        }
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.code === 'ERR_CANCELED') return;
        console.error('Failed to load selected sector polygons:', err);
        setSelectedSectors({ siteId: selectedSiteId, geoJson: EMPTY_GEOJSON });
      });

    return () => controller.abort();
  }, [selectedSiteId, showSectors]);

  useEffect(() => {
    sectorViewportRef.current = sectorViewport;
  }, [sectorViewport]);

  useEffect(() => {
    selectedSectorsRef.current = selectedSectors;
  }, [selectedSectors]);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    setMapInitError(null);
    setMapLoaded(false);
    const preflightError = validateMapboxRuntime({
      token: MAPBOX_TOKEN,
      mapbox: mapboxgl,
      container: mapContainer.current,
    });
    if (preflightError) {
      setMapInitError(preflightError.message);
      return undefined;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;
    let mapInstance;
    try {
      mapInstance = new mapboxgl.Map({
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
      map.current = mapInstance;
      mapInstance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      mapInstance.addControl(new mapboxgl.FullscreenControl(), 'top-right');
    } catch (err) {
      setMapInitError(describeMapboxError({ error: err }).message);
      map.current = null;
      return undefined;
    }

    const onStyleLoad = () => {
      if (mapStyleRef.current !== 'standard') return;
      try {
        applyDuskScene(mapInstance);
      } catch (err) {
        setMapInitError(describeMapboxError({ error: err }).message);
      }
    };
    const onLoad = () => {
      try {
        applyDuskScene(mapInstance);
        setMapLoaded(true);
      } catch (err) {
        setMapInitError(describeMapboxError({ error: err }).message);
      }
    };
    const onMapError = (event) => {
      const issue = describeMapboxError(event);
      if (issue.fatal) setMapInitError(issue.message);
      else console.warn('Mapbox resource error:', issue.message);
    };
    mapInstance.on('style.load', onStyleLoad);
    mapInstance.on('load', onLoad);
    mapInstance.on('error', onMapError);

    return () => {
      mapInstance.off('style.load', onStyleLoad);
      mapInstance.off('load', onLoad);
      mapInstance.off('error', onMapError);
      if (resizeFrame.current && typeof window !== 'undefined') {
        window.cancelAnimationFrame(resizeFrame.current);
        resizeFrame.current = null;
      }
      mapInstance.remove();
      map.current = null;
    };
  }, [mapRetryKey]);

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

    const radiusBeforeLayer = map.current.getLayer('sector-viewport-fill')
      ? 'sector-viewport-fill'
      : (map.current.getLayer('site-pin-halo') ? 'site-pin-halo' : undefined);

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

      RADIUS_LAYER_IDS.forEach((layerId) => {
        if (map.current.getLayer(layerId) && radiusBeforeLayer) {
          map.current.moveLayer(layerId, radiusBeforeLayer);
        }
      });
      return;
    }

    map.current.addSource(RADIUS_SOURCE_ID, {
      type: 'geojson',
      data: radiusGeoJson,
    });

    map.current.addLayer({
      id: 'site-radius-fill',
      type: 'fill',
      source: RADIUS_SOURCE_ID,
      slot: 'top',
      paint: {
        'fill-color': '#F97316',
        'fill-opacity': 0.28,
      },
    }, radiusBeforeLayer);

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
    }, radiusBeforeLayer);

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
    }, radiusBeforeLayer);
  }, []);

  const focusSite = useCallback((coordinates) => {
    if (!map.current) return;

    clearRadius();
    updateRadius(coordinates);

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
    });
  }, [clearRadius, updateRadius]);

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
    if (!map.current || !mapLoaded) return;
    if (!selectedSiteId) {
      lastFocusedRequest.current = null;
      clearRadius();
      return;
    }

    const requestKey = `${selectedSiteId}:${selectedSiteFocusKey}`;
    if (requestKey === lastFocusedRequest.current) return;

    const site = sitesRef.current.find(s => s.site_id === selectedSiteId)
      || (selectedSiteFallback?.site_id === selectedSiteId ? selectedSiteFallback : null);
    const longitude = Number(site?.longitude);
    const latitude = Number(site?.latitude);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;

    lastFocusedRequest.current = requestKey;
    focusSite([longitude, latitude]);
  }, [selectedSiteId, selectedSiteFocusKey, selectedSiteFallback, mapLoaded, focusSite, clearRadius]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    [...SITE_LAYER_IDS, ...SITE_CLUSTER_LAYER_IDS, ...RADIUS_LAYER_IDS, ...SECTOR_LAYER_IDS, ...LEGACY_LAYER_IDS].forEach(id => {
      if (map.current.getLayer(id)) map.current.removeLayer(id);
    });
    if (map.current.getSource(RADIUS_SOURCE_ID)) map.current.removeSource(RADIUS_SOURCE_ID);
    if (map.current.getSource(SECTOR_VIEWPORT_SOURCE_ID)) map.current.removeSource(SECTOR_VIEWPORT_SOURCE_ID);
    if (map.current.getSource(SECTOR_SELECTED_SOURCE_ID)) map.current.removeSource(SECTOR_SELECTED_SOURCE_ID);
    if (map.current.getSource('sites-source')) map.current.removeSource('sites-source');

    addSectorSourcesAndLayers(map.current, {
      viewportData: EMPTY_GEOJSON,
      selectedData: EMPTY_GEOJSON,
      visibility: showSectorsRef.current ? 'visible' : 'none',
    });
    addSiteSourceAndLayers(map.current, EMPTY_GEOJSON);

    const handleSiteClick = (e) => {
      const p = e.features[0].properties;
      const c = e.features[0].geometry.coordinates.slice();
      onSiteSelectRef.current?.(normalizeSiteData(p, c));
    };

    const handleClusterClick = (e) => {
      const feature = e.features?.[0];
      const clusterId = feature?.properties?.cluster_id;
      const coordinates = feature?.geometry?.coordinates?.slice();
      const source = map.current?.getSource('sites-source');
      if (clusterId == null || !coordinates || !source?.getClusterExpansionZoom) return;

      source.getClusterExpansionZoom(clusterId, (error, zoom) => {
        if (error || !Number.isFinite(zoom) || !map.current) return;
        map.current.easeTo({ center: coordinates, zoom });
      });
    };

    const setPointerCursor = () => { map.current.getCanvas().style.cursor = 'pointer'; };
    const clearPointerCursor = () => { map.current.getCanvas().style.cursor = ''; };

    map.current.on('click', 'site-pin', handleSiteClick);
    map.current.on('click', 'site-pin-label', handleSiteClick);
    map.current.on('click', 'site-cluster', handleClusterClick);
    ['site-pin', 'site-pin-label', 'site-cluster'].forEach(layer => {
      map.current.on('mouseenter', layer, setPointerCursor);
      map.current.on('mouseleave', layer, clearPointerCursor);
    });

    return () => {
      if (!map.current) return;
      map.current.off('click', 'site-pin', handleSiteClick);
      map.current.off('click', 'site-pin-label', handleSiteClick);
      map.current.off('click', 'site-cluster', handleClusterClick);
      ['site-pin', 'site-pin-label', 'site-cluster'].forEach(layer => {
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

  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const source = map.current.getSource(SECTOR_VIEWPORT_SOURCE_ID);
    if (source) source.setData(sectorViewport);
  }, [sectorViewport, mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const source = map.current.getSource(SECTOR_SELECTED_SOURCE_ID);
    if (source) source.setData(selectedSectors);
  }, [selectedSectors, mapLoaded]);

  const handleToggleSectors = useCallback(() => {
    const nextVisible = !showSectors;
    showSectorsRef.current = nextVisible;
    if (!nextVisible) {
      viewportAbortRef.current?.abort();
      selectedSectorAbortRef.current?.abort();
      viewportRequestKeyRef.current = null;
      setViewportDescriptor(null);
      setSectorViewport({ key: null, geoJson: EMPTY_GEOJSON });
      setSelectedSectors({ siteId: null, geoJson: EMPTY_GEOJSON });
      setSectorStatus({ kind: 'off', count: 0, lod: 'none' });
    } else {
      setSectorStatus({ kind: 'loading', count: 0, lod: 'none' });
    }
    setShowSectors(nextVisible);
  }, [showSectors]);

  // --- Sector layer visibility toggle ---
  useEffect(() => {
    showSectorsRef.current = showSectors;
    if (!map.current || !mapLoaded) return;
    const visibility = showSectors ? 'visible' : 'none';
    SECTOR_LAYER_IDS.forEach(layerId => {
      if (map.current.getLayer(layerId)) {
        map.current.setLayoutProperty(layerId, 'visibility', visibility);
      }
    });
  }, [showSectors, mapLoaded]);

  // --- Basemap style toggle handler ---
  const handleToggleMapStyle = useCallback(() => {
    if (!map.current) return;
    const newStyle = mapStyle === 'standard' ? 'satellite' : 'standard';
    setMapStyle(newStyle);
    mapStyleRef.current = newStyle;

    const styleUrl = newStyle === 'satellite'
      ? 'mapbox://styles/mapbox/satellite-streets-v12'
      : 'mapbox://styles/mapbox/standard';

    // Save current camera state
    const center = map.current.getCenter();
    const zoom = map.current.getZoom();
    const pitch = map.current.getPitch();
    const bearing = map.current.getBearing();

    try {
      map.current.setStyle(styleUrl, {
        diff: false,
        ...(newStyle === 'standard' ? {
          config: {
            basemap: {
              lightPreset: 'dusk',
              showPointOfInterestLabels: false,
              showTransitLabels: false,
            },
          },
        } : {}),
      });
    } catch (err) {
      setMapInitError(describeMapboxError({ error: err }).message);
      return;
    }

    map.current.once('style.load', () => {
      // Restore camera
      map.current.jumpTo({ center, zoom, pitch, bearing });

      // Re-apply dusk scene for standard style
      if (newStyle === 'standard') {
        applyDuskScene(map.current);
      }

      // Re-add all custom sources and layers.
      const sectorVisibility = showSectorsRef.current ? 'visible' : 'none';
      addSectorSourcesAndLayers(map.current, {
        viewportData: sectorViewportRef.current,
        selectedData: selectedSectorsRef.current,
        visibility: sectorVisibility,
      });
      addSiteSourceAndLayers(map.current, sitesGeoJson || EMPTY_GEOJSON);
    });
  }, [mapStyle, sitesGeoJson]);

  const BAND_LEGEND = [
    { band: 'L900', color: '#F59E0B', label: '900 MHz' },
    { band: 'L1800', color: '#3B82F6', label: '1800 MHz' },
    { band: 'L2100', color: '#10B981', label: '2100 MHz' },
    { band: 'L2300', color: '#A855F7', label: '2300 MHz' },
  ];

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-[var(--border)]">
      {mapInitError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--bg-base)]/90 p-6 backdrop-blur-sm">
          <div className="max-w-md rounded-xl border border-red-400/30 bg-[var(--bg-surface)] p-5 text-center shadow-xl">
            <div className="text-sm font-semibold text-red-300">Basemap tidak tersedia</div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{mapInitError}</p>
            <button
              type="button"
              onClick={() => {
                setMapInitError(null);
                setMapRetryKey(key => key + 1);
              }}
              className="mt-3 rounded-md border border-red-300/30 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-300/10"
            >
              Coba lagi
            </button>
          </div>
        </div>
      )}
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
      {!loading && !error && !mapInitError && sites.length === 0 && (
        <div className="absolute left-3 top-3 z-20 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]/90 px-3 py-2 text-xs text-[var(--text-secondary)] shadow-lg">
          Belum ada data marker untuk periode dan filter ini.
        </div>
      )}
      {/* Sector band legend appears only for band-specific geometry. */}
      {showBandLegend && (
        <div className="nod-sector-legend absolute bottom-3 left-3 z-10 px-3 py-2.5">
          <p className="nod-sector-legend-title text-[9px] font-semibold uppercase tracking-widest mb-1.5">
            Sector Bands
          </p>
          <div className="flex flex-col gap-1">
            {BAND_LEGEND.map(({ band, color, label }) => (
              <div key={band} className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}66` }}
                />
                <span className="nod-sector-legend-item text-[10px] font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Map control toggles at bottom right. */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-2">
        {/* Basemap Toggle */}
        <button
          type="button"
          onClick={handleToggleMapStyle}
          className="nod-map-toggle"
          title={mapStyle === 'standard' ? 'Switch to Satellite' : 'Switch to Standard'}
          aria-label="Toggle map basemap"
        >
          {mapStyle === 'standard'
            ? <Satellite className="w-4 h-4" />
            : <Globe2 className="w-4 h-4" />
          }
          <span className="text-[10px] font-semibold">
            {mapStyle === 'standard' ? 'Satellite' : 'Standard'}
          </span>
        </button>

        {/* Sector Layer Toggle */}
        <button
          type="button"
          onClick={handleToggleSectors}
          className={`nod-map-toggle ${showSectors ? 'nod-map-toggle--active' : ''}`}
          title={showSectors ? 'Hide Sector Coverage' : 'Show Sector Coverage'}
          aria-label="Toggle sector layer visibility"
        >
          <Layers className="w-4 h-4" />
          <span className="text-[10px] font-semibold">
            <span aria-live="polite">{sectorStatusText}</span>
          </span>
        </button>
      </div>

      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
}
