import { useRef, useEffect, useMemo, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { RF_COLORS } from './rfTiltChartConfig';
import { domElement, textElement } from '../../utils/safeMapDom';
import { describeMapboxError, validateMapboxRuntime } from '../../utils/mapboxRuntime';
import { fetchMapSectors } from '../../services/api';
import { prepareSiteSectorDisplayGeoJson } from './rfTiltSiteUtils';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const C = RF_COLORS;
const EARTH_R = 6371000;
const SITE_SECTOR_SOURCE_ID = 'rf-site-sectors';
const SITE_SECTOR_LAYER_IDS = ['rf-site-sectors-fill', 'rf-site-sectors-outline'];
const EMPTY_SECTOR_GEOJSON = { type: 'FeatureCollection', features: [] };

/* ─── Map style options ────────────────────────────────────────────── */
const MAP_STYLES = [
  { id: 'dark',      label: 'Dark',      url: 'mapbox://styles/mapbox/dark-v11' },
  { id: 'satellite', label: 'Satellite',  url: 'mapbox://styles/mapbox/satellite-streets-v12' },
  { id: 'buildings', label: '3D Buildings', url: 'mapbox://styles/mapbox/standard' },
  { id: 'sectors',   label: 'All Sectors', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
];

function featureCollectionOrEmpty(value) {
  return value?.type === 'FeatureCollection' && Array.isArray(value.features)
    ? value
    : EMPTY_SECTOR_GEOJSON;
}

function apply3DBuildingScene(map) {
  if (!map) return;
  if (typeof map.setConfigProperty === 'function') {
    map.setConfigProperty('basemap', 'lightPreset', 'day');
    map.setConfigProperty('basemap', 'show3dObjects', true);
    map.setConfigProperty('basemap', 'showPointOfInterestLabels', false);
    map.setConfigProperty('basemap', 'showTransitLabels', false);
  }
}

/* ─── Geo helpers ──────────────────────────────────────────────────── */
function destinationPointJS(lat, lon, azimuthDeg, distanceM) {
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const brng = (azimuthDeg * Math.PI) / 180;
  const dR = distanceM / EARTH_R;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dR) + Math.cos(lat1) * Math.sin(dR) * Math.cos(brng),
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(dR) * Math.cos(lat1),
    Math.cos(dR) - Math.sin(lat1) * Math.sin(lat2),
  );
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

function closestProfileElevation(beam, distanceM) {
  if (!beam?.profile?.length || !Number.isFinite(distanceM)) return null;
  return beam.profile.reduce((closest, point) => (
    Math.abs(point.distance - distanceM) < Math.abs(closest.distance - distanceM) ? point : closest
  )).elevation;
}

function verticalBeamEnvelopeHeight(result, params) {
  const distanceM = result.far_m ?? result.main_m ?? result.max_distance_used ?? params.max_distance;
  const upper = closestProfileElevation(result.upper_beam, distanceM);
  const lower = closestProfileElevation(result.lower_beam, distanceM);
  const profileSpan = Number.isFinite(upper) && Number.isFinite(lower) ? Math.abs(lower - upper) : null;
  const configuredSpan = Number.isFinite(distanceM)
    ? Math.abs(2 * distanceM * Math.tan(((params.vertical_beamwidth ?? 0) * Math.PI) / 360))
    : 0;

  return Math.min(320, Math.max(12, profileSpan ?? configuredSpan));
}

/* ─── Tower marker with site ID label ──────────────────────────────── */
function createTowerMarkerElement(azimuthDeg, siteId) {
  const el = domElement('div', {
    style: {
      cursor: 'pointer', position: 'relative', width: '40px', height: '50px', overflow: 'visible',
    },
  });
  if (siteId) {
    el.append(textElement('div', siteId, {
      style: {
        position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(6px)', border: `1px solid ${C.main}44`,
        borderRadius: '6px', padding: '2px 8px', whiteSpace: 'nowrap', marginBottom: '4px',
        fontSize: '10px', fontWeight: '700', color: C.main, fontFamily: 'Inter, system-ui, sans-serif',
        letterSpacing: '.3px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      },
    }));
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '40');
  svg.setAttribute('height', '50');
  svg.setAttribute('viewBox', '0 0 40 50');
  const appendSvg = (tag, attributes) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
    svg.append(node);
    return node;
  };
  const line = (x1, y1, x2, y2, stroke, width) => appendSvg('line', {
    x1, y1, x2, y2, stroke, 'stroke-width': width,
  });
  line(14, 50, 18, 12, C.towerStruct, 1.8);
  line(26, 50, 22, 12, C.towerStruct, 1.8);
  line(15, 40, 25, 40, C.towerBrace, 1.2);
  line(16.5, 30, 23.5, 30, C.towerBrace, 1.2);
  line(17.5, 20, 22.5, 20, C.towerBrace, 1.2);
  line(15, 40, 23.5, 30, C.towerDiag, 0.7);
  line(25, 40, 16.5, 30, C.towerDiag, 0.7);
  line(16.5, 30, 22.5, 20, C.towerDiag, 0.7);
  line(23.5, 30, 17.5, 20, C.towerDiag, 0.7);
  appendSvg('rect', { x: 12, y: 48, width: 16, height: 3, rx: 1, fill: C.towerBrace, opacity: 0.5 });
  line(20, 12, 20, 2, '#e2e8f0', 1.8);
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const safeAzimuth = Number.isFinite(Number(azimuthDeg)) ? Number(azimuthDeg) : 0;
  group.setAttribute('transform', `rotate(${safeAzimuth} 20 8)`);
  const panel = (attributes) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
    group.append(node);
  };
  panel({ x: 18, y: 2, width: 4, height: 10, rx: 1, fill: C.main, opacity: 0.9 });
  panel({ x: 12, y: 4, width: 3.5, height: 8, rx: 1, fill: C.main, opacity: 0.55, transform: 'rotate(-12 14 8)' });
  panel({ x: 24.5, y: 4, width: 3.5, height: 8, rx: 1, fill: C.main, opacity: 0.55, transform: 'rotate(12 26 8)' });
  svg.append(group);
  appendSvg('circle', { cx: 20, cy: 2, r: 2, fill: C.beacon, opacity: 0.9 });
  appendSvg('circle', { cx: 20, cy: 2, r: 4, fill: C.beacon, opacity: 0.15 });
  el.append(svg);
  return el;
}

function createRoundMarker(color, size, glowSize) {
  const marker = domElement('div');
  marker.append(domElement('div', {
    style: {
      width: `${size}px`, height: `${size}px`, borderRadius: '50%', background: color,
      border: '2px solid #fff', boxShadow: `0 0 0 ${glowSize}px ${color}33, 0 2px 6px rgba(0,0,0,0.3)`,
    },
  }));
  return marker;
}

function createRfPopup(title, color, rows) {
  const root = domElement('div', {
    style: {
      background: 'rgba(15,23,42,0.92)', backdropFilter: 'blur(8px)', border: `1px solid ${color}44`,
      borderRadius: '8px', padding: '8px 12px', color: '#f1f5f9', fontFamily: 'Inter, system-ui, sans-serif',
    },
  });
  root.append(textElement('div', title, {
    style: {
      fontSize: '10px', color, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.5px',
      marginBottom: '3px',
    },
  }));
  const body = domElement('div', { style: { fontSize: '11px', color: '#94a3b8', lineHeight: '1.5' } });
  rows.forEach(([label, value, valueColor = '#f1f5f9']) => {
    const row = domElement('div');
    row.append(
      textElement('span', `${label}: `),
      textElement('b', value, { style: { color: valueColor } }),
    );
    body.append(row);
  });
  root.append(body);
  return root;
}

/* ─── Impact marker with popup ─────────────────────────────────────── */
function createImpactMarker(map, lngLat, color, label, distance) {
  const el = createRoundMarker(color, 14, 3);
  el.style.cursor = 'pointer';

  const popup = new mapboxgl.Popup({
    offset: 16, closeButton: false, closeOnClick: false,
    className: 'rf-map-popup',
  }).setDOMContent(createRfPopup(label, color, [['Distance', `${Math.round(distance)} m from tower`]]));

  const marker = new mapboxgl.Marker({ element: el })
    .setLngLat(lngLat)
    .addTo(map);

  el.addEventListener('mouseenter', () => popup.setLngLat(lngLat).addTo(map));
  el.addEventListener('mouseleave', () => popup.remove());

  return { marker, popup };
}

/* ═══════════════════════════════════════════════════════════════════════
   Map Component
   ═══════════════════════════════════════════════════════════════════════ */
export default function RfTiltMap({ result, params, onMapClick, targetMode, selectedSiteId }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const popupsRef = useRef([]);
  const hoverPopupRef = useRef(null);
  const onMapClickRef = useRef(onMapClick);
  const currentStyleRef = useRef('dark');
  const [currentStyle, setCurrentStyle] = useState('dark');
  const [is3D, setIs3D] = useState(false);
  const [terrainExaggeration, setTerrainExaggeration] = useState(1.5);
  const [mapInitError, setMapInitError] = useState(null);
  const [mapRetryKey, setMapRetryKey] = useState(0);
  const [siteSectorState, setSiteSectorState] = useState({
    siteId: null,
    geoJson: EMPTY_SECTOR_GEOJSON,
    loading: false,
    error: null,
  });

  const activeSiteSectors = siteSectorState.siteId === selectedSiteId
    ? featureCollectionOrEmpty(siteSectorState.geoJson)
    : EMPTY_SECTOR_GEOJSON;
  const displaySiteSectors = useMemo(
    () => prepareSiteSectorDisplayGeoJson(activeSiteSectors),
    [activeSiteSectors],
  );
  const separatedSectorCount = displaySiteSectors.features.filter(
    feature => Number(feature?.properties?.overlap_index) > 0,
  ).length;
  const siteSectorsLoading = Boolean(selectedSiteId && siteSectorState.siteId !== selectedSiteId);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedSiteId) return undefined;

    fetchMapSectors({ siteId: selectedSiteId })
      .then((geoJson) => {
        if (cancelled) return;
        setSiteSectorState({
          siteId: selectedSiteId,
          geoJson: featureCollectionOrEmpty(geoJson),
          loading: false,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setSiteSectorState({
          siteId: selectedSiteId,
          geoJson: EMPTY_SECTOR_GEOJSON,
          loading: false,
          error: error?.message || 'Data sektor tidak dapat dimuat.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSiteId]);

  /* ── Initialise map ─────────────────────────────────────────────── */
  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;
    setMapInitError(null);
    const preflightError = validateMapboxRuntime({
      token: MAPBOX_TOKEN,
      mapbox: mapboxgl,
      container: mapContainer.current,
    });
    if (preflightError) {
      setMapInitError(preflightError.message);
      return undefined;
    }

    const style = MAP_STYLES.find(s => s.id === currentStyle) || MAP_STYLES[0];
    mapboxgl.accessToken = MAPBOX_TOKEN;
    let mapInstance;
    try {
      mapInstance = new mapboxgl.Map({
        container: mapContainer.current,
        style: style.url,
        center: [params.longitude, params.latitude],
        zoom: 14,
        // Required so html-to-image can include the WebGL map canvas in PNG exports.
        preserveDrawingBuffer: true,
      });
      mapRef.current = mapInstance;
      mapInstance.addControl(new mapboxgl.NavigationControl(), 'top-right');
    } catch (err) {
      setMapInitError(describeMapboxError({ error: err }).message);
      mapRef.current = null;
      return undefined;
    }

    const onLoad = () => {
      try {
        mapInstance.resize();
        // Pre-add DEM source so it's ready when 3D is toggled
        if (!mapInstance.getSource('mapbox-dem')) {
          mapInstance.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14,
          });
        }
      } catch (err) {
        setMapInitError(describeMapboxError({ error: err }).message);
      }
    };

    const onClick = (e) => {
      onMapClickRef.current?.(e.lngLat.lat, e.lngLat.lng);
    };
    const onMapError = (event) => {
      const issue = describeMapboxError(event);
      if (issue.fatal) setMapInitError(issue.message);
      else console.warn('RF Tilt Mapbox resource error:', issue.message);
    };

    mapInstance.on('load', onLoad);
    mapInstance.on('click', onClick);
    mapInstance.on('error', onMapError);

    // Hover popup for polygons
    hoverPopupRef.current = new mapboxgl.Popup({
      closeButton: false, closeOnClick: false, offset: 12,
      className: 'rf-map-popup',
    });

    return () => {
      mapInstance.off('load', onLoad);
      mapInstance.off('click', onClick);
      mapInstance.off('error', onMapError);
      markersRef.current.forEach(marker => marker.remove());
      popupsRef.current.forEach(popup => popup.remove());
      hoverPopupRef.current?.remove();
      markersRef.current = [];
      popupsRef.current = [];
      hoverPopupRef.current = null;
      mapInstance.remove();
      mapRef.current = null;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRetryKey]);

  /* ── Apply / remove 3D terrain ─────────────────────────────────── */
  const apply3DTerrain = (map, enable, exaggeration = 1.5) => {
    if (!map) return;
    // Ensure DEM source exists
    if (!map.getSource('mapbox-dem')) {
      map.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      });
    }
    if (enable) {
      map.setTerrain({ source: 'mapbox-dem', exaggeration });
      // Add sky atmosphere
      if (!map.getLayer('sky-layer')) {
        map.addLayer({
          id: 'sky-layer',
          type: 'sky',
          paint: {
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0.0, 0.0],
            'sky-atmosphere-sun-intensity': 15,
          },
        });
      }
    } else {
      map.setTerrain(null);
      if (map.getLayer('sky-layer')) {
        map.removeLayer('sky-layer');
      }
    }
  };

  const syncSiteSectorLayers = (map, styleId = currentStyleRef.current) => {
    if (!map) return;
    const visibility = styleId === 'sectors' ? 'visible' : 'none';
    const existingSource = map.getSource(SITE_SECTOR_SOURCE_ID);

    if (existingSource) {
      existingSource.setData(displaySiteSectors);
    } else {
      map.addSource(SITE_SECTOR_SOURCE_ID, { type: 'geojson', data: displaySiteSectors });
    }

    if (!map.getLayer('rf-site-sectors-fill')) {
      map.addLayer({
        id: 'rf-site-sectors-fill',
        type: 'fill',
        source: SITE_SECTOR_SOURCE_ID,
        minzoom: 10,
        layout: { visibility },
        paint: {
          'fill-color': [
            'match', ['get', 'band'],
            'L900', '#facc15',
            'L1800', '#22d3ee',
            'L2100', '#34d399',
            'L2300', '#c084fc',
            '#fb7185',
          ],
          'fill-opacity': 0.48,
        },
      });
    }

    if (!map.getLayer('rf-site-sectors-outline')) {
      map.addLayer({
        id: 'rf-site-sectors-outline',
        type: 'line',
        source: SITE_SECTOR_SOURCE_ID,
        minzoom: 10,
        layout: { visibility },
        paint: {
          'line-color': [
            'match', ['get', 'band'],
            'L900', '#fef08a',
            'L1800', '#a5f3fc',
            'L2100', '#a7f3d0',
            'L2300', '#e9d5ff',
            '#fecdd3',
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 16, 3],
          'line-opacity': 0.98,
        },
      });
    }

    SITE_SECTOR_LAYER_IDS.forEach((layerId) => {
      if (!map.getLayer(layerId)) return;
      map.setLayoutProperty(layerId, 'visibility', visibility);
      map.moveLayer(layerId);
    });
  };

  /* ── Toggle 3D with smooth camera transition ──────────────────── */
  const toggle3D = () => {
    const map = mapRef.current;
    if (!map || currentStyleRef.current === 'sectors') return;
    const next3D = !is3D;
    setIs3D(next3D);

    if (next3D) {
      apply3DTerrain(map, true, terrainExaggeration);
      // Fly to a 3D perspective view
      map.easeTo({
        pitch: 60,
        bearing: params.azimuth ?? 0,
        zoom: Math.max(map.getZoom(), 13),
        duration: 1200,
      });
    } else {
      apply3DTerrain(map, false);
      // Reset to flat top-down view
      map.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 800,
      });
    }
  };

  /* ── Update terrain exaggeration live ─────────────────────────── */
  const handleExaggerationChange = (e) => {
    const val = parseFloat(e.target.value);
    setTerrainExaggeration(val);
    const map = mapRef.current;
    if (map && is3D) {
      map.setTerrain({ source: 'mapbox-dem', exaggeration: val });
    }
  };

  /* ── Style switcher ───────────────────────────────────────────── */
  const switchStyle = (styleId) => {
    const map = mapRef.current;
    if (!map) return;
    const style = MAP_STYLES.find(s => s.id === styleId);
    if (!style) return;
    const isAllSectorsStyle = styleId === 'sectors';
    const isBuildingsStyle = styleId === 'buildings';
    setCurrentStyle(styleId);
    currentStyleRef.current = styleId;
    if (isAllSectorsStyle) setIs3D(false);
    if (isBuildingsStyle) setIs3D(true);
    try {
      map.setStyle(style.url, isBuildingsStyle ? {
        diff: false,
        config: {
          basemap: {
            lightPreset: 'day',
            show3dObjects: true,
            showPointOfInterestLabels: false,
            showTransitLabels: false,
          },
        },
      } : { diff: false });
    } catch (err) {
      setMapInitError(describeMapboxError({ error: err }).message);
      return;
    }
    // Re-apply layers and 3D terrain after style loads
    map.once('style.load', () => {
      try {
        if (isBuildingsStyle) apply3DBuildingScene(map);
        syncSiteSectorLayers(map, styleId);
        applyLayersToMap(map);
        if (isAllSectorsStyle) {
          apply3DTerrain(map, false);
          map.easeTo({
            pitch: 0,
            bearing: 0,
            zoom: Math.max(map.getZoom(), 13),
            duration: 800,
          });
        } else if (isBuildingsStyle || is3D) {
          apply3DTerrain(map, true, terrainExaggeration);
          map.easeTo({
            pitch: 58,
            bearing: params.azimuth ?? 0,
            zoom: Math.max(map.getZoom(), 14),
            duration: 1000,
          });
        }
      } catch (err) {
        setMapInitError(describeMapboxError({ error: err }).message);
      }
    });
  };

  /* ── Apply result layers ────────────────────────────────────────── */
  const applyLayersToMap = (map) => {
    if (!result) return;

    const azimuth = result.azimuth_used ?? params.azimuth;
    const beamEnvelopeHeight = verticalBeamEnvelopeHeight(result, params);

    /* Polygon layers with hover interactivity */
    const polygonConfigs = [
      {
        id: 'rf-footprint',
        data: result.footprint_polygon,
        color: C.footprint,
        opacity: 0.15,
        extrusionHeight: beamEnvelopeHeight,
        label: 'RF Footprint',
        desc: `Coverage footprint at ${Math.round(result.main_m ?? params.max_distance)}m range`,
      },
      {
        id: 'rf-sector',
        data: result.sector_polygon,
        color: C.sector,
        opacity: 0.2,
        extrusionHeight: Math.max(12, beamEnvelopeHeight * 0.65),
        label: 'Antenna Sector',
        desc: `${params.horizontal_beamwidth ?? 65}° beamwidth @ Az ${azimuth}°`,
      },
    ];

    polygonConfigs.forEach(cfg => {
      const geojson = {
        type: 'Feature',
        properties: { label: cfg.label, desc: cfg.desc },
        geometry: { type: 'Polygon', coordinates: [cfg.data] },
      };

      if (map.getSource(cfg.id)) {
        map.getSource(cfg.id).setData(geojson);
        if (map.getLayer(`${cfg.id}-extrusion`)) {
          map.setPaintProperty(`${cfg.id}-extrusion`, 'fill-extrusion-height', cfg.extrusionHeight);
        }
      } else {
        map.addSource(cfg.id, { type: 'geojson', data: geojson });
        map.addLayer({
          id: `${cfg.id}-fill`, type: 'fill', source: cfg.id,
          paint: { 'fill-color': cfg.color, 'fill-opacity': cfg.opacity },
        });
        map.addLayer({
          id: `${cfg.id}-line`, type: 'line', source: cfg.id,
          paint: { 'line-color': cfg.color, 'line-width': 1.5, 'line-opacity': 0.7 },
        });
        // 3D fill-extrusion layer for terrain mode
        map.addLayer({
          id: `${cfg.id}-extrusion`, type: 'fill-extrusion', source: cfg.id,
          paint: {
            'fill-extrusion-color': cfg.color,
            'fill-extrusion-height': cfg.extrusionHeight,
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': cfg.opacity * 1.2,
          },
          layout: { visibility: 'none' },
        });

        // Hover events for polygons
        map.on('mouseenter', `${cfg.id}-fill`, (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const coords = e.lngLat;
          const props = e.features?.[0]?.properties || {};
          hoverPopupRef.current
            ?.setLngLat(coords)
            .setDOMContent(createRfPopup(
              props.label || cfg.label,
              cfg.color,
              [['Description', props.desc || cfg.desc]],
            ))
            .addTo(map);
        });

        map.on('mousemove', `${cfg.id}-fill`, (e) => {
          hoverPopupRef.current?.setLngLat(e.lngLat);
        });

        map.on('mouseleave', `${cfg.id}-fill`, () => {
          map.getCanvas().style.cursor = '';
          hoverPopupRef.current?.remove();
        });
      }
    });

    /* ── Markers ────────────────────────────────────────────────────── */
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    popupsRef.current.forEach(p => p.remove());
    popupsRef.current = [];

    // Tower marker with site ID label
    const siteLabel = selectedSiteId || null;
    const towerEl = createTowerMarkerElement(azimuth, siteLabel);

    // Tower popup on hover
    const towerPopup = new mapboxgl.Popup({
      offset: [0, -56], closeButton: false, closeOnClick: false,
      className: 'rf-map-popup',
    }).setDOMContent(createRfPopup('Cell Tower', C.main, [
      ...(siteLabel ? [['Site', siteLabel]] : []),
      ['Height', `${params.antenna_height}m`],
      ['Azimuth', `${azimuth}°`],
      ['Elevation', `${Math.round(result.site_elevation)}m`],
    ]));

    towerEl.addEventListener('mouseenter', () => {
      towerPopup.setLngLat([params.longitude, params.latitude]).addTo(map);
    });
    towerEl.addEventListener('mouseleave', () => towerPopup.remove());

    const towerMarker = new mapboxgl.Marker({ element: towerEl, anchor: 'bottom' })
      .setLngLat([params.longitude, params.latitude])
      .addTo(map);
    markersRef.current.push(towerMarker);
    popupsRef.current.push(towerPopup);

    const hasDraftTarget = targetMode
      && Number.isFinite(Number(params.target_latitude))
      && Number.isFinite(Number(params.target_longitude))
      && !result.link;

    if (hasDraftTarget) {
      const targetEl = createRoundMarker(C.link, 18, 4);
      targetEl.title = 'Drag to move P2P target';

      const draftTargetMarker = new mapboxgl.Marker({ element: targetEl, draggable: true })
        .setLngLat([params.target_longitude, params.target_latitude])
        .addTo(map);
      draftTargetMarker.on('dragend', () => {
        const lngLat = draftTargetMarker.getLngLat();
        onMapClickRef.current?.(lngLat.lat, lngLat.lng);
      });
      markersRef.current.push(draftTargetMarker);
    }

    // Impact markers — colours consistent with chart beams
    const impacts = [
      { key: 'near_m',  color: C.impactLower, label: 'Lower Beam Impact' },
      { key: 'main_m',  color: C.impactMain,  label: 'Main Beam Impact (LOS)' },
      { key: 'far_m',   color: C.impactUpper, label: 'Upper Beam Impact' },
    ];

    impacts.forEach(({ key, color, label }) => {
      const dist = result[key];
      if (dist == null) return;
      const [plat, plon] = destinationPointJS(params.latitude, params.longitude, azimuth, dist);
      const { marker, popup } = createImpactMarker(map, [plon, plat], color, label, dist);
      markersRef.current.push(marker);
      popupsRef.current.push(popup);
    });

    // Fresnel marker if different from main
    if (result.practical_main_m != null && result.practical_main_m !== result.main_m) {
      const [plat, plon] = destinationPointJS(
        params.latitude, params.longitude, azimuth, result.practical_main_m,
      );
      const { marker, popup } = createImpactMarker(
        map, [plon, plat], C.fresnel,
        `Fresnel Zone (${result.fresnel_clearance_pct}%)`,
        result.practical_main_m,
      );
      markersRef.current.push(marker);
      popupsRef.current.push(popup);
    }

    // P2P target marker
    if (result.link) {
      const targetEl = createRoundMarker(C.link, 16, 3);
      targetEl.style.cursor = 'pointer';

      const targetPopup = new mapboxgl.Popup({
        offset: 16, closeButton: false, closeOnClick: false,
        className: 'rf-map-popup',
      }).setDOMContent(createRfPopup('P2P Target', C.link, [
        ['Distance', `${Math.round(result.link.distance_m)}m`],
        [
          'LOS',
          result.link.los_clear
            ? 'Clear'
            : `Blocked @ ${Math.round(result.link.los_obstruction_distance)}m`,
          result.link.los_clear ? '#22c55e' : '#ef4444',
        ],
      ]));

      targetEl.addEventListener('mouseenter', () => {
        targetPopup.setLngLat([result.link.target_longitude, result.link.target_latitude]).addTo(map);
      });
      targetEl.addEventListener('mouseleave', () => targetPopup.remove());

      const targetMarker = new mapboxgl.Marker({ element: targetEl })
        .setLngLat([result.link.target_longitude, result.link.target_latitude])
        .addTo(map);
      markersRef.current.push(targetMarker);
      popupsRef.current.push(targetPopup);

      // P2P link line
      const lineGeoJson = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [params.longitude, params.latitude],
            [result.link.target_longitude, result.link.target_latitude],
          ],
        },
      };
      const lineColor = result.link.los_clear ? '#22c55e' : '#ef4444';
      if (map.getSource('rf-link-line')) {
        map.getSource('rf-link-line').setData(lineGeoJson);
        if (map.getLayer('rf-link-line-layer')) {
          map.setPaintProperty('rf-link-line-layer', 'line-color', lineColor);
        }
      } else {
        map.addSource('rf-link-line', { type: 'geojson', data: lineGeoJson });
        map.addLayer({
          id: 'rf-link-line-layer', type: 'line', source: 'rf-link-line',
          paint: { 'line-color': lineColor, 'line-width': 2.5, 'line-dasharray': [2, 2] },
        });
      }
    } else if (map.getLayer('rf-link-line-layer')) {
      map.removeLayer('rf-link-line-layer');
      map.removeSource('rf-link-line');
    }

    map.setCenter([params.longitude, params.latitude]);

    // Toggle extrusion layer visibility based on 3D mode
    polygonConfigs.forEach(cfg => {
      if (map.getLayer(`${cfg.id}-extrusion`)) {
        map.setLayoutProperty(
          `${cfg.id}-extrusion`,
          'visibility',
          is3D && currentStyleRef.current !== 'sectors' ? 'visible' : 'none',
        );
      }
    });
  };

  /* ── React to result / param changes ────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const syncLayers = () => syncSiteSectorLayers(map, currentStyle);

    if (map.isStyleLoaded()) syncLayers();
    else map.once('style.load', syncLayers);

    return () => {
      map.off('style.load', syncLayers);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySiteSectors, currentStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !result) return;

    if (map.isStyleLoaded()) {
      applyLayersToMap(map);
    } else {
      map.once('idle', () => applyLayersToMap(map));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, params.latitude, params.longitude, params.azimuth, params.vertical_beamwidth, params.target_latitude, params.target_longitude, targetMode, selectedSiteId, is3D]);

  /* ── Cleanup ────────────────────────────────────────────────────── */
  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-[var(--primary-light)] flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none"/>
              <path d="M1 5h12M1 9h12M5 1v12M9 1v12" stroke="currentColor" strokeWidth="0.5" opacity="0.3"/>
              <circle cx="7" cy="7" r="2" fill="currentColor" opacity="0.5"/>
            </svg>
            Coverage Map
          </CardTitle>
          {/* Style switcher */}
          <div className="flex gap-1">
            {MAP_STYLES.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => switchStyle(s.id)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  currentStyle === s.id
                    ? 'bg-[var(--primary)]/20 text-[var(--primary-light)] border border-[var(--primary)]/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div ref={mapContainer} className="h-[400px] w-full rounded-lg overflow-hidden" />

          {mapInitError && (
            <div className="absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-[var(--bg-base)]/90 p-6 backdrop-blur-sm">
              <div className="max-w-md rounded-xl border border-red-400/30 bg-[var(--bg-surface)] p-5 text-center shadow-xl">
                <div className="text-sm font-semibold text-red-300">Coverage Map tidak tersedia</div>
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

          {targetMode && (
            <div className="absolute bottom-3 left-3 z-10 rounded-lg border border-[var(--primary)]/30 bg-[rgba(15,23,42,0.88)] px-3 py-2 text-[10px] text-[var(--primary-light)] shadow-lg backdrop-blur-sm">
              P2P target mode: click the map to pin a target, then drag the pin to refine it.
            </div>
          )}

          {currentStyle === 'sectors' && (
            <div className="absolute right-12 top-3 z-10 max-w-[270px] rounded-lg border border-cyan-300/35 bg-[rgba(8,47,73,0.9)] px-3 py-2 text-[10px] leading-relaxed text-cyan-100 shadow-lg backdrop-blur-sm">
              {!selectedSiteId && 'Pilih Site ID untuk menampilkan seluruh sektor.'}
              {selectedSiteId && siteSectorsLoading && `Memuat seluruh sektor ${selectedSiteId}...`}
              {selectedSiteId && !siteSectorsLoading && siteSectorState.error && `Sektor gagal dimuat: ${siteSectorState.error}`}
              {selectedSiteId && !siteSectorsLoading && !siteSectorState.error && displaySiteSectors.features.length === 0
                && `Tidak ada polygon sektor untuk ${selectedSiteId}.`}
              {selectedSiteId && !siteSectorsLoading && !siteSectorState.error && displaySiteSectors.features.length > 0 && (
                <>
                  <strong>{displaySiteSectors.features.length} sektor</strong> dari {selectedSiteId} ditampilkan berdasarkan band.
                  {separatedSectorCount > 0 && ` ${separatedSectorCount} sektor yang bertumpuk dipisahkan secara visual.`}
                </>
              )}
            </div>
          )}

          {/* 3D Toggle button */}
          <button
            type="button"
            onClick={toggle3D}
            disabled={currentStyle === 'sectors'}
            className={`absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${
              currentStyle === 'sectors'
                ? 'cursor-not-allowed bg-[rgba(15,23,42,0.85)] text-[var(--text-muted)] opacity-75 border border-[rgba(148,163,184,0.2)]'
                : is3D
                ? 'bg-[var(--primary)]/90 text-white shadow-lg shadow-[var(--primary)]/30 border border-[var(--primary)]'
                : 'bg-[rgba(15,23,42,0.85)] text-[var(--text-muted)] border border-[rgba(148,163,184,0.2)] hover:border-[var(--primary)]/40 hover:text-[var(--primary-light)]'
            }`}
            style={{ backdropFilter: 'blur(8px)' }}
            title={currentStyle === 'sectors' ? 'All Sectors menggunakan tampilan 2D' : is3D ? 'Switch to 2D view' : 'Switch to 3D terrain view'}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              {is3D ? (
                <>
                  <path d="M7 1L13 4.5V9.5L7 13L1 9.5V4.5L7 1Z" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.15"/>
                  <path d="M7 1V13M1 4.5L7 8L13 4.5" stroke="currentColor" strokeWidth="0.8" opacity="0.5"/>
                </>
              ) : (
                <>
                  <rect x="2" y="2" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <path d="M2 7h10M7 2v10" stroke="currentColor" strokeWidth="0.5" opacity="0.3"/>
                </>
              )}
            </svg>
            {is3D ? '3D' : '2D'}
          </button>

          {/* Terrain exaggeration slider — only visible in 3D mode */}
          {is3D && currentStyle !== 'sectors' && (
            <div
              className="absolute top-14 left-3 z-10 rounded-lg px-3 py-2"
              style={{
                background: 'rgba(15,23,42,0.88)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(148,163,184,0.15)',
              }}
            >
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Terrain Scale</span>
                <span className="text-[10px] font-mono font-bold text-[var(--primary-light)]">{terrainExaggeration.toFixed(1)}×</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={terrainExaggeration}
                onChange={handleExaggerationChange}
                className="w-24 h-1 appearance-none rounded-full bg-[var(--border)] cursor-pointer"
                style={{
                  accentColor: 'var(--primary-light)',
                }}
              />
            </div>
          )}
          {/* Map legend */}
          <div
            className="absolute bottom-3 left-3 rounded-lg px-3 py-2 text-[10px] space-y-1"
            style={{
              background: 'rgba(15,23,42,0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(148,163,184,0.15)',
            }}
          >
            <div className="flex items-center gap-2">
              <span style={{ width: 10, height: 10, borderRadius: 2, background: C.footprint, opacity: 0.5, display: 'inline-block' }} />
              <span className="text-muted-foreground">RF Footprint</span>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ width: 10, height: 10, borderRadius: 2, background: C.sector, opacity: 0.5, display: 'inline-block' }} />
              <span className="text-muted-foreground">Sector</span>
            </div>
            {currentStyle === 'sectors' && (
              <div className="flex items-center gap-2">
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#60a5fa', opacity: 0.8, display: 'inline-block' }} />
                <span className="text-muted-foreground">All site sectors (by band)</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.impactMain, border: '1.5px solid #fff', display: 'inline-block' }} />
              <span className="text-muted-foreground">Main beam (LOS)</span>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.impactLower, border: '1.5px solid #fff', display: 'inline-block' }} />
              <span className="text-muted-foreground">Lower beam</span>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.impactUpper, border: '1.5px solid #fff', display: 'inline-block' }} />
              <span className="text-muted-foreground">Upper beam</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
