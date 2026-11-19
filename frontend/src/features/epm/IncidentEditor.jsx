import { useState } from 'react';
import api from '../../services/api';
import { errorText, INCIDENT_STATUSES, wibInput, wibInstant } from './routeEditing';

export default function IncidentEditor({point,routeId,initial,onSaved,onClose}) {
  const [draft,setDraft]=useState(()=>({status:initial?.status==='unknown'?'open':(initial?.status || 'open'),
    ticket:initial?.ticket || '',cause:initial?.cause || '',action:initial?.action || '',
    start:wibInput(initial?.started_at || new Date().toISOString()),end:wibInput(initial?.recovered_at)}));
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  function field(key,value) {setDraft(prev=>({...prev,[key]:value}));}
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const {status,ticket,cause,action}=draft;
      const payload={point_id:point.id,route_id:routeId,status,ticket,cause,action,
        started_at:wibInstant(draft.start),recovered_at:status==='resolved'?wibInstant(draft.end):null};
      if(initial?.id) await api.patch(`/epm/incidents/${initial.id}`,{...payload,expected_revision:initial.revision});
      else await api.post('/epm/incidents',payload);
      onSaved();
    } catch(err){setError(errorText(err));} finally {setBusy(false);}
  }
  return <form className="epm-panel epm-stack" onSubmit={submit}>
    <h3>{initial?'Edit kejadian':'Catat gangguan'} · {point.label}</h3>
    <fieldset disabled={busy} className="epm-form"><legend className="sr-only">Detail kejadian</legend>
      <label>Status<select value={draft.status} onChange={e=>field('status',e.target.value)}>
        {Object.entries(INCIDENT_STATUSES).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
      <label>Nomor tiket<input maxLength={150} value={draft.ticket} onChange={e=>field('ticket',e.target.value)}/></label>
      <label>Waktu kejadian (WIB)<input required type="datetime-local" value={draft.start} onChange={e=>field('start',e.target.value)}/></label>
      {draft.status==='resolved' && <label>Waktu pulih (WIB)<input required type="datetime-local" min={draft.start} value={draft.end} onChange={e=>field('end',e.target.value)}/></label>}
      {[['cause','Penyebab',1000],['action','Tindakan',2000]].map(([k,label,limit])=><label key={k}>{label}<textarea rows="2" maxLength={limit} value={draft[k]} onChange={e=>field(k,e.target.value)}/></label>)}
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <div className="epm-row"><button type="submit" className="epm-primary" disabled={busy}>{busy?'Menyimpan…':'Simpan kejadian'}</button><button type="button" disabled={busy} onClick={onClose}>Batal</button></div>
  </form>;
}
