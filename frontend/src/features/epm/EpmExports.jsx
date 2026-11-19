import { useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import { triggerBlobDownload } from '../../utils/downloadFile';
import { buildReportJpg } from './epmJpg';
import './epm-exports.css';

const formats = [
  ['routes', 'Inventaris jalur (CSV)', 'csv'], ['points', 'Titik dan jarak (CSV)', 'csv'],
  ['incidents', 'Gangguan sesuai filter (CSV)', 'csv'], ['geojson', 'Jalur dan titik (GeoJSON)', 'geojson'],
  ['json', 'Data terstruktur (JSON)', 'json'], ['zip', 'Cadangan lengkap dengan foto (ZIP)', 'zip'],
];

async function message(error) {
  let detail=error.response?.data;
  if (detail instanceof Blob) {
    try {detail=JSON.parse(await detail.text());} catch {detail=null;}
  }
  return typeof detail?.detail==='string'?detail.detail:error.message||'Permintaan gagal.';
}

function Modal({title,onClose,children}) {
  const ref=useRef(null);
  useEffect(()=>{ const el=ref.current;el.showModal();return ()=>el.close(); },[]);
  return <dialog ref={ref} className="epm-export-modal" aria-label={title} onCancel={onClose}>
    <header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Tutup">×</button></header>
    {children}
  </dialog>;
}

async function makePowerPoint(image, routeName) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const deck = new PptxGenJS();
  deck.title = routeName;
  deck.defineLayout({name:'EPM_REPORT',width:16,height:11});
  deck.layout = 'EPM_REPORT';
  const slide = deck.addSlide();
  const data = await new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = ()=>reject(reader.error);
    reader.readAsDataURL(image);
  });
  slide.addImage({data,x:0,y:0,w:16,h:11,altText:'Laporan peta jalur EPM: '+routeName});
  return deck.write({outputType:'blob'});
}

function Report({route,point:initialPoint,incident:initialIncident,onClose}) {
  const [pointId,setPoint]=useState(initialPoint?.id||initialIncident?.point_id||'');
  const [incidentId,setIncident]=useState(initialIncident?.id||'');
  const [events,setEvents]=useState([]);
  const [photos,setPhotos]=useState([]);
  const [photoId,setPhoto]=useState('');
  const [layer,setLayer]=useState('plain');
  const [format,setFormat]=useState('jpg');
  const [exporting,setExporting]=useState(false);
  const [status,setStatus]=useState('');
  const [preview,setPreview]=useState(null);
  const [busy,setBusy]=useState(false);
  const [retry,setRetry]=useState(0);
  const sequence=useRef(0);
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  const pt=route.points.find(p=>p.id===pointId);
  const ev=events.find(e=>e.id===incidentId);
  const available=photos.filter(p=>!p.incident_id || p.incident_id===incidentId);
  useEffect(()=>{
    if(!pointId) return;
    const controller=new AbortController();
    Promise.all([
      api.get('/epm/incidents',{params:{point_id:pointId},signal:controller.signal}),
      api.get('/epm/points/'+pointId+'/photos',{signal:controller.signal}),
    ]).then(([a,b])=>{if(!controller.signal.aborted){setEvents(a.data);setPhotos(b.data);}})
      .catch(()=>{if(!controller.signal.aborted)setStatus('Daftar foto atau kejadian gagal dimuat.');});
    return ()=>controller.abort();
  },[pointId,retry]);
  useEffect(()=>()=>{if(preview) URL.revokeObjectURL(preview.url);},[preview]);
  function changed() { sequence.current++;setPreview(null);setStatus('');setBusy(false); }
  async function generate(){
    const seq=++sequence.current;setBusy(true);setStatus('');setPreview(null);
    try {
      const selected=available.find(p=>p.id===photoId);
      const blob=await buildReportJpg({route,point:pt,incident:ev,photo:selected,layer,format});
      if(mounted.current&&sequence.current===seq)setPreview({blob,url:URL.createObjectURL(blob)});
    } catch(e){if(mounted.current&&sequence.current===seq)setStatus(e.message);}
    finally{if(mounted.current&&sequence.current===seq)setBusy(false);}
  }
  async function download() {
    setExporting(true);setStatus('');
    try {
      const file=format==='pptx'?await makePowerPoint(preview.blob,route.name):preview.blob;
      const filename=route.name.replace(/[<>:"/\\|?*]/g,'-');
      triggerBlobDownload(file,'Peta EPM '+filename+'.'+format);
    } catch {setStatus('File laporan gagal dibuat. Coba unduh lagi.');}
    finally {setExporting(false);}
  }
  return <Modal title="Simpan Report" onClose={onClose}>
    <p>{route.name} · 1.600 × 1.100 piksel</p>
    <div className="epm-export-fields">
      <label>Format laporan<select value={format} onChange={e=>{changed();setFormat(e.target.value);}} disabled={exporting}>
        <option value="jpg">JPG</option><option value="png">PNG</option><option value="pptx">PPTX</option>
      </select></label>
      <label>Latar peta<select value={layer} onChange={e=>{changed();setLayer(e.target.value);}}>
        <option value="plain">Skema tanpa latar</option><option value="road">Jalan</option><option value="satellite">Satelit</option></select></label>
      <label>Sorot titik<select value={pointId} onChange={e=>{changed();setPoint(e.target.value);setPhoto('');setIncident('');setEvents([]);setPhotos([]);}}>
        <option value="">Seluruh jalur</option>{route.points.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      {pointId && <><label>Kejadian<select value={incidentId} onChange={e=>{changed();setIncident(e.target.value);setPhoto('');}}>
        <option value="">Foto lokasi saja</option>{events.map((e,i)=><option key={e.id} value={e.id}>{e.ticket||'Kejadian '+(i+1)}{e.started_at?' · '+new Date(e.started_at).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'}):''}</option>)}</select></label>
      <label>Sertakan foto evidence<select value={photoId} onChange={e=>{changed();setPhoto(e.target.value);}}>
        <option value="">Tanpa foto</option>{available.map((p,i)=><option key={p.id} value={p.id}>{p.caption||'Foto '+(i+1)} · {p.incident_id?'Kejadian':'Lokasi'}</option>)}</select></label></>}
    </div>
    {photoId && <img className="epm-selected-photo" src={'/api/v1/epm/photos/'+photoId+'/thumbnail'} alt="Foto pilihan"/>}
    {status && <p role="alert">{status} <button onClick={()=>setRetry(n=>n+1)}>Muat ulang pilihan</button></p>}
    {preview && <img src={preview.url} alt="Pratinjau laporan peta" className="epm-jpg-preview"/>}
    <footer><button disabled={busy||exporting} onClick={generate}>{busy?'Membuat pratinjau…':'Buat pratinjau'}</button>
    {preview && <button disabled={exporting} onClick={download}>{exporting?'Menyiapkan file…':'Unduh '+format.toUpperCase()}</button>}</footer>
  </Modal>;
}

function Transfers({filters,onClose,onChange}) {
  const [kind,setKind]=useState('zip'),[file,setFile]=useState(null),[summary,setSummary]=useState(null);
  const [copy,setCopy]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
  const operation=useRef(null),fileInput=useRef(null);
  const run=async fn=>{setStatus('');setBusy(true);try{await fn();}catch(e){setStatus(await message(e));}finally{setBusy(false);}};
  const send=(action,f)=>api.post('/epm/imports/'+action,f,{params:{copy,operation:operation.current},
    headers:{'Content-Type':f.name.toLowerCase().endsWith('.zip')?'application/zip':'application/json'},
    transformRequest:[data=>data],timeout:600000});
  const cleanFilters=Object.fromEntries(Object.entries(filters||{}).filter(([,v])=>v&&v!=='all'));
  return <Modal title="Cadangan dan ekspor data" onClose={busy?()=>{}:onClose}>
    <label>Unduh data<select value={kind} onChange={e=>setKind(e.target.value)}>{formats.map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label>
    <button disabled={busy} onClick={()=>run(async()=>{
      const {data}=await api.get('/epm/exports/'+kind,{params:kind==='incidents'?cleanFilters:{},responseType:'blob',timeout:600000});
      triggerBlobDownload(data,'epm-'+kind+'.'+formats.find(([k])=>k===kind)[2]);setStatus('Unduhan siap.');
    })}>Unduh data</button>
    <hr/><label>Impor cadangan JSON atau ZIP<input ref={fileInput} type="file" accept=".json,.zip" disabled={busy} onChange={e=>{
      setFile(e.target.files[0]||null);setSummary(null);setCopy(false);setStatus('');operation.current=crypto.randomUUID();
    }}/></label>
    <button disabled={!file||busy} onClick={()=>run(async()=>{const {data}=await send('preview',file);setSummary(data);})}>Periksa cadangan</button>
    {summary && <section><p>{summary.with_originals?'Paket data dan foto asli':'Data terstruktur tanpa berkas foto'}</p>
      <ul>{summary.routes.map(r=><li key={r.id}>{r.name} · {r.points} titik · {r.incidents} kejadian · {r.photos} foto {r.duplicate?' · sudah ada':''}</li>)}</ul>
      <label className="epm-check"><input type="checkbox" checked={copy} onChange={e=>{setCopy(e.target.checked);operation.current=crypto.randomUUID();}}/> Impor semua sebagai salinan baru</label>
      <button disabled={busy} onClick={()=>run(async()=>{const {data}=await send('commit',file);setStatus(data.created+' jalur ditambahkan, '+data.skipped+' dilewati.');
        setSummary(null);setFile(null);fileInput.current.value='';onChange?.();})}>Simpan hasil impor</button></section>}
    {busy && <p role="status">Memproses data…</p>}{status&&<p role="status">{status}</p>}
  </Modal>;
}

export default function EpmExports({mode,route,point,incident,filters,onChange}){
  const [open,setOpen]=useState(false);
  const isReport=mode==='report';
  return <div className="epm-export-actions">
    <button type="button" disabled={isReport&&!route} onClick={()=>setOpen(true)}>{isReport?'Simpan Report':'Cadangan & data'}</button>
    {open && (isReport ? route && <Report key={route.id} route={route} point={point} incident={incident} onClose={()=>setOpen(false)}/>
      : <Transfers filters={filters} onChange={onChange} onClose={()=>setOpen(false)}/>)}
  </div>;
}
