import {useCallback,useEffect,useRef,useState} from 'react';
import {MapPinned,Camera,Plus,RotateCw} from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import {DashboardPageHeader} from '../components/ui/DashboardPrimitives';
import api from '../services/api';
import EvidenceGallery from '../features/epm/EvidenceGallery';
import EpmExports from '../features/epm/EpmExports';
import RouteMap from '../features/epm/RouteMap';
import RouteEditor from '../features/epm/RouteEditor';
import IncidentEditor from '../features/epm/IncidentEditor';
import CableReplacement,{CableActivityList} from '../features/epm/CableReplacement';
import {distanceLabel,errorText,INCIDENT_STATUSES,POINT_TYPES,wibLabel} from '../features/epm/routeEditing';
import '../features/epm/epm.css';

const tabs=['Peta & Titik','Inventaris Jalur','Laporan Gangguan'];
const verificationLabel=v=>v==='field'?'Terverifikasi lapangan':'Belum diverifikasi';

function useResource(path,refresh) {
  const [state,setState]=useState({});
  useEffect(()=>{
    if (!path) return;
    const controller=new AbortController();
    api.get(path,{signal:controller.signal}).then(({data})=>{
      if(!controller.signal.aborted)setState({path,data});
    }).catch(error=>{
      if(!controller.signal.aborted)setState(prev=>({path,data:prev.path===path?prev.data:undefined,error:errorText(error)}));
    });
    return ()=>controller.abort();
  },[path,refresh]);
  return path && state.path===path?state:{};
}

function ReportTable({rows,onSelect,selected}) {
  return <div className="epm-scroll"><table>
    <thead><tr><th>Titik / Jalur</th><th>Tiket</th><th>Status</th><th>Mulai (WIB)</th><th>Pulih (WIB)</th><th>Durasi</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.id} data-selected={r.id===selected}><td><button type="button" className="epm-link" onClick={()=>onSelect(r)}>{r.point_label || 'Detail titik'}</button><small>{r.route_name}</small></td>
    <td>{r.ticket || '—'}</td><td>{INCIDENT_STATUSES[r.status] || 'Belum dicatat'}</td><td>{wibLabel(r.started_at)}</td><td>{wibLabel(r.recovered_at)}</td>
    <td>{r.duration_minutes!=null ? Math.round(r.duration_minutes)+' menit':'—'}</td></tr>)}</tbody></table></div>;
}

function PointPhotoDialog({points, point, events, onSelect, onClose, onChange}) {
  const dialog=useRef(null);
  useEffect(()=>{
    const element=dialog.current;
    element.showModal();
    return ()=>element.close();
  },[]);
  return <dialog ref={dialog} className="epm-photo-dialog" aria-labelledby="epm-photo-title" onCancel={onClose}>
    <div className="epm-stack">
      <div className="epm-heading">
        <h2 id="epm-photo-title">Foto titik putus</h2>
        <button type="button" onClick={onClose}>Tutup galeri</button>
      </div>
      {point ? <>
        <label>Pilih titik putus<select value={point.id} onChange={e=>onSelect(e.target.value)}>
          {points.map(p=><option value={p.id} key={p.id}>{p.label}</option>)}
        </select></label>
        <EvidenceGallery pointId={point.id} incidents={events.filter(row=>row.point_id===point.id)} onChange={onChange}/>
      </> : <p>Belum ada titik putus pada jalur ini.</p>}
    </div>
  </dialog>;
}

export default function EpmRouteMapPage() {
  const [tick,setTick]=useState(0), refresh=useCallback(()=>setTick(i=>i+1),[setTick]);
  useEffect(()=>{
    const visibleRefresh=()=>{if(!document.hidden)refresh();};
    const timer=window.setInterval(visibleRefresh,30000);
    window.addEventListener('focus',visibleRefresh);document.addEventListener('visibilitychange',visibleRefresh);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',visibleRefresh);document.removeEventListener('visibilitychange',visibleRefresh);};
  },[refresh]);
  const [tab,setTab]=useState(tabs[0]),[routeId,setRouteId]=useState(''),[pointId,setPointId]=useState(''),[incidentId,setIncidentId]=useState('');
  const [editor,setEditor]=useState(null),[eventEditor,setEventEditor]=useState(null),[notice,setNotice]=useState('');
  const [search,setSearch]=useState(''),[filters,setFilters]=useState({route_id:'',status:'',date_from:'',date_to:''});
  const [photoTarget,setPhotoTarget]=useState(null);
  const [cableDraft,setCableDraft]=useState(null);
  const listing=useResource('/epm/routes',tick);
  const routes=listing.data || [];
  const activeId=routes.some(r=>r.id===routeId)?routeId:(routes[0]?.id || '');
  const detail=useResource(activeId?`/epm/routes/${activeId}`:'',tick);
  const route=detail.data;
  const points=route?.points || [];
  const point=points.find(p=>p.id===pointId) || points[0];
  const breakPoints=points.filter(p=>p.type==='tipus');
  const photoPoint=breakPoints.find(p=>p.id===photoTarget) || breakPoints[0];
  const routeEvents=useResource(activeId?`/epm/incidents?route_id=${activeId}`:'',tick);
  const events=routeEvents.data || [];
  const pointEvents=events.filter(r=>r.point_id===point?.id);
  const query=new URLSearchParams(Object.entries(filters).filter(([,v])=>v));
  const report=useResource(tab===tabs[2]?'/epm/reports/incidents?'+query:'',tick);
  const reportEvent=report.data?.find(r=>r.id===incidentId);
  const incident=tab===tabs[2]?reportEvent:pointEvents.find(r=>r.id===incidentId);
  const reportForActive=incident && incident.route_id===route?.id;
  const cableActivities=route?.cable_replacements || [];

  function selectRoute(id) {setRouteId(id);setPointId('');setIncidentId('');setEventEditor(null);setNotice('');}
  function selectPoint(id) {setPointId(id);setIncidentId('');setEventEditor(null);}
  function openEvent(r) {
    setRouteId(r.route_id);setPointId(r.point_id);setIncidentId(r.id);setEventEditor(null);
  }
  async function archive(item,kind) {
    if(!window.confirm(`Arsipkan ${kind==='routes'?item.name:(item.ticket||'kejadian ini')}?`))return;
    try {await api.delete(`/epm/${kind}/${item.id}`,{params:{expected_revision:item.revision}});setNotice('Data diarsipkan.');setIncidentId('');refresh();}
    catch(e){setNotice(errorText(e));}
  }
  const failures=[listing.error,detail.error,routeEvents.error,report.error].filter(Boolean);
  const shownRoutes=routes.filter(r=>[r.name,r.area,r.pic,r.start_site,r.end_site].some(v=>v?.toLowerCase().includes(search.toLowerCase())));
  function changeTab(t) {setTab(t);setIncidentId('');setEventEditor(null);setNotice('');}
  function incidentDetail(row) {
    return <section className="epm-stack epm-panel"><div className="epm-heading"><div><small>Detail kejadian</small><h3>{row.ticket || row.point_label} · {INCIDENT_STATUSES[row.status] || 'Belum dicatat'}</h3></div><button onClick={()=>setIncidentId('')}>Tutup detail</button></div>
      <dl className="epm-values"><div><dt>Mulai</dt><dd>{wibLabel(row.started_at)}</dd></div><div><dt>Pulih</dt><dd>{wibLabel(row.recovered_at)}</dd></div><div><dt>Penyebab</dt><dd>{row.cause || '—'}</dd></div><div><dt>Tindakan</dt><dd>{row.action || '—'}</dd></div></dl>
      <div className="epm-row"><button onClick={()=>setEventEditor({initial:row,point:{id:row.point_id,label:row.point_label},routeId:row.route_id})}>Edit kejadian</button><button onClick={()=>archive(row,'incidents')}>Arsipkan kejadian</button></div>
      <EvidenceGallery key={row.id} pointId={row.point_id} incidents={[row]} incidentId={row.id} onChange={refresh}
        readOnly={Boolean(row.point_archived_at)}/>
      {route?.id===row.route_id && <CableActivityList activities={cableActivities} incidentId={row.id} incidents={events}/>}
    </section>;
  }

  return <main className="epm-page"><Breadcrumb/><DashboardPageHeader title="Peta Jalur EPM" icon={MapPinned}/>
    <div className="epm-workspace">
    {failures.length>0 && <div role="alert" className="epm-note">Gagal memuat data. {[...new Set(failures)].join(' ')} <button onClick={refresh}>Coba lagi</button></div>}
    {notice && <p className="epm-note" role="status">{notice}</p>}
    {editor ? <RouteEditor initial={editor.initial} initialPointId={editor.pointId} initialCorrection={editor.correction} onClose={()=>setEditor(null)}
      onSaved={id=>{setEditor(null);selectRoute(id);setTab(tabs[0]);setNotice('Jalur tersimpan.');refresh();}}/> : <>
    <div className="epm-top"><nav className="epm-tabs" aria-label="Bagian halaman">{tabs.map(t=><button key={t} aria-current={tab===t?'page':undefined} onClick={()=>changeTab(t)}>{t}</button>)}</nav>
      <div className="epm-row">
        {tab===tabs[0] && <EpmExports key="report" mode="report" route={route || null} point={point || null}
          incident={reportForActive?incident:null}/>}
        {tab===tabs[1] && <EpmExports key="data" mode="data" filters={filters} onChange={refresh}/>}
        <button className="epm-icon" aria-label="Perbarui data" title="Perbarui data" onClick={refresh}><RotateCw size={16}/></button>
        <button className="epm-primary" onClick={()=>setEditor({initial:null})}><Plus size={16}/> Jalur baru</button>
      </div>
    </div>
    {!listing.data && !listing.error && <p role="status">Memuat inventaris jalur…</p>}
    {listing.data && !routes.length && <p className="epm-note">Inventaris masih kosong. Buat jalur atau impor cadangan melalui menu data.</p>}
    {tab===tabs[0] && routes.length>0 && <>
      <div className="epm-toolbar"><label>Jalur aktif<select value={activeId} onChange={e=>selectRoute(e.target.value)}>{routes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      {route && <><div><small>Panjang trase</small><strong>{distanceLabel(route.length_m)}</strong></div><div><small>Verifikasi</small><span>{verificationLabel(route.verification)}</span></div>
      <div className="epm-toolbar-actions">
        <button onClick={()=>setEditor({initial:route})}>Edit jalur</button>
        <button onClick={()=>setEditor({initial:route,correction:true,pointId:point?.id})}>Koreksi ruas di peta</button>
        <button className="epm-primary" onClick={()=>setPhotoTarget(point?.type==='tipus' ? point.id : breakPoints[0]?.id || '')}>
          <Camera size={16}/> Foto titik putus
        </button>
      </div></>}</div>
      {route ? <>
        <div className="epm-split"><RouteMap route={route} selected={point?.id} onSelect={selectPoint}/>
        <section className="epm-panel epm-list"><header><h2>Titik jalur <small>{points.length}</small></h2></header>
        <ol>{points.map((p,i)=><li key={p.id}><button aria-current={point?.id===p.id?'location':undefined} onClick={()=>selectPoint(p.id)}>
          <b>{i+1}</b><span><strong>{p.label}</strong><small>{POINT_TYPES[p.type]}{p.photo_count>0 && <> · <Camera size={11}/> {p.photo_count}</>}</small></span>
          <span className="epm-dist">{distanceLabel(p.station_m)}<small>+{Math.round(p.segment_m || 0)} m</small></span>
        </button></li>)}</ol></section></div>
        {point && <section className="epm-panel epm-stack"><div className="epm-heading"><div><small>{POINT_TYPES[point.type]} · {distanceLabel(point.station_m)}</small><h2>{point.label}</h2></div>
          <div className="epm-row">
            <button onClick={()=>setEditor({initial:route,pointId:point.id})}>Edit titik</button>
            <button onClick={()=>setCableDraft({route,point})}>Catat penggantian kabel</button>
          </div></div>
          <p className="epm-muted">Koordinat {point.lat}, {point.lng}{point.note?' · '+point.note:''}</p>
          {point.type==='tipus' && <>
            <div className="epm-row"><button className="epm-primary" onClick={()=>setPhotoTarget(point.id)}><Camera size={16}/> Tambah / lihat foto ({point.photo_count || 0})</button></div>
            <div className="epm-heading"><h3>Riwayat gangguan</h3><button onClick={()=>setEventEditor({point,routeId:activeId})}>Catat gangguan</button></div>
            {!routeEvents.data ? <p>Memuat riwayat…</p> : pointEvents.length ? <ReportTable rows={pointEvents} selected={incidentId} onSelect={openEvent}/> : <p className="epm-muted">Belum dicatat</p>}
          </>}
          <CableActivityList activities={cableActivities} pointId={point.id} incidents={events}/>
        </section>}
      </>:!detail.error && <p>Memuat trase…</p>}
    </>}
    {tab===tabs[1] && <section className="epm-panel epm-stack"><div className="epm-heading"><h2>Inventaris jalur</h2><label>Cari jalur<input type="search" value={search} placeholder="Nama, site, area, PIC" onChange={e=>setSearch(e.target.value)}/></label></div>
      <div className="epm-scroll"><table><thead><tr><th>Jalur</th><th>Area / PIC</th><th>Panjang</th><th>Referensi aset</th><th>Verifikasi</th><th>Aksi</th></tr></thead><tbody>
        {shownRoutes.map(r=><tr key={r.id}><td><button className="epm-link" onClick={()=>{selectRoute(r.id);setTab(tabs[0]);}}>{r.name}</button><small>{r.start_site} → {r.end_site}</small></td><td>{r.area || '—'}<small>{r.pic || '—'}</small></td><td>{distanceLabel(r.length_m)}<small>Acuan {r.reference_distance||'—'}</small></td><td>{r.asset_ref||'—'}</td><td>{verificationLabel(r.verification)}</td><td><button onClick={()=>archive(r,'routes')}>Arsipkan</button></td></tr>)}
      </tbody></table></div>{!shownRoutes.length && <p>Tidak ada jalur yang cocok.</p>}</section>}
    {tab===tabs[2] && <section className="epm-panel epm-stack"><h2>Laporan gangguan</h2><div className="epm-form">
      <label>Jalur<select value={filters.route_id} onChange={e=>setFilters({...filters,route_id:e.target.value})}><option value="">Semua jalur</option>{routes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label>Status gangguan<select value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}><option value="">Semua status</option>{Object.entries(INCIDENT_STATUSES).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
      {[['date_from','Dari tanggal'],['date_to','Sampai tanggal']].map(([k,l])=><label key={k}>{l} (WIB)<input type="date" value={filters[k]} min={k==='date_to'?filters.date_from || undefined:undefined} max={k==='date_from'?filters.date_to || undefined:undefined} onChange={e=>setFilters({...filters,[k]:e.target.value})}/></label>)}
      </div>{report.data?.length ? <ReportTable rows={report.data} selected={incidentId} onSelect={openEvent}/> : <p>{report.data?'Belum ada kejadian untuk filter ini.':'Memuat laporan…'}</p>}</section>}
    {eventEditor ? <IncidentEditor key={eventEditor.initial?.id || eventEditor.point.id} {...eventEditor} onClose={()=>setEventEditor(null)} onSaved={()=>{setEventEditor(null);setNotice('Kejadian tersimpan.');refresh();}}/> : incident && incidentDetail(incident)}
    {photoTarget!==null && <PointPhotoDialog points={breakPoints} point={photoPoint} events={events}
      onSelect={setPhotoTarget} onClose={()=>setPhotoTarget(null)} onChange={refresh}/>}
    {cableDraft && <CableReplacement {...cableDraft} incidents={events} onClose={()=>setCableDraft(null)}
      onSaved={activity=>{setCableDraft(null);refresh();
        setNotice('Penggantian kabel dicatat. '+activity.archived_point_ids.length+' titik diarsipkan.');}}/>}
    </>}
    </div>
  </main>;
}
