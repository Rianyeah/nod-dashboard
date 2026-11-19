import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { describeMapboxError, validateMapboxRuntime } from '../../utils/mapboxRuntime';
import { distanceLabel } from './routeEditing';

const colors = { site:'#087460', tipus:'#c53a32', sambungan:'#966300', lainnya:'#365ca4' };
const styles = { street:'mapbox://styles/mapbox/streets-v12', satellite:'mapbox://styles/mapbox/satellite-streets-v12' };
const token = import.meta.env.VITE_MAPBOX_TOKEN;
const center = [112.7839,-7.849];
const geoLine = route => route?.geometry?.coordinates?.length >= 2 ? route.geometry : { type:'FeatureCollection', features:[] };

function correctionFeatures(correction) {
  const features = [];
  for (const [part, coordinates] of Object.entries(correction || {})) {
    if (Array.isArray(coordinates) && coordinates.length >= 2) {
      features.push({type:'Feature', properties:{part}, geometry:{type:'LineString', coordinates}});
    }
  }
  return {type:'FeatureCollection', features};
}

function OnlineMap({ layer, route, selected, onPick, onSelect, onFail, fitKey, correction, fitSection }) {
  const container = useRef(null);
  const [map, setMap] = useState(null);
  const [ready, setReady] = useState(false);
  const failed = useEffectEvent(onFail);
  const picked = useEffectEvent((e) => onPick?.(e.lngLat));
  const selectedPoint = useEffectEvent(onSelect);
  const focus = useEffectEvent((instance, sectionOnly) => {
    const coords = sectionOnly ? correction?.original : route?.geometry?.coordinates;
    if (coords?.length >= 2) {
      const bounds = new mapboxgl.LngLatBounds(coords[0],coords[0]);
      for (const p of coords) bounds.extend(p);
      instance.fitBounds(bounds,{padding:56,maxZoom:17,duration:0});
    }
  });
  useEffect(() => {
    const error = validateMapboxRuntime({token,mapbox:mapboxgl,container:container.current});
    if (error) { failed(error.message); return; }
    let instance;
    try {
      instance = new mapboxgl.Map({container:container.current,accessToken:token,style:styles[layer],center,zoom:13});
      instance.addControl(new mapboxgl.NavigationControl({showCompass:false}), 'top-left');
    } catch { failed('Peta jalan/satelit tidak dapat dimuat di perangkat ini.'); return; }
    const timer = window.setTimeout(() => failed('Latar peta belum berhasil dimuat.'), 22000);
    instance.on('load', () => {
      window.clearTimeout(timer);
      instance.addSource('epm-route',{type:'geojson',data:{ type:'FeatureCollection',features:[] }});
      instance.addLayer({id:'epm-casing',type:'line',source:'epm-route', paint:{'line-color':'#fff','line-width':7}});
      instance.addLayer({id:'epm-line',type:'line',source:'epm-route', paint:{'line-color':'#008578','line-width':4}});
      instance.addSource('epm-correction',{type:'geojson',data:correctionFeatures(null)});
      instance.addLayer({id:'epm-correction-original',type:'line',source:'epm-correction',
        filter:['==',['get','part'],'original'],paint:{'line-color':'#ed9b16','line-width':6}});
      instance.addLayer({id:'epm-correction-proposed',type:'line',source:'epm-correction',
        filter:['==',['get','part'],'proposed'],paint:{'line-color':'#1369dc','line-width':6,'line-dasharray':[2,1]}});
      setMap(instance);
      setReady(true);
    });
    instance.on('error', e => { const err = describeMapboxError(e); if (err.fatal) failed(err.message); });
    instance.on('click', e => picked(e));
    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(container.current);
    return () => { clearTimeout(timer); resize.disconnect(); instance.remove(); };
  }, [layer]);
  useEffect(() => {
    if (!map || !ready) return;
    map.getSource('epm-route')?.setData(geoLine(route));
    const markers = (route?.points || []).map((p,i) => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'epm-marker' + (p.id === selected ? ' selected' : '');
      el.style.setProperty('--pin',colors[p.type] || colors.lainnya);
      el.title = `${p.label} · ${distanceLabel(p.station_m)} · ${p.photo_count || 0} foto`;
      el.setAttribute('aria-label',el.title);
      el.textContent = String(i + 1);
      if (p.photo_count) {
        const badge = document.createElement('small'); badge.textContent = p.photo_count; el.append(badge);
      }
      el.addEventListener('click', e => { e.stopPropagation(); selectedPoint?.(p.id); });
      return new mapboxgl.Marker({element:el}).setLngLat([p.lng,p.lat]).addTo(map);
    });
    return () => markers.forEach(marker => marker.remove());
  }, [map,ready,route,selected]);
  const original = correction?.original;
  useEffect(() => {
    if (map && ready) map.getSource('epm-correction')?.setData(correctionFeatures(correction));
  }, [map,ready,correction]);
  useEffect(() => {
    if (!map || !ready || !original) return;
    const pins = [original[0], original.at(-1)].map((position, i) => {
      const el = document.createElement('span');
      el.className = 'epm-correction-pin';
      el.textContent = i === 0 ? 'A' : 'B';
      return new mapboxgl.Marker({element:el}).setLngLat(position).addTo(map);
    });
    return () => pins.forEach(pin => pin.remove());
  }, [map,ready,original]);
  useEffect(() => { if (map && ready) focus(map,fitSection); }, [map,ready,route?.id,fitKey,fitSection,correction?.sectionIndex]);
  return <div ref={container} className="epm-map-canvas" aria-label="Peta geografis jalur EPM" />;
}

function Schematic({route,selected,onSelect,onPick,correction,fitSection}) {
  const frame = useMemo(() => {
    const coords = fitSection && correction?.original
      ? [...correction.original]
      : [...(route?.geometry?.coordinates || []), ...(route?.points || []).map(p=>[p.lng,p.lat])];
    if (!coords.length) coords.push([center[0]-.018,center[1]-.014],[center[0]+.018,center[1]+.014]);
    let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
    for (const [x,y] of coords) { left=Math.min(left,x);right=Math.max(right,x);bottom=Math.min(bottom,y);top=Math.max(top,y); }
    const cx=(left+right)/2, cy=(top+bottom)/2, cosine=Math.cos(cy*Math.PI/180);
    const scale=Math.min(598/(Math.max(right-left,.001)*cosine),344/Math.max(top-bottom,.001));
    return { scale,cosine,cx,cy, pixel:([x,y])=>[350+(x-cx)*scale*cosine,208-(y-cy)*scale] };
  },[route,correction,fitSection]);
  function pick(e) {
    if (!onPick) return;
    const svg=e.currentTarget, point=svg.createSVGPoint();
    point.x=e.clientX;point.y=e.clientY;
    const matrix=svg.getScreenCTM(); if (!matrix) return;
    const pos=point.matrixTransform(matrix.inverse());
    onPick({lng:frame.cx+(pos.x-350)/(frame.scale*frame.cosine),lat:frame.cy-(pos.y-208)/frame.scale});
  }
  return <svg className="epm-schematic" viewBox="0 0 700 416" onClick={pick} aria-label="Skema trase dan penanda titik">
    <polyline points={(route?.geometry?.coordinates || []).map(p=>frame.pixel(p).join(',')).join(' ')} fill="none" stroke="#009688" strokeWidth="4" strokeLinejoin="round" />
    {correction && <>
      <polyline points={correction.original.map(p=>frame.pixel(p).join(',')).join(' ')}
        fill="none" stroke="#ed9b16" strokeWidth="6" strokeLinejoin="round" pointerEvents="none"/>
      <polyline points={correction.proposed.map(p=>frame.pixel(p).join(',')).join(' ')}
        fill="none" stroke="#1369dc" strokeWidth="6" strokeLinejoin="round" strokeDasharray="8 5" pointerEvents="none"/>
    </>}
    {route?.points?.map((p,i) => {
      const [x,y]=frame.pixel([p.lng,p.lat]);
      return <g key={p.id} role="button" tabIndex={0} aria-label={`${p.label}, ${p.photo_count || 0} foto`}
        onClick={e=>{e.stopPropagation(); onSelect?.(p.id);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect?.(p.id);}}}
        transform={`translate(${x} ${y})`}>
        <title>{p.label} · {distanceLabel(p.station_m)} · {p.photo_count || 0} foto</title>
        {p.id===selected && <circle r="19" fill="none" stroke="#069887" strokeWidth="3" />}
        <circle r="12" fill={colors[p.type]} stroke="white" strokeWidth="2" /><text y="4" textAnchor="middle" fill="white" fontSize="10">{i+1}</text>
        {p.photo_count>0 && <g transform="translate(11 -10)"><circle r="7" fill="#233447"/><text y="3" textAnchor="middle" fontSize="8" fill="white">{p.photo_count}</text></g>}
      </g>;
    })}
    {correction && [correction.original[0], correction.original.at(-1)].map((p,i)=>{
      const [x,y] = frame.pixel(p);
      return <g key={i} transform={`translate(${x} ${y})`} pointerEvents="none">
        <circle r="10" fill="#193454" stroke="white" strokeWidth="2"/>
        <text y="4" textAnchor="middle" fill="white" fontSize="11">{i===0?'A':'B'}</text>
      </g>;
    })}
  </svg>;
}

export default function RouteMap({route,selected,onSelect,onPick,hint,correction}) {
  const [layer,setLayer] = useState(() => {try {return ['street','satellite','plain'].find(v=>v===localStorage.getItem('epm-layer')) || 'street';}catch{return 'street';}});
  const [failure,setFailure] = useState(''), [fit,setFit] = useState(0);
  const [showWhole,setShowWhole] = useState(null);
  const showPlain = layer === 'plain' || !!failure;
  const fitSection = !!correction && showWhole !== correction.sectionIndex;
  function update(value) {
    setLayer(value); setFailure('');
    try {localStorage.setItem('epm-layer',value);} catch { /* Browsers may disable preference storage. */ }
  }
  return <section className="epm-panel epm-map">
    <div className="epm-map-tools"><div role="group" aria-label="Latar peta">
      {[['street','Jalan'],['satellite','Satelit'],['plain','Skema']].map(([id,label])=><button key={id} type="button"
        aria-pressed={layer===id} onClick={()=>update(id)}>{label}</button>)}</div>
      {(!showPlain || correction) && <button type="button" onClick={()=>{
        setShowWhole(fitSection ? correction.sectionIndex : null);
        setFit(v=>v+1);
      }}>{correction && !fitSection ? 'Fokus ruas' : 'Seluruh jalur'}</button>}
    </div>
    {failure && <p className="epm-note" role="status">{failure} Menampilkan skema. <button type="button" onClick={()=>setFailure('')}>Coba lagi</button></p>}
    {hint && <p className="epm-note">{hint}</p>}
    {showPlain ? <Schematic route={route} selected={selected} onSelect={onSelect} onPick={onPick} correction={correction} fitSection={fitSection}/> :
      <OnlineMap key={layer} layer={layer} route={route} selected={selected} onSelect={onSelect} onPick={onPick} onFail={setFailure}
        fitKey={fit} correction={correction} fitSection={fitSection}/>}
    <div className="epm-legend">{[['site','Site'],['tipus','Titik putus'],['sambungan','Sambungan'],['lainnya','Lainnya']].map(([t,l])=>
      <span key={t}><i style={{background:colors[t]}}/>{l}</span>)}</div>
  </section>;
}
