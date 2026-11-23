import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {INCIDENT_STATUSES} from './routeEditing';
import {CABLE_COLOR} from './cableDisplay';

export const reportWidth = 1600;
export const reportHeight = 1100;
const km = m => Number(m / 1000).toLocaleString('id-ID', { maximumFractionDigits: 3 });
const styles = { road: 'mapbox://styles/mapbox/streets-v12', satellite: 'mapbox://styles/mapbox/satellite-streets-v12' };

function imageFrom(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Gambar gagal dimuat. Coba lagi atau ekspor tanpa foto.'));
    image.src = url;
  });
}

function gridProjection(coords, width, height) {
  const mercator = ([lng, lat]) => [lng * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for (const pt of coords) {
    const [x, y] = mercator(pt);
    minX=Math.min(minX,x); maxX=Math.max(maxX,x); minY=Math.min(minY,y); maxY=Math.max(maxY,y);
  }
  const scale = Math.min((width-140)/Math.max(1e-10,maxX-minX),(height-110)/Math.max(1e-10,maxY-minY));
  return {project(pt) { const [x,y]=mercator(pt); return {x:width/2+(x-(minX+maxX)/2)*scale, y:height/2+(y-(minY+maxY)/2)*scale}; },
    metresPerPixel: 6371008.8 * Math.cos(coords[0][1]*Math.PI/180)/scale};
}

async function exportBasemap(style, coords, width, height) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  if (!token || !mapboxgl.supported()) throw new Error('Latar peta tidak tersedia. Pilih Skema untuk membuat JPG.');
  const holder = document.createElement('div');
  Object.assign(holder.style, {position:'fixed', left:'-12000px', top:'0', width:width+'px', height:height+'px',pointerEvents:'none'});
  document.body.appendChild(holder);
  let map;
  try {
    const bounds=new mapboxgl.LngLatBounds();
    coords.forEach(pt=>bounds.extend(pt));
    map = new mapboxgl.Map({container:holder, accessToken:token, style:styles[style],interactive:false,
      attributionControl:true, preserveDrawingBuffer:true, fadeDuration:0, bounds, fitBoundsOptions:{padding:66,maxZoom:18}, projection:'mercator'});
    await new Promise((resolve,reject)=>{
      const id=setTimeout(()=>reject(new Error('Latar peta belum siap. Coba lagi atau pilih Skema.')),25000);
      map.once('idle',()=>{ clearTimeout(id); resolve(); });
      map.once('error',()=>{ clearTimeout(id); reject(new Error('Latar peta gagal dimuat. Pilih Skema atau coba lagi.')); });
    });
    const bitmap=document.createElement('canvas');
    bitmap.width=width;bitmap.height=height;
    bitmap.getContext('2d').drawImage(map.getCanvas(),0,0,width,height);
    const points=coords.map(c=>map.project(c));
    const a=map.unproject([width/2,height/2]), b=map.unproject([width/2+1,height/2]);
    const logoElement=holder.querySelector('.mapboxgl-ctrl-logo');
    const logoCss=logoElement ? getComputedStyle(logoElement).backgroundImage : '';
    const logoUrl=logoCss.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
    return {bitmap, points, metresPerPixel:a.distanceTo(b),logo:logoUrl?await imageFrom(logoUrl):null,
      credits:holder.querySelector('.mapboxgl-ctrl-attrib-inner')?.textContent?.replace('Improve this map','').trim() || '© Mapbox © OpenStreetMap'};
  } finally {map?.remove();holder.remove();}
}

function wrap(ctx, text, x,y,width,lineHeight,maxLines=3) {
  const words=String(text || '').split(/\s+/);
  let line='', count=0;
  for (const [i, word] of words.entries()) {
    if (line && ctx.measureText(line+' '+word).width>width) {
      ctx.fillText(line,x,y,width); line='';y+=lineHeight;
      if (++count>=maxLines-1) {ctx.fillText([word,...words.slice(i+1)].join(' '),x,y,width);return y+lineHeight;}
    }
    line+=(line?' ':'')+word;
  }
  if (line) ctx.fillText(line,x,y,width);
  return y+lineHeight;
}

const palette={site:'#12675e',remote_sector:'#6740ab',tipus:'#b43832',sambungan:'#255caf',lainnya:'#6b647f'};

export async function buildReportJpg({route,point,incident,photo,layer,format='jpg'}) {
  const canvas=document.createElement('canvas'); canvas.width=reportWidth;canvas.height=reportHeight;
  const ctx=canvas.getContext('2d');
  const mapWidth=1020,mapHeight=786, left=40, top=150, panelX=1100, panelWidth=455;
  const shape=route.geometry.coordinates;
  const cables=(route.cable_replacements || []).map(a=>a.geometry.coordinates);
  const coords=[...shape,...route.points.map(p=>[p.lng,p.lat]),...cables.flat()];
  const frame=layer==='plain'?gridProjection(coords,mapWidth,mapHeight):await exportBasemap(layer,coords,mapWidth,mapHeight);
  const projected=frame.points||coords.map(frame.project);
  const image=photo?await imageFrom('/api/v1/epm/photos/'+encodeURIComponent(photo.id)+'/preview'):null;
  function line(text,x,y,font='24px Arial',color='#172c36',max) {
    ctx.font=font;ctx.fillStyle=color;ctx.fillText(String(text),x,y,max);
  }
  ctx.fillStyle='#fff';ctx.fillRect(0,0,1600,1100);
  line('PETA JALUR EPM',left,50,'bold 23px Arial','#226960');
  line(route.name,left,110,'bold 49px Arial','#152d36',1200);
  const stamp=new Intl.DateTimeFormat('id-ID',{dateStyle:'long',timeZone:'Asia/Jakarta'}).format(new Date());
  line(stamp,1240,55,'23px Arial','#46606a',315);
  ctx.save();ctx.translate(left,top);ctx.beginPath();ctx.rect(0,0,mapWidth,mapHeight);ctx.clip();
  if(frame.bitmap) ctx.drawImage(frame.bitmap,0,0);
  else {ctx.fillStyle='#f1f5f4';ctx.fillRect(0,0,mapWidth,mapHeight);}
  ctx.beginPath();
  projected.slice(0,shape.length).forEach(({x,y},i)=>{if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});
  ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=9;ctx.strokeStyle='white';ctx.stroke();ctx.lineWidth=5;ctx.strokeStyle='#137e76';ctx.stroke();
  let cableStart=shape.length+route.points.length;
  for(const cable of cables){
    ctx.beginPath();
    projected.slice(cableStart,cableStart+cable.length).forEach(({x,y},i)=>{if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});
    ctx.lineWidth=7;ctx.strokeStyle=CABLE_COLOR;ctx.stroke();
    cableStart+=cable.length;
  }
  const pins=route.points.map((p,i)=>({p,i,...projected[shape.length+i]}));
  // Draw number badges with leader lines where several points share a few pixels.
  const used=[];
  for(const {p,i,x,y} of pins){
    let tx=x,ty=y;
    for(let s=0;s<48 && used.some(a=>Math.hypot(a[0]-tx,a[1]-ty)<29);s++){
      tx=Math.min(mapWidth-17,Math.max(17,x+18*Math.sqrt(s+1)*Math.cos(s*2.4)));
      ty=Math.min(mapHeight-17,Math.max(17,y+18*Math.sqrt(s+1)*Math.sin(s*2.4)));
    }
    used.push([tx,ty]);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.strokeStyle='#394b50';ctx.lineWidth=1.7;ctx.stroke();
    ctx.beginPath();ctx.arc(tx,ty,point?.id===p.id?17:13,0,2*Math.PI);ctx.fillStyle=palette[p.type]||palette.lainnya;ctx.fill();ctx.lineWidth=point?.id===p.id?5:2;ctx.strokeStyle=point?.id===p.id?'#ffc04d':'#fff';ctx.stroke();
    ctx.textAlign='center';line(i+1,tx,ty+5,'bold 15px Arial','white');ctx.textAlign='left';
  }
  const unit=10**Math.floor(Math.log10(frame.metresPerPixel*110));
  const scale=[1,2,5,10].map(v=>v*unit).filter(v=>v<=frame.metresPerPixel*110).at(-1)||unit;
  const px=scale/frame.metresPerPixel;
  ctx.fillStyle='#fff';ctx.fillRect(10,mapHeight-54,px+24,45);
  ctx.fillStyle='#273d42';ctx.fillRect(20,mapHeight-20,px,4);
  line(scale>=1000?km(scale)+' km':scale+' m',20,mapHeight-27,'17px Arial');
  if(frame.logo)ctx.drawImage(frame.logo,mapWidth-115,mapHeight-36,100,25);
  ctx.restore();
  line('PANJANG TRASE',panelX,top+28,'bold 19px Arial','#547078');
  line(km(route.length_m)+' km',panelX,top+88,'bold 50px Arial');
  line(route.verification==='field'?'Terverifikasi lapangan':'Estimasi • Belum diverifikasi',panelX,top+125,'22px Arial','#52656b',panelWidth);
  let y=top+179;
  if(image){
    const h=incident ? 177 : 220;ctx.fillStyle='#eff2f2';ctx.fillRect(panelX,y,panelWidth,h);
    const ratio=Math.min(panelWidth/image.width,h/image.height);
    ctx.drawImage(image,panelX+(panelWidth-image.width*ratio)/2,y+(h-image.height*ratio)/2,image.width*ratio,image.height*ratio);
    y+=h+28;ctx.font='20px Arial';ctx.fillStyle='#254147';y=wrap(ctx,photo.caption||'Foto evidence',panelX,y,panelWidth,22,2)+7;
  }
  if(point){line(point.label+'  ·  '+km(point.station_m)+' km',panelX,y,'bold 25px Arial','#172c36',panelWidth);y+=34;}
  if(incident){
    const status=INCIDENT_STATUSES[incident.status] || 'Belum dicatat';
    line([incident.ticket,status].filter(Boolean).join('  ·  '),panelX,y,'21px Arial','#714638',panelWidth);y+=27;
    for(const [key,label] of [['started_at','Mulai'],['recovered_at','Pulih']])if(incident[key]){
      line(label+' '+new Date(incident[key]).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})+' WIB',panelX,y,'18px Arial','#465964',panelWidth);y+=25;
    }
  }
  y+=12;line('Titik dan jarak dari site awal',panelX,y,'bold 21px Arial');y+=29;
  const rowHeight = pins.length * 25 > 958-y ? 20 : 25;
  const available=Math.max(3,1+Math.floor((955-y)/rowHeight));
  let list=pins;
  if(list.length>available)list=[...list.slice(0,available-2),null,list.at(-1)];
  for(const row of list){
    if(!row){line('…  Daftar lengkap tersedia di CSV titik',panelX,y,'16px Arial','#52656b',panelWidth);y+=rowHeight;continue;}
    line((row.i+1)+'.  '+row.p.label,panelX,y,'18px Arial','#324c53',300);
    line(km(row.p.station_m)+' km',panelX+310,y,'18px Arial','#324c53',140);y+=rowHeight;
  }
  for (const [x,type,label] of [[40,'site','Site'],[135,'remote_sector','Remote Sector'],[315,'tipus','Titik putus'],
    [459,'sambungan','Sambungan'],[617,'lainnya','Titik lainnya']]) {
    ctx.beginPath();ctx.arc(x+9,978,7,0,2*Math.PI);ctx.fillStyle=palette[type];ctx.fill();
    line(label,x+25,984,'21px Arial');
  }
  line(frame.credits||'Skema trase tersimpan',left,1047,'18px Arial','#52656b',1050);
  if(cables.length){
    ctx.beginPath();ctx.arc(794,978,7,0,2*Math.PI);ctx.fillStyle=CABLE_COLOR;ctx.fill();
    line('Kabel baru aktif',810,984,'21px Arial');
  }
  line('Peta Jalur EPM  /  '+(route.area||route.start_site),panelX,1047,'18px Arial','#52656b',panelWidth);
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Gagal membuat laporan.')),
    format==='jpg'?'image/jpeg':'image/png',0.92));
}
