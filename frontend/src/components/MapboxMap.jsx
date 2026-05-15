import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMarkerColor } from '../utils/mapColors';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

export default function MapboxMap({ sites, loading, onSiteClick }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [112.5, -7.5],
      zoom: 8,
      minZoom: 6,
      maxZoom: 18,
      pitch: 0,
      attributionControl: true,
    });
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');
    map.current.on('load', () => setMapLoaded(true));
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current || !mapLoaded || !sites?.length) return;

    // Remove old layers/sources
    ['clusters', 'cluster-count', 'unclustered-point', 'unclustered-glow'].forEach(id => {
      if (map.current.getLayer(id)) map.current.removeLayer(id);
    });
    if (map.current.getSource('sites-source')) map.current.removeSource('sites-source');

    const geojson = {
      type: 'FeatureCollection',
      features: sites
        .filter(s => s.latitude && s.longitude && !isNaN(s.latitude) && !isNaN(s.longitude))
        .map(site => ({
          type: 'Feature',
          properties: {
            site_id: site.site_id,
            site_name: site.site_name || '',
            kabupaten: site.kabupaten || '',
            site_class: site.site_class || '',
            avg_availability: site.avg_availability,
            total_outage_menit: site.total_outage_menit,
            color: getMarkerColor(site.avg_availability, site.status_site),
          },
          geometry: { type: 'Point', coordinates: [site.longitude, site.latitude] },
        })),
    };

    map.current.addSource('sites-source', {
      type: 'geojson',
      data: geojson,
      cluster: true,
      clusterMaxZoom: 13,
      clusterRadius: 50,
    });

    // Cluster circles — dark blue with glow effect
    map.current.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'sites-source',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#1E40AF',
        'circle-radius': ['step', ['get', 'point_count'], 20, 10, 26, 50, 34, 100, 42],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(59, 130, 246, 0.4)',
        'circle-opacity': 0.9,
        'circle-blur': 0.1,
      },
    });

    // Cluster count text
    map.current.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'sites-source',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 13,
      },
      paint: { 'text-color': '#FFFFFF' },
    });

    // Individual marker glow ring (subtle)
    map.current.addLayer({
      id: 'unclustered-glow',
      type: 'circle',
      source: 'sites-source',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': 12,
        'circle-opacity': 0.15,
        'circle-blur': 1,
      },
    });

    // Individual site markers
    map.current.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: 'sites-source',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': 5,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': 'rgba(255, 255, 255, 0.6)',
      },
    });

    // Cluster click → zoom in
    map.current.on('click', 'clusters', (e) => {
      const f = map.current.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      map.current.getSource('sites-source').getClusterExpansionZoom(f[0].properties.cluster_id, (err, z) => {
        if (!err) map.current.easeTo({ center: f[0].geometry.coordinates, zoom: z, duration: 500 });
      });
    });

    // Site marker click → popup
    map.current.on('click', 'unclustered-point', (e) => {
      const p = e.features[0].properties;
      const c = e.features[0].geometry.coordinates.slice();
      const avail = p.avg_availability != null ? `${Number(p.avg_availability).toFixed(2)}%` : 'N/A';
      const outage = p.total_outage_menit != null ? `${Math.round(p.total_outage_menit)} min` : 'N/A';

      new mapboxgl.Popup({ offset: 15, maxWidth: '280px', className: 'nod-popup' }).setLngLat(c).setHTML(`
        <div style="padding:16px;font-family:Inter,sans-serif">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <span style="width:8px;height:8px;border-radius:50%;background:${p.color};box-shadow:0 0 8px ${p.color}"></span>
            <span style="font-size:14px;font-weight:700;color:#F1F5F9">${p.site_id}</span>
          </div>
          <p style="font-size:11px;color:#94A3B8;margin-bottom:12px;line-height:1.4">${p.site_name}</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px">
            <div style="background:rgba(255,255,255,0.04);padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.06)">
              <div style="color:#64748B;font-size:10px;margin-bottom:2px">Availability</div>
              <b style="color:${p.color};font-size:13px">${avail}</b>
            </div>
            <div style="background:rgba(255,255,255,0.04);padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.06)">
              <div style="color:#64748B;font-size:10px;margin-bottom:2px">Outage</div>
              <b style="color:#F1F5F9;font-size:13px">${outage}</b>
            </div>
            <div style="background:rgba(255,255,255,0.04);padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.06)">
              <div style="color:#64748B;font-size:10px;margin-bottom:2px">Kabupaten</div>
              <b style="color:#F1F5F9">${p.kabupaten || '-'}</b>
            </div>
            <div style="background:rgba(255,255,255,0.04);padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.06)">
              <div style="color:#64748B;font-size:10px;margin-bottom:2px">Class</div>
              <b style="color:#F1F5F9">${p.site_class || '-'}</b>
            </div>
          </div>
          <button onclick="window.dispatchEvent(new CustomEvent('open-site-detail',{detail:'${p.site_id}'}))"
            style="margin-top:12px;width:100%;padding:8px;background:linear-gradient(135deg,#1E40AF,#3B82F6);color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;letter-spacing:0.3px;transition:opacity 0.2s"
            onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
            Lihat Detail Lengkap
          </button>
        </div>
      `).addTo(map.current);
      onSiteClick?.(p.site_id, c);
    });

    // Cursor changes
    ['unclustered-point', 'clusters'].forEach(layer => {
      map.current.on('mouseenter', layer, () => { map.current.getCanvas().style.cursor = 'pointer'; });
      map.current.on('mouseleave', layer, () => { map.current.getCanvas().style.cursor = ''; });
    });
  }, [sites, mapLoaded, onSiteClick]);

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
      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
}
