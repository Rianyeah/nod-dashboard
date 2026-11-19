import {useEffect,useRef,useState} from 'react';
import api from '../../services/api';
import EvidenceGallery from './EvidenceGallery';
import RouteMap from './RouteMap';
import {distanceLabel,errorText,wibInput,wibInstant,wibLabel} from './routeEditing';

export function CableActivityList({activities,pointId,incidentId,incidents}) {
  const [photoPoint,setPhotoPoint]=useState(null);
  const entries=activities.filter(a=>incidentId ? a.incident_id===incidentId
    : a.origin_point_id===pointId || a.candidates.some(p=>p.id===pointId)).reverse();
  if (!entries.length) return null;
  return <section className="epm-stack" aria-label="Riwayat penggantian kabel">
    <h3>Riwayat penggantian kabel</h3>
    {entries.map(a=><details key={a.id} className="epm-note">
      <summary>Kabel baru · {a.origin_label} · {distanceLabel(a.length_m)} · {wibLabel(a.active_at)}</summary>
      <p>Ruas: {distanceLabel(a.start_m)} → {distanceLabel(a.end_m)} dari site awal</p>
      {a.note && <p>{a.note}</p>}
      <p>{a.archived_point_ids.length
        ? 'Titik diarsipkan: '+a.candidates.filter(p=>a.archived_point_ids.includes(p.id)).map(p=>p.label).join(', ')
        : 'Semua titik putus pada ruas ini tetap aktif.'}</p>
      {a.candidates.filter(p=>a.archived_point_ids.includes(p.id)).map(p=><div key={p.id}>
        <button type="button" aria-expanded={photoPoint===p.id} onClick={()=>setPhotoPoint(photoPoint===p.id?null:p.id)}>
          Foto arsip {p.label}
        </button>
        {photoPoint===p.id && <EvidenceGallery pointId={p.id} incidents={incidents} readOnly/>}
      </div>)}
    </details>)}
  </section>;
}

export default function CableReplacement({route,point,incidents,onClose,onSaved}) {
  const dialog=useRef(null);
  const [length,setLength]=useState('');
  const [direction,setDirection]=useState(point.station_m>=route.length_m-.01?'backward':'forward');
  const [activeAt,setActiveAt]=useState(()=>wibInput(new Date().toISOString()));
  const [incident,setIncident]=useState('');
  const [note,setNote]=useState('');
  const [preview,setPreview]=useState(null);
  const [chosen,setChosen]=useState([]);
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState('');
  const [problem,setProblem]=useState('');
  useEffect(()=>{
    const element=dialog.current;
    element.showModal();
    return ()=>element.close();
  },[]);
  const path='/epm/routes/'+route.id+'/cable-replacements';
  const details={origin_point_id:point.id,length_m:Number(length),direction,expected_revision:route.revision};
  const reset=()=>{setPreview(null);setChosen([]);setConfirmed(false);setProblem('');};

  async function submit(e) {
    e.preventDefault();
    setProblem('');
    if(preview && !confirmed) return;
    setBusy(preview?'save':'preview');
    try {
      if(!preview){
        const {data}=await api.post(path+'/preview',details);
        setPreview(data);
      }else{
        const {data}=await api.post(path,{...details,active_at:wibInstant(activeAt),incident_id:incident||null,
          note,archive_point_ids:chosen});
        onSaved(data);
      }
    } catch(err){setProblem(errorText(err));}
    finally{setBusy('');}
  }
  return <dialog className="epm-cable-dialog" ref={dialog} aria-labelledby="epm-cable-title"
    onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
    <form className="epm-stack" onSubmit={submit}>
      <div className="epm-heading"><div><h2 id="epm-cable-title">Catat penggantian kabel</h2>
        <small>{route.name} · dari {point.label} ({distanceLabel(point.station_m)})</small></div>
        <button type="button" disabled={!!busy} onClick={onClose}>Tutup</button>
      </div>
      <p className="epm-note">Masukkan panjang ruas yang diganti mengikuti lintasan di peta. Ruas kabel baru akan tampil ungu.</p>
      <fieldset disabled={!!busy} className="epm-form">
        <label>Panjang ruas (meter)<input type="number" required min="0.01" step="any" placeholder="Contoh: 1000" value={length}
          onChange={e=>{setLength(e.target.value);reset();}}/></label>
        <label>Arah dari titik awal<select value={direction} onChange={e=>{setDirection(e.target.value);reset();}}>
          <option value="forward">Menuju {route.end_site || 'site akhir'}</option>
          <option value="backward">Menuju {route.start_site || 'site awal'}</option>
        </select></label>
      </fieldset>
      {preview && <>
        <p>{distanceLabel(preview.start_m)} → {distanceLabel(preview.end_m)} dari site awal</p>
        <RouteMap route={route} cablePreview={preview.geometry}/>
        <fieldset disabled={!!busy} className="epm-stack">
          <legend>Kandidat titik putus yang terdampak</legend>
          {preview.candidates.length ? preview.candidates.map(p=><label className="epm-check-row" key={p.id}>
            <input type="checkbox" checked={chosen.includes(p.id)} onChange={e=>setChosen(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>
            Arsipkan {p.label} ({distanceLabel(p.station_m)})
          </label>) : <p>Tidak ada titik putus aktif pada ruas ini.</p>}
          <p className="epm-muted">Titik yang kamu pilih disembunyikan dari peta aktif. Riwayat kejadian dan foto tetap tersimpan.</p>
          <div className="epm-form">
            <label>Waktu kabel aktif (WIB)<input type="datetime-local" required value={activeAt} onChange={e=>setActiveAt(e.target.value)}/></label>
            <label>Kaitkan kejadian (opsional)<select value={incident} onChange={e=>setIncident(e.target.value)}>
              <option value="">Tanpa kejadian</option>
              {incidents.map(i=><option key={i.id} value={i.id}>{i.ticket || i.point_label} · {wibLabel(i.started_at)}</option>)}
            </select></label>
          </div>
          <label>Catatan pekerjaan<textarea rows="2" value={note} maxLength={1000} onChange={e=>setNote(e.target.value)}/></label>
          <label className="epm-check-row"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
            Kabel baru sudah aktif</label>
        </fieldset>
      </>}
      {problem && <p className="epm-note" role="alert">{problem}</p>}
      <div className="epm-row">
        <button type="submit" className="epm-primary" disabled={!!busy || (preview&&!confirmed)}>
          {busy?'Memproses…':preview?'Simpan aktivitas dan pilihan arsip':'Pratinjau ruas dan kandidat'}
        </button>
      </div>
    </form>
  </dialog>;
}
