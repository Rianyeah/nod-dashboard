import { useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import api from '../../services/api';
import { pointMasterCode } from './siteMaster';

const nearbyLayer = 'epm-nearby-sites';
const directionsColors = ['#0cb4cb', '#a765de'];
const emptyCollection = {type:'FeatureCollection', features:[]};

export function endpointSites(route) {
  if (!route?.points?.length) return [];
  return [route.points[0], route.points.at(-1)].map((point, index)=>{
    const code = pointMasterCode(route, point);
    return {code, lat:point.lat, lng:point.lng, color:directionsColors[index]};
  }).filter(site=>site.code && Number.isFinite(site.lat) && Number.isFinite(site.lng));
}

export function useSectorDirections(enabled, codes) {
  const [result, setResult] = useState(null);
  useEffect(()=>{
    if (!enabled || !codes) return;
    const controller = new AbortController();
    api.get('/epm/sector-directions',{params:{site_ids:codes},signal:controller.signal})
      .then(({data})=>{if(!controller.signal.aborted) setResult({codes,data});})
      .catch(()=>{if(!controller.signal.aborted) setResult({codes,error:true});});
    return ()=>controller.abort();
  },[enabled,codes]);
  return enabled && result?.codes===codes ? result : null;
}

export function addNearbySiteLayer(map) {
  map.addSource(nearbyLayer,{type:'geojson',data:emptyCollection});
  map.addLayer({id:nearbyLayer,type:'circle',source:nearbyLayer,paint:{
    'circle-color':'#4a6988','circle-stroke-color':'#fff','circle-stroke-width':1.6,
    'circle-radius':['interpolate',['linear'],['zoom'],11,3.5,16,6],
  }});
}

export function useNearbySites(map,enabled,excludedCodes,onStatus) {
  useEffect(()=>{
    if (!map || !enabled) return;
    const source = map.getSource(nearbyLayer);
    if (!source) return;
    const exclude = new Set(excludedCodes.split(','));
    let timer, request, popup;

    async function loadSites() {
      onStatus('');
      const bounds = map.getBounds();
      const west = Math.max(-180,bounds.getWest()), east = Math.min(180,bounds.getEast());
      const south = Math.max(-90,bounds.getSouth()), north = Math.min(90,bounds.getNorth());
      if (map.getZoom()<11 || east-west>2 || north-south>2 || east<=west || north<=south) {
        source.setData(emptyCollection);
        onStatus('Perbesar peta untuk menampilkan site sekitar.');
        return;
      }
      const controller = new AbortController();
      request = controller;
      try {
        const bbox = [west,south,east,north].map(value=>value.toFixed(6)).join(',');
        const {data} = await api.get('/epm/map-sites',{params:{bbox},signal:controller.signal});
        if (controller.signal.aborted) return;
        const features = data.sites.flatMap(site=>{
          if (exclude.has(site.site_id.toUpperCase())) return [];
          return [{type:'Feature',geometry:{type:'Point',coordinates:[site.longitude,site.latitude]},
            properties:{code:site.site_id,name:site.site_name ?? ''}}];
        });
        source.setData({type:'FeatureCollection',features});
        if (data.truncated) onStatus('Perbesar peta untuk melihat site lainnya.');
      } catch {
        if (controller.signal.aborted) return;
        source.setData(emptyCollection);
        onStatus('Site sekitar gagal dimuat. Geser peta untuk mencoba lagi.');
      }
    }

    function schedule() {
      clearTimeout(timer);
      request?.abort();
      timer = setTimeout(loadSites,160);
    }
    function showSite(event) {
      const site = event.features?.[0];
      if (!site) return;
      popup?.remove();
      const body = document.createElement('div');
      body.className = 'epm-nearby-popup';
      const title = document.createElement('strong');
      title.textContent = site.properties.code;
      const name = document.createElement('p');
      name.textContent = site.properties.name;
      body.append(title,name);
      popup = new mapboxgl.Popup({offset:9}).setDOMContent(body).setLngLat(event.lngLat).addTo(map);
    }
    const enter = ()=>{map.getCanvas().style.cursor='pointer';};
    const leave = ()=>{map.getCanvas().style.cursor='';};
    map.on('moveend',schedule);
    map.on('click',nearbyLayer,showSite);
    map.on('mouseenter',nearbyLayer,enter);
    map.on('mouseleave',nearbyLayer,leave);
    schedule();
    return ()=>{
      clearTimeout(timer);
      request?.abort();
      popup?.remove();
      map.off('moveend',schedule);
      map.off('click',nearbyLayer,showSite);
      map.off('mouseenter',nearbyLayer,enter);
      map.off('mouseleave',nearbyLayer,leave);
      if (map.getSource(nearbyLayer)) {
        source.setData(emptyCollection);
        leave();
      }
    };
  },[map,enabled,excludedCodes,onStatus]);
}

export function sectorMarkers(map,endpoints,rows) {
  const svgNamespace = 'http://www.w3.org/2000/svg';
  return endpoints.flatMap(site=>{
    const azimuths = rows.filter(row=>row.site_id===site.code).map(row=>row.azimuth);
    if (!azimuths.length) return [];
    const marker = document.createElement('span');
    marker.className = 'epm-sector-symbol';
    marker.title = site.code+' · '+azimuths.map(azimuth=>azimuth+'°').join(', ');
    const svg = document.createElementNS(svgNamespace,'svg');
    svg.setAttribute('width','112');
    svg.setAttribute('height','112');
    svg.setAttribute('viewBox','-56 -56 112 112');
    for (const azimuth of azimuths) {
      const sector = document.createElementNS(svgNamespace,'path');
      sector.setAttribute('d','M 0 0 L -17 -47 A 50 50 0 0 1 17 -47 Z');
      sector.setAttribute('transform','rotate('+azimuth+')');
      sector.setAttribute('fill',site.color);
      sector.setAttribute('fill-opacity','0.36');
      sector.setAttribute('stroke',site.color);
      sector.setAttribute('stroke-width','1.5');
      svg.append(sector);
    }
    marker.append(svg);
    return [new mapboxgl.Marker({element:marker,rotationAlignment:'map',pitchAlignment:'viewport'})
      .setLngLat([site.lng,site.lat]).addTo(map)];
  });
}
