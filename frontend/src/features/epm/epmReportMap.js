import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {POINT_COLORS} from './routeEditing';
import {CABLE_COLOR} from './cableDisplay';

const styles={road:'mapbox://styles/mapbox/streets-v12',satellite:'mapbox://styles/mapbox/satellite-streets-v12'};
const earthRadius=6371008.8;
const radians=Math.PI/180;
const mercator=([lng,lat])=>[lng*radians,-Math.log(Math.tan(Math.PI/4+lat*radians/2))];
export const reportKm=metres=>Number.isFinite(metres) ? (metres/1000).toLocaleString('id-ID',{
  minimumFractionDigits:3,maximumFractionDigits:3,
})+' km' : '—';

export function loadReportImage(url) {
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(Error('Gambar tidak dapat dimuat. Coba lagi.'));
    image.src=url;
  });
}

export function fitText(ctx,text,width) {
  const value=String(text ?? '');
  if(ctx.measureText(value).width<=width) return value;
  let lo=0,hi=value.length;
  while(lo<hi) {
    const mid=Math.ceil((lo+hi)/2);
    if(ctx.measureText(value.slice(0,mid)+'…').width<=width) lo=mid;
    else hi=mid-1;
  }
  return value.slice(0,lo).trimEnd()+'…';
}

export function roundedPanel(ctx,x,y,w,h,fill,stroke='#d9e3e4',radius=12) {
  ctx.beginPath();
  ctx.roundRect(x,y,w,h,radius);
  ctx.fillStyle=fill;
  ctx.fill();
  if(stroke) {ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
}

export function focusBounds(point,length,aspect,maxRadius=150) {
  const radius=Math.max(.5,Math.min(150,maxRadius,Math.max(8,length*.065)));
  const latDelta=radius/(earthRadius*radians);
  const lngDelta=latDelta*aspect/Math.cos(point.lat*radians);
  return [[point.lng-lngDelta,Math.max(-85,point.lat-latDelta)],
    [point.lng+lngDelta,Math.min(85,point.lat+latDelta)]];
}

function gridFrame(positions,bounds,w,h,pad) {
  const [minX,maxY]=mercator(bounds[0]),[maxX,minY]=mercator(bounds[1]);
  const scale=Math.min((w-2*pad)/Math.max(1e-10,maxX-minX),(h-2*pad)/Math.max(1e-10,maxY-minY));
  const points=positions.map(position=>{
    const [x,y]=mercator(position);
    return {x:w/2+(x-(minX+maxX)/2)*scale,y:h/2+(y-(minY+maxY)/2)*scale};
  });
  return {points,metresPerPixel:earthRadius*Math.cos((bounds[0][1]+bounds[1][1])*radians/2)/scale};
}

function boundsFor(positions) {
  const bounds=new mapboxgl.LngLatBounds();
  positions.forEach(position=>bounds.extend(position));
  return bounds;
}

export function compactFocusRadius(positions,map,zoom) {
  const overview=gridFrame([],boundsFor(positions).toArray(),map.w,map.h,96);
  return overview.metresPerPixel*(zoom.h-18)/4.4;
}

export async function reportMapFrame(layer,positions,w,h,{zoomBounds,extraPositions=[],signal}={}) {
  signal?.throwIfAborted();
  const bounds=boundsFor(zoomBounds || positions);
  const pad=zoomBounds ? 9 : 96;
  const projectedPositions=[...positions,...extraPositions];
  if(layer==='plain') return gridFrame(projectedPositions,bounds.toArray(),w,h,pad);
  const token=import.meta.env.VITE_MAPBOX_TOKEN;
  if(!token || !mapboxgl.supported()) throw Error('Latar peta tidak tersedia. Pilih Skema tanpa latar.');
  const holder=document.createElement('div');
  Object.assign(holder.style,{position:'fixed',left:'-12000px',top:'0',width:w+'px',height:h+'px',pointerEvents:'none'});
  document.body.appendChild(holder);
  let map;
  try {
    map=new mapboxgl.Map({container:holder,accessToken:token,style:styles[layer],interactive:false,
      attributionControl:true,preserveDrawingBuffer:true,fadeDuration:0,bounds,fitBoundsOptions:{padding:pad,maxZoom:22},projection:'mercator'});
    let timeout,abort;
    try {
      await new Promise((resolve,reject)=>{
        timeout=setTimeout(()=>reject(Error('Latar peta belum siap. Coba lagi atau pilih Skema.')),25000);
        abort=()=>reject(signal.reason);
        signal?.addEventListener('abort',abort,{once:true});
        map.once('idle',resolve);
        map.once('error',()=>reject(Error('Latar peta gagal dimuat. Coba lagi atau pilih Skema.')));
      });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort',abort);
    }
    const bitmap=document.createElement('canvas');
    bitmap.width=w;bitmap.height=h;
    bitmap.getContext('2d').drawImage(map.getCanvas(),0,0,w,h);
    const logo=holder.querySelector('.mapboxgl-ctrl-logo');
    const logoUrl=(logo ? getComputedStyle(logo).backgroundImage : '').match(/^url\(["']?(.*?)["']?\)$/)?.[1];
    const from=map.unproject([w/2,h/2]),to=map.unproject([w/2+1,h/2]);
    return {bitmap,points:projectedPositions.map(pt=>map.project(pt)),metresPerPixel:from.distanceTo(to),
      logo:logoUrl ? await loadReportImage(logoUrl) : null,
      credits:holder.querySelector('.mapboxgl-ctrl-attrib-inner')?.textContent?.replace('Improve this map','').trim() || '© Mapbox © OpenStreetMap'};
  } finally {map?.remove();holder.remove();}
}

const overlaps=(a,b,gap=0)=>a.x<b.x+b.w+gap && a.x+a.w+gap>b.x && a.y<b.y+b.h+gap && a.y+a.h+gap>b.y;

function crossesBox(a,b,box) {
  const dx=b.x-a.x,dy=b.y-a.y;
  const directions=[-dx,dx,-dy,dy];
  const offsets=[a.x-box.x,box.x+box.w-a.x,a.y-box.y,box.y+box.h-a.y];
  let enter=0,leave=1;
  for (let i=0;i<directions.length;i++){
    const d=directions[i],v=offsets[i];
    if(d===0 && v<0) return false;
    if(d<0) enter=Math.max(enter,v/d);
    if(d>0) leave=Math.min(leave,v/d);
    if(enter>leave) return false;
  }
  return true;
}

export function chooseReportInset(map,frame,shapeLength,points,cables,point,size) {
  const {w,h}=size;
  const left=18,right=map.w-w-18,top=16,bottom=map.h-h-53;
  const line=frame.points.slice(0,shapeLength);
  const pins=frame.points.slice(shapeLength,shapeLength+points.length);
  let start=shapeLength+points.length;
  const paths=[line,...cables.map(cable=>{
    const path=frame.points.slice(start,start+cable.length);start+=cable.length;
    return path;
  })];
  const [focusA,focusB]=frame.points.slice(-2);
  const highlightBox={x:focusA.x,y:focusB.y,w:focusB.x-focusA.x,h:focusA.y-focusB.y};
  const options=[bottom,top,Math.round((top+bottom)/2)].flatMap(y=>[
    {x:left,y,w,h},{x:right,y,w,h},{x:Math.round((left+right)/2),y,w,h},
  ]);
  let best=options[0],minScore=Infinity;
  for(const option of options){
    const avoid={x:option.x-12,y:option.y-12,w:w+24,h:h+24};
    // Keep the selected point and its zoom rectangle visible before other features.
    let score=overlaps(avoid,highlightBox,3)?75:0;
    pins.forEach((pin,i)=>{
      if(overlaps(avoid,{...pin,w:1,h:1},26)) score+=points[i].id===point.id?1000:110;
    });
    for(const path of paths){
      if(path.some((p,i)=>i>0 && crossesBox(path[i-1],p,avoid))) score+=180;
    }
    if(score<minScore){best=option;minScore=score;}
    if(score===0) break;
  }
  return best;
}

function positionPins(points,projected,w,h,focus,detail) {
  const pins=[];
  const order=points.map((p,i)=>({p,i,...projected[i]})).filter(({x,y})=>x>=9 && y>=9 && x<=w-9 && y<=h-9);
  if(focus) order.sort((a,b)=>Number(b.p.id===focus.id)-Number(a.p.id===focus.id));
  for(const pin of order) {
    const selected=pin.p.id===focus?.id;
    const radius=selected ? (detail?14:17) : detail?9:12;
    let x=pin.x,y=pin.y;
    for(let i=0;i<38 && pins.some(p=>Math.hypot(p.x-x,p.y-y)<radius+p.radius+5);i++){
      const offset=13*Math.sqrt(i+1);
      x=Math.min(w-radius-5,Math.max(radius+5,pin.x+offset*Math.cos(i*2.4)));
      y=Math.min(h-radius-5,Math.max(radius+5,pin.y+offset*Math.sin(i*2.4)));
    }
    pins.push({...pin,sourceX:pin.x,sourceY:pin.y,x,y,radius,selected});
  }
  return pins;
}

function positionLabels(ctx,pins,w,h,detail,terminalIndex,inset) {
  const height=detail?35:44;
  const occupied=[{x:10,y:h-41,w:127,h:37},{x:w-114,y:h-34,w:110,h:31}];
  if(detail) occupied.push({x:8,y:8,w:84,h:23});
  if(inset) occupied.push(inset);
  const pinAreas=pins.map(({x,y,radius})=>({x:x-radius-2,y:y-radius-2,w:2*radius+4,h:2*radius+4}));
  const priority=pin=>pin.selected?0:pin.i===0||pin.i===terminalIndex?1:2;
  const order=[...pins].sort((a,b)=>priority(a)-priority(b)||a.i-b.i);
  const labels=[];
  for(const pin of order) {
    if(labels.length>=(detail?7:36)) break;
    ctx.font=detail?'bold 13px Arial':'bold 16px Arial';
    const width=Math.min(detail?130:206,Math.max(detail?67:91,Math.ceil(ctx.measureText(pin.p.label).width)+20));
    const {x,y,radius}=pin;
    const firstSide=x>w*.58?1:-1;
    for(const trail of [0,16,35,58,80]) {
      const distance=radius+13+trail;
      const options=[
        {x:x-width/2,y:y-distance-height},{x:x-width/2,y:y+distance},
        {x:firstSide===1?x-distance-width:x+distance,y:y-height/2},
        {x:firstSide===1?x+distance:x-distance-width,y:y-height/2},
        {x:x-width,y:y-distance-height},{x:x,y:y+distance},
      ];
      const box=options.map(pt=>({...pt,x:Math.round(Math.min(w-width-8,Math.max(8,pt.x))),w:width,h:height}))
        .find(rect=>rect.y>=8 && rect.y+height<=h-8 && !occupied.some(b=>overlaps(rect,b,5)) && !pinAreas.some(b=>overlaps(rect,b,4)));
      if(box) {occupied.push(box);labels.push({box,pin});break;}
    }
  }
  return labels;
}

function paintPath(ctx,points,color,width) {
  ctx.beginPath();
  points.forEach(({x,y},i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}

export function drawReportMap(ctx,box,frame,route,shape,cables,point,{detail=false,hasFocusBox=false,inset}={}) {
  const {x,y,w,h}=box;
  const projected=frame.points;
  ctx.save();ctx.translate(x,y);
  ctx.beginPath();ctx.roundRect(0,0,w,h,11);ctx.clip();
  if(frame.bitmap) ctx.drawImage(frame.bitmap,0,0);
  else {
    ctx.fillStyle='#eef4f2';ctx.fillRect(0,0,w,h);
    ctx.beginPath();
    for(let step=24;step<Math.max(w,h);step+=28){
      if(step<w){ctx.moveTo(step,0);ctx.lineTo(step,h);}
      if(step<h){ctx.moveTo(0,step);ctx.lineTo(w,step);}
    }
    ctx.strokeStyle='#dce8e5';ctx.lineWidth=1;ctx.stroke();
  }
  if(hasFocusBox) {
    const [a,b]=projected.slice(-2);
    ctx.setLineDash([5,5]);ctx.strokeStyle='#b27213';ctx.lineWidth=1.8;
    ctx.strokeRect(a.x,b.y,b.x-a.x,a.y-b.y);ctx.setLineDash([]);
  }
  ctx.lineJoin='round';ctx.lineCap='round';
  paintPath(ctx,projected.slice(0,shape.length),'#fff',detail?8:10);
  paintPath(ctx,projected.slice(0,shape.length),'#08796c',detail?4:6);
  let index=shape.length+route.points.length;
  for(const cable of cables) {
    paintPath(ctx,projected.slice(index,index+cable.length),CABLE_COLOR,detail?5:7);
    index+=cable.length;
  }
  const pins=positionPins(route.points,projected.slice(shape.length,index),w,h,point,detail);
  const labels=positionLabels(ctx,pins,w,h,detail,route.points.length-1,inset);
  for(const {box:rect,pin} of labels) {
    const end={x:Math.max(rect.x,Math.min(rect.x+rect.w,pin.x)),y:Math.max(rect.y,Math.min(rect.y+rect.h,pin.y))};
    paintPath(ctx,[pin,end],pin.selected?'#986015':'#607b7a',1.3);
  }
  for(const pin of pins) {
    if(pin.sourceX!==pin.x||pin.sourceY!==pin.y) paintPath(ctx,[{x:pin.sourceX,y:pin.sourceY},pin],'#607b7a',1.2);
    ctx.beginPath();ctx.arc(pin.x,pin.y,pin.radius,0,2*Math.PI);
    ctx.fillStyle=POINT_COLORS[pin.p.type]||POINT_COLORS.lainnya;ctx.fill();
    ctx.strokeStyle=pin.selected?'#ffc75c':'#fff';ctx.lineWidth=pin.selected?4:2;ctx.stroke();
    ctx.fillStyle='#fff';ctx.font=detail?'bold 11px Arial':'bold 13px Arial';ctx.textAlign='center';
    ctx.fillText(pin.i+1,pin.x,pin.y+(detail?4:5));ctx.textAlign='left';
  }
  for(const {box:rect,pin} of labels) {
    roundedPanel(ctx,rect.x,rect.y,rect.w,rect.h,pin.selected?'#fff8e7':'#fff',pin.selected?'#e8b14f':'#cbdcdb',6);
    ctx.fillStyle='#15343d';ctx.font=detail?'bold 13px Arial':'bold 16px Arial';
    ctx.fillText(fitText(ctx,pin.p.label,rect.w-18),rect.x+9,rect.y+(detail?14:18));
    ctx.fillStyle='#49616a';ctx.font=detail?'11px Arial':'13px Arial';
    ctx.fillText(reportKm(pin.p.station_m),rect.x+9,rect.y+(detail?28:35));
  }
  const max=frame.metresPerPixel*(detail?58:95);
  const unit=10**Math.floor(Math.log10(max));
  const scale=[1,2,5].map(value=>value*unit).filter(value=>value<=max).at(-1)||unit;
  const px=scale/frame.metresPerPixel;
  roundedPanel(ctx,10,h-37,Math.max(54,px+19),28,'#fffffff0',null,4);
  ctx.fillStyle='#173940';ctx.font=detail?'11px Arial':'13px Arial';
  ctx.fillText(scale>=1000?reportKm(scale):Number(scale.toPrecision(2))+' m',18,h-22);
  ctx.fillRect(18,h-17,px,2.5);
  if(frame.logo) ctx.drawImage(frame.logo,w-(detail?79:108),h-(detail?21:29),detail?70:96,detail?16:23);
  ctx.restore();
}
