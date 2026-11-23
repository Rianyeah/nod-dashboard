import {INCIDENT_STATUSES,POINT_COLORS,POINT_TYPES,wibLabel} from './routeEditing';
import {CABLE_COLOR} from './cableDisplay';
import {chooseReportInset,compactFocusRadius,drawReportMap,fitText,focusBounds,loadReportImage,reportKm,
  reportMapFrame,roundedPanel} from './epmReportMap';

export const REPORT_LAYOUTS={
  full:{label:'Lengkap',fileLabel:'Lengkap',width:1600,height:1100,map:{x:40,y:173,w:976,h:806},panelX:1046,panelWidth:514},
  compact:{label:'Ringkas 16:9 untuk PPT',fileLabel:'Ringkas 16x9',width:1600,height:900,
    map:{x:40,y:148,w:1520,h:647},panelX:1056,panelWidth:504},
  square:{label:'Ringkas 1:1 (persegi)',fileLabel:'Ringkas 1x1',width:1200,height:1200,
    map:{x:40,y:148,w:1120,h:947},panelX:704,panelWidth:456},
};

const ink='#15343d';
const muted='#4d6771';
const accent='#08766d';
const rule='#d9e3e4';
const numberFormat=new Intl.NumberFormat('id-ID',{maximumFractionDigits:1});

function text(ctx,value,x,y,{size=18,weight=400,color=ink,width}={}) {
  ctx.font=weight+' '+size+'px Arial';
  ctx.fillStyle=color;
  ctx.fillText(width ? fitText(ctx,value,width) : String(value ?? ''),x,y);
}

function divider(ctx,x1,x2,y) {
  ctx.fillStyle=rule;
  ctx.fillRect(x1,y,x2-x1,1);
}

function wrapText(ctx,value,x,y,width,{size=17,color=muted,lines=2}={}) {
  ctx.font=size+'px Arial';
  const words=String(value || '').trim().split(/\s+/);
  let row='', used=0;
  for(const [i,word] of words.entries()){
    const next=row ? row+' '+word : word;
    if(row && ctx.measureText(next).width>width){
      text(ctx,row,x,y+used*(size+5),{size,color,width});
      used++;
      row=word;
      if(used===lines-1) {row=words.slice(i).join(' ');break;}
    }else row=next;
  }
  if(row) text(ctx,row,x,y+used*(size+5),{size,color,width});
}

function header(ctx,route,layout) {
  const {width,height,panelX,panelWidth}=layout;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
  ctx.fillStyle=accent;ctx.fillRect(0,0,width,7);
  text(ctx,'Peta Jalur EPM',40,48,{size:22,weight:700,color:accent});
  text(ctx,route.name,40,106,{size:48,weight:700,width:panelX-61});
  const date=new Intl.DateTimeFormat('id-ID',{dateStyle:'long',timeZone:'Asia/Jakarta'}).format(new Date());
  text(ctx,date,panelX+260,43,{size:17,color:muted,width:panelWidth-260});
  text(ctx,'Panjang trase',panelX,44,{size:17,color:muted});
  text(ctx,reportKm(route.length_m),panelX,92,{size:41,weight:700});
  text(ctx,route.verification==='field'?'Terverifikasi lapangan':'Estimasi · Belum diverifikasi',
    panelX+260,78,{size:17,color:muted,width:panelWidth-260});
  text(ctx,route.points.length+' titik',panelX+260,105,{size:17,color:muted});
  divider(ctx,40,width-40,125);
}

function pointHeading(ctx,point,x,y,width) {
  text(ctx,'Titik terpilih',x,y,{size:17,weight:700,color:accent});
  text(ctx,point.label,x,y+37,{size:30,weight:700,width});
  text(ctx,(POINT_TYPES[point.type] || 'Titik')+' · '+reportKm(point.station_m)+' dari site awal',x,y+64,
    {size:17,color:muted,width});
}

function photoPanel(ctx,image,box) {
  const {x,y,w,h}=box;
  roundedPanel(ctx,x,y,w,h,'#edf2f2');
  ctx.save();ctx.beginPath();ctx.roundRect(x,y,w,h,12);ctx.clip();
  const scale=Math.min(w/image.width,h/image.height);
  const iw=image.width*scale,ih=image.height*scale;
  ctx.drawImage(image,x+(w-iw)/2,y+(h-ih)/2,iw,ih);
  ctx.restore();
}

function compactInset(ctx,{card,zoom,frame,route,shape,cables,point,image,photo,incident,origin}) {
  const x=origin.x+card.x,y=origin.y+card.y;
  const pad=12,headerH=57,contentY=y+headerH;
  ctx.save();ctx.shadowColor='#182f3650';ctx.shadowBlur=15;ctx.shadowOffsetY=4;
  roundedPanel(ctx,x,y,card.w,card.h,'#fff','#b7cdca',12);
  ctx.restore();
  text(ctx,'Zoom lokasi',x+pad,y+21,{size:14,weight:700,color:accent});
  text(ctx,point.label+' · '+reportKm(point.station_m),x+pad,y+43,{size:19,weight:700,width:card.w-2*pad});
  drawReportMap(ctx,{x:x+pad,y:contentY,...zoom},frame,route,shape,cables,point,{detail:true});
  if(image){
    const photoX=x+zoom.w+2*pad;
    photoPanel(ctx,image,{x:photoX,y:contentY,w:card.w-zoom.w-3*pad,h:zoom.h});
    text(ctx,photo.caption || 'Foto evidence',photoX,contentY+zoom.h+17,
      {size:13,color:muted,width:card.w-zoom.w-3*pad});
  }
  if(incident) incidentDetails(ctx,incident,x+pad,contentY+zoom.h+(image?40:30),card.w-2*pad);
}

function incidentDetails(ctx,incident,x,y,width) {
  if(!incident) return;
  const status=INCIDENT_STATUSES[incident.status] || 'Belum dicatat';
  text(ctx,[incident.ticket,status].filter(Boolean).join(' · '),x,y,{size:18,weight:700,width});
  const time=[incident.started_at && 'Mulai '+wibLabel(incident.started_at),
    incident.recovered_at && 'Pulih '+wibLabel(incident.recovered_at)].filter(Boolean);
  if(time.length) wrapText(ctx,time.join('  ·  '),x,y+24,width,{size:15});
}

function table(ctx,points,x,y,width,limit,point) {
  text(ctx,'Urutan titik dan jarak',x,y,{size:22,weight:700});
  const rows=points.map((p,i)=>({p,i}));
  const shown=rows.length<=limit ? rows : [...rows.slice(0,limit-2),null,rows.at(-1)];
  const rowH=31, headingY=y+13;
  roundedPanel(ctx,x,headingY,width,(shown.length+1)*rowH+1,'#fff',rule,8);
  ctx.save();ctx.beginPath();ctx.roundRect(x,headingY,width,(shown.length+1)*rowH,8);ctx.clip();
  ctx.fillStyle='#e8f1ef';ctx.fillRect(x,headingY,width,rowH);
  text(ctx,'#',x+12,headingY+21,{size:15,weight:700});
  text(ctx,'Titik',x+44,headingY+21,{size:15,weight:700});
  text(ctx,'Dari awal',x+width-193,headingY+21,{size:15,weight:700});
  text(ctx,'Δ meter',x+width-89,headingY+21,{size:15,weight:700});
  shown.forEach((entry,i)=>{
    const rowY=headingY+(i+1)*rowH;
    const selected=Boolean(entry && entry.p.id===point?.id);
    if(selected || i%2===1) {
      ctx.fillStyle=selected?'#fff6e1':'#f6f9f9';ctx.fillRect(x,rowY,width,rowH);
    }
    if(selected) {ctx.fillStyle='#d89b31';ctx.fillRect(x,rowY,3,rowH);}
    if(!entry) {
      text(ctx,'…  Daftar lengkap tersedia di CSV titik',x+12,rowY+21,{size:15,color:muted,width:width-24});
      return;
    }
    const {p,i:index}=entry;
    text(ctx,index+1,x+12,rowY+21,{size:15,color:muted});
    text(ctx,p.label,x+44,rowY+21,{size:16,weight:700,color:POINT_COLORS[p.type] || ink,width:width-249});
    text(ctx,reportKm(p.station_m),x+width-193,rowY+21,{size:15,color:muted});
    text(ctx,index && Number.isFinite(p.segment_m)?numberFormat.format(p.segment_m):'—',x+width-89,rowY+21,
      {size:15,color:muted,width:79});
  });
  ctx.restore();
}

function footer(ctx,route,mapFrame,layout,highlighted,cables) {
  const y=layout.height-88;
  const keys=Object.entries(POINT_TYPES).filter(([type])=>route.points.some(point=>point.type===type))
    .map(([type,label])=>[label,POINT_COLORS[type]]);
  if(cables.length) keys.push(['Kabel baru aktif',CABLE_COLOR]);
  if(highlighted) keys.push(['Titik terpilih','#d89b31']);
  let x=40;
  for(const [label,color] of keys){
    ctx.beginPath();ctx.arc(x+6,y-5,5.5,0,2*Math.PI);ctx.fillStyle=color;ctx.fill();
    text(ctx,label,x+17,y,{size:15,color:muted});
    x+=ctx.measureText(label).width+38;
  }
  divider(ctx,40,layout.width-40,layout.height-62);
  text(ctx,mapFrame.credits || 'Skema trase tersimpan',40,layout.height-31,{size:14,color:muted,width:layout.panelX-60});
  if(route.area) text(ctx,route.area,layout.panelX,layout.height-31,{size:15,color:muted,width:layout.panelWidth});
}

export async function buildReportJpg({route,point,incident,photo,layer,format='jpg',version='full',signal}) {
  const layout=REPORT_LAYOUTS[version];
  const compact=version!=='full';
  const {map,panelX:x,panelWidth:w}=layout;
  const canvas=document.createElement('canvas');
  canvas.width=layout.width;canvas.height=layout.height;
  const ctx=canvas.getContext('2d');
  const shape=route.geometry.coordinates;
  const cables=(route.cable_replacements || []).map(activity=>activity.geometry.coordinates);
  const positions=[...shape,...route.points.map(p=>[p.lng,p.lat]),...cables.flat()];
  const zoom=compact ? {w:photo?304:374,h:211} : {x,y:222,w:photo?326:w,h:223};
  const maxRadius=point && compact ? compactFocusRadius(positions,map,zoom) : undefined;
  const bounds=point && focusBounds(point,route.length_m,zoom.w/zoom.h,maxRadius);
  const previewUrl=photo && '/api/v1/epm/photos/'+encodeURIComponent(photo.id)+'/preview';
  const [mainFrame,image]=await Promise.all([
    reportMapFrame(layer,positions,map.w,map.h,{extraPositions:bounds || [],signal}),
    previewUrl ? loadReportImage(previewUrl) : null,
  ]);
  const detailFrame=point ? await reportMapFrame(layer,positions,zoom.w,zoom.h,{zoomBounds:bounds,signal}) : null;
  signal?.throwIfAborted();
  const inset=compact && point ? chooseReportInset(map,mainFrame,shape.length,route.points,cables,point,{
    w:zoom.w+(image?183:24), h:zoom.h+57+(image?31:12)+(incident?70:0),
  }) : null;
  header(ctx,route,layout);
  if(!compact) text(ctx,'Peta lintasan',map.x,map.y-13,{size:20,weight:700});
  drawReportMap(ctx,map,mainFrame,route,shape,cables,point,{hasFocusBox:Boolean(bounds),inset});
  if(inset) compactInset(ctx,{card:inset,zoom,frame:detailFrame,route,shape,cables,point,image,photo,incident,origin:map});
  let tableY=171;
  if(point && !compact){
    pointHeading(ctx,point,x,150,w);
    drawReportMap(ctx,zoom,detailFrame,route,shape,cables,point,{detail:true});
    roundedPanel(ctx,x+8,zoom.y+8,84,23,'#fffffff2',null,4);
    text(ctx,'Zoom lokasi',x+16,zoom.y+24,{size:13,weight:700,color:accent});
    const below=zoom.y+zoom.h;
    if(image){
      const photoX=x+zoom.w+12;
      photoPanel(ctx,image,{x:photoX,y:zoom.y,w:w-zoom.w-12,h:zoom.h});
      text(ctx,photo.caption || 'Foto evidence',photoX,below+19,{size:14,color:muted,width:w-zoom.w-12});
      incidentDetails(ctx,incident,x,below+51,w);
    } else {
      incidentDetails(ctx,incident,x,below+46,w);
    }
    tableY=below+(incident?129:image?66:46);
  }
  if(!compact){
    const limit=Math.max(3,Math.min(24,Math.floor((map.y+map.h-tableY-44)/31)));
    table(ctx,route.points,x,tableY,w,limit,point);
  }
  footer(ctx,route,mainFrame,layout,point,cables);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob ? resolve(blob) : reject(Error('Gagal membuat laporan.')),
    format==='jpg'?'image/jpeg':'image/png',0.92));
}
