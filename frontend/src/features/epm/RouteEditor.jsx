import {useEffect,useRef,useState} from 'react';
import api from '../../services/api';
import RouteMap from './RouteMap';
import {blankRoute,calculateRoad,distanceLabel,errorText,getRouteSection,parseCoordinates,POINT_TYPES,prepareReshape,readLineString,replaceRouteSection,routePayload,toAnchors} from './routeEditing';

function rowsText(anchors) { return anchors.map(a=>[a.label,a.lat,a.lng].join('\t')).join('\n'); }

function intervalValue(p,anchors) {
  const i=anchors.findIndex(a=>a.id===p.from_anchor_id);
  return i>=0 && anchors[i+1]?.id===p.to_anchor_id ? i : '';
}
function IntervalSelect({point,anchors,onChange}) {
  return <label>Bagian trase<select value={intervalValue(point,anchors)} onChange={e=>{
    const i=Number(e.target.value);onChange({from_anchor_id:anchors[i].id,to_anchor_id:anchors[i+1].id,station_m:undefined});
  }}><option value="" disabled>Pilih bagian trase</option>{anchors.slice(0,-1).map((a,i)=><option value={i} key={a.id}>{a.label} → {anchors[i+1].label}</option>)}</select></label>;
}

export default function RouteEditor({initial, initialPointId, initialCorrection, onClose, onSaved}) {
  const [draft,setDraft]=useState(()=>structuredClone(initial || blankRoute()));
  const [text,setText]=useState(()=>rowsText(initial?.anchors || []));
  const [section,setSection]=useState(initialCorrection || !initial ? 'shape' : initialPointId ? 'points' : 'metadata');
  const [target,setTarget]=useState(initialPointId || '');
  const [pendingShape,setPendingShape]=useState(false),[review,setReview]=useState(null);
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(''),[conflict,setConflict]=useState(null);
  const [clickMode,setClickMode]=useState('');
  const [correctionIndex,setCorrectionIndex]=useState(initialCorrection ? Math.max(0, intervalValue(
    initial.points.find(p=>p.id===initialPointId) || {}, initial.anchors,
  )) : null);
  const [bends,setBends]=useState([]);
  const controller=useRef(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const current=draft.points.find(p=>p.id===target);
  const activeSection = section==='shape' && correctionIndex!==null ? getRouteSection(draft,correctionIndex) : null;
  const correction = activeSection && {
    sectionIndex: correctionIndex, original: activeSection.coordinates,
    proposed: bends.length ? [activeSection.coordinates[0], ...bends, activeSection.coordinates.at(-1)] : [],
  };
  function change(data) { setDraft(d=>({...d,...data}));setReview(null);setMessage(''); }
  function changePoint(id,data) { change({points:draft.points.map(p=>p.id===id ? {...p,...data} : p)}); }
  function changeText(v) { setText(v);setPendingShape(true);setReview(null);setMessage(''); }
  async function shape(mode,line=null) {
    if(correctionIndex!==null) return;
    setMessage('');setBusy('shape');
    try {
      let geo, anchors;
      if(line) {
        geo=line;
        const positions = [line.coordinates[0],line.coordinates.at(-1)];
        anchors=toAnchors(positions.map(([lng,lat],i)=>({label:(i===0?draft.start_site:draft.end_site) || (i===0?'Site awal':'Site akhir'),lng,lat})),draft.anchors)
          .map((a,i)=>({...a,vertex_index:i===0 ? 0 : line.coordinates.length-1}));
      } else {
        anchors=toAnchors(parseCoordinates(text),draft.anchors);
        if(mode==='road') {
          controller.current=new AbortController();
          const result=await calculateRoad(anchors,import.meta.env.VITE_MAPBOX_TOKEN,AbortSignal.any([controller.current.signal,AbortSignal.timeout(30000)]));
          geo=result.geometry;anchors=result.anchors;
        } else {
          geo=readLineString({type:'LineString',coordinates:anchors.map(a=>[a.lng,a.lat])});
          anchors=anchors.map((a,i)=>({...a,vertex_index:i}));
        }
      }
      const next=prepareReshape(draft,anchors,geo,mode);
      if (!draft.points.length && anchors.length>2) {
        const extras=anchors.slice(1,-1).map((a,i)=>({id:crypto.randomUUID(),label:a.label,lat:a.lat,lng:a.lng,
          type:/^tipus|titik putus/i.test(a.label)?'tipus':/^sambungan/i.test(a.label)?'sambungan':'lainnya',
          from_anchor_id:anchors[i].id,to_anchor_id:a.id,note:''}));
        next.points.splice(1,0,...extras);
      }
      setDraft(next);setText(rowsText(anchors));setPendingShape(false);setReview(null);setClickMode('');
      setMessage('Trase diperbarui dalam draf. Periksa titik dan pratinjau sebelum menyimpan.');
    } catch(e){setMessage(errorText(e));} finally {setBusy('');}
  }
  function addPoint() {
    const a=draft.anchors;
    if (a.length<2) return;
    const p={id:crypto.randomUUID(),label:'',lat:'',lng:'',type:'tipus',note:'',from_anchor_id:a[0].id,to_anchor_id:a[1].id};
    change({points:[...draft.points.slice(0,-1),p,draft.points.at(-1)]});
    setTarget(p.id);
  }
  function pick({lng,lat}) {
    if(activeSection) {
      setBends(points=>[...points,[+lng.toFixed(7),+lat.toFixed(7)]]);
      setMessage('');
      return;
    }
    if(clickMode==='shape') { const nextIndex=text.trim()?text.trim().split(/\n/).length+1:1;changeText([text.trim(),`Titik ${nextIndex}\t${lat.toFixed(7)}\t${lng.toFixed(7)}`].filter(Boolean).join('\n')); }
    if(clickMode==='point' && current){changePoint(target,{lat:+lat.toFixed(7),lng:+lng.toFixed(7),station_m:undefined});setClickMode('');}
  }
  function cancelCorrection() {
    setBends([]);
    setCorrectionIndex(null);
  }
  function applyCorrection() {
    try {
      const next=replaceRouteSection(draft,correctionIndex,bends);
      change(next);
      cancelCorrection();
      setMessage('Ruas diperbarui dalam draf. Pratinjau jarak dan urutan titik, lalu simpan jalur.');
    } catch(e) {setMessage(errorText(e));}
  }
  async function submit(save) {
    if(correctionIndex!==null) {
      setSection('shape');setMessage('Terapkan atau batalkan koreksi ruas sebelum menyimpan.');
      return;
    }
    if(pendingShape) {setMessage('Terapkan koordinat penentu trase sebelum pratinjau.');return;}
    if(draft.points.some(p=>!p.label.trim() || p.lat==='' || p.lng==='')) {setMessage('Lengkapi label dan koordinat setiap titik.');return;}
    setMessage('');setBusy(save?'save':'preview');
    try {
      const payload=routePayload(draft);
      if(save) {
        const {data}=draft.id ? await api.put(`/epm/routes/${draft.id}`,payload) : await api.post('/epm/routes',payload);
        onSaved(data.id);
      } else {
        const {data}=await api.post('/epm/routes/preview',payload);
        setReview(data);setClickMode('');setMessage('Pratinjau siap. Periksa urutan dan jarak setiap titik.');
      }
    } catch(e) {
      setMessage(errorText(e));
      if(e.response?.status===409 && draft.id) {
        try {setConflict((await api.get(`/epm/routes/${draft.id}`)).data);} catch { /* Keep draft. */ }
      }
    } finally {setBusy('');}
  }
  const validMapRoute = review || {...draft,points:draft.points.filter(p=>p.lat!=='' && p.lng!=='')};
  const endpoint=current && (current.id===draft.points[0]?.id || current.id===draft.points.at(-1)?.id);
  return <section className="epm-editor epm-panel" aria-label="Editor jalur">
    <header className="epm-heading"><h2>{initial?'Edit jalur':'Jalur baru'}</h2><button type="button" disabled={!!busy} onClick={()=>{if(window.confirm('Tutup editor dan buang draf ini?'))onClose();}}>Tutup editor</button></header>
    <div className="epm-row">{[['metadata','Info jalur'],['shape','Lintasan kabel (trase)'],['points','Titik operasional']].map(([id,label])=><button key={id} aria-pressed={section===id} onClick={()=>{setSection(id);setClickMode('');}}>{label}</button>)}</div>
    <fieldset disabled={!!busy}><legend className="sr-only">Data jalur</legend>
    {section==='metadata' && <div className="epm-form">
      {[['name','Nama jalur'],['start_site','Site awal'],['end_site','Site akhir'],['area','Area'],['pic','Tim / PIC'],['asset_ref','Referensi aset / as-built'],['reference_distance','Acuan jarak lapangan']].map(([k,l])=><label key={k}>{l}<input value={draft[k] || ''} onChange={e=>change({[k]:e.target.value})}/></label>)}
      <label>Verifikasi trase<select value={draft.verification} onChange={e=>change({verification:e.target.value})}><option value="pending">Belum diverifikasi</option><option value="field">Terverifikasi lapangan</option></select></label>
    </div>}
    {section==='shape' && <div className="epm-stack">
      <p className="epm-note">Trase adalah garis yang menunjukkan lintasan kabel FO di peta. Panjang jalur dan jarak dari site awal dihitung mengikuti garis ini. Site, sambungan, dan titik putus dikelola di tab Titik operasional.</p>
      {draft.anchors.length>=2 && (correctionIndex===null ?
        <div className="epm-row"><button type="button" className="epm-primary" disabled={pendingShape} onClick={()=>{
          setClickMode('');setBends([]);setCorrectionIndex(0);setReview(null);setMessage('');
        }}>Koreksi ruas di peta</button></div> :
        <div className="epm-stack">
          <label>Ruas yang dikoreksi<select value={correctionIndex} onChange={e=>{
            const index = Number(e.target.value);
            setCorrectionIndex(index);setBends([]);setMessage('');
          }}>
            {draft.anchors.slice(0,-1).map((a,i)=><option value={i} key={a.id}>{a.label} → {draft.anchors[i+1].label}</option>)}
          </select></label>
          <p>Ikuti lintasan kabel yang kamu ketahui. Klik setiap belokan secara berurutan dari A menuju B. Ujung ruas tetap terhubung ke jalur lama.</p>
          <div className="epm-row">
            <button type="button" className="epm-primary" disabled={!bends.length || !activeSection} onClick={applyCorrection}>Terapkan koreksi ruas</button>
            <button type="button" disabled={!bends.length} onClick={()=>setBends(points=>points.slice(0,-1))}>Urungkan titik terakhir</button>
            <button type="button" onClick={cancelCorrection}>Batalkan koreksi</button>
            <span className="epm-muted" role="status">{bends.length} titik belok</span>
          </div>
        </div>
      )}
      {correctionIndex===null && <details open={!initial}>
      <summary>Gambar, hitung ulang, atau impor seluruh jalur</summary>
      <div className="epm-stack epm-shape-options"><label>Titik penentu trase <span>Label, lintang, bujur · sesuai urutan kabel</span>
      <textarea rows="5" value={text} onChange={e=>changeText(e.target.value)} placeholder={'Site awal;-7.840;112.770\nBelokan;-7.842;112.772\nSite akhir;-7.845;112.780'}/></label>
      <div className="epm-row"><button type="button" aria-pressed={clickMode==='shape'} onClick={()=>setClickMode(clickMode==='shape'?'':'shape')}>Pilih koordinat di peta</button>
        <button type="button" onClick={()=>shape('road')}>Hitung jalur jalan</button><button type="button" onClick={()=>shape('manual')}>Terapkan trase manual</button>
        <label className="epm-file">Impor GeoJSON<input type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={async e=>{
          const file=e.target.files[0];e.target.value=''; if(!file)return;
          try{if(file.size>16*1024*1024)throw Error('Maksimum 16 MiB.'); await shape('imported',readLineString(JSON.parse(await file.text())));}catch(err){setMessage(errorText(err));}
        }}/></label>{pendingShape && <button type="button" onClick={()=>{
          setText(rowsText(draft.anchors));setPendingShape(false);setClickMode('');setMessage('');
        }}>Batalkan perubahan koordinat</button>}</div></div>
      </details>}
    </div>}
    {section==='points' && <div className="epm-stack">
      <p className="epm-muted">Untuk mengunggah foto, simpan titik dengan jenis Titik putus, lalu buka Foto titik putus di halaman peta.</p>
      <div className="epm-row"><label>Titik operasional<select value={target} onChange={e=>{setTarget(e.target.value);setClickMode('');}}><option value="">Pilih titik</option>{draft.points.map((p,i)=><option key={p.id} value={p.id}>{i+1}. {p.label || 'Titik baru'}</option>)}</select></label>
      <button type="button" disabled={draft.anchors.length<2} onClick={addPoint}>Tambah titik</button></div>
      {current && <div className="epm-form"><label>Label titik<input value={current.label} onChange={e=>changePoint(target,{label:e.target.value})}/></label>
        <label>Jenis<select disabled={endpoint} value={current.type} onChange={e=>changePoint(target,{type:e.target.value})}>{Object.entries(POINT_TYPES).filter(([k])=>endpoint?k==='site':k!=='site').map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
        {['lat','lng'].map((key,i)=><label key={key}>{i?'Bujur':'Lintang'}<input type="number" step="any" disabled={endpoint} value={current[key]} onChange={e=>changePoint(target,{[key]:e.target.value===''?'':Number(e.target.value),station_m:undefined})}/></label>)}
        {!endpoint && <IntervalSelect point={current} anchors={draft.anchors} onChange={data=>changePoint(target,data)}/>}
        <label>Catatan<input value={current.note||''} onChange={e=>changePoint(target,{note:e.target.value})}/></label>
        {!endpoint && <div className="epm-row"><button type="button" aria-pressed={clickMode==='point'} onClick={()=>setClickMode(clickMode==='point'?'':'point')}>Ambil koordinat di peta</button>
          <button type="button" onClick={()=>{if(window.confirm('Arsipkan titik saat jalur disimpan?')){change({points:draft.points.filter(p=>p.id!==target)});setTarget('');setClickMode('');}}}>Arsipkan titik</button></div>}
      </div>}
    </div>}
    </fieldset>
    <RouteMap route={validMapRoute} selected={target} correction={correction}
      onSelect={activeSection ? undefined : id=>{setTarget(id);setSection('points');setClickMode('');}}
      onPick={(activeSection || clickMode) && !busy ? pick : null}
      hint={activeSection?'Jingga: ruas lama · Biru putus-putus: usulan lintasan.':clickMode==='shape'?'Klik peta untuk menambahkan titik belok.':clickMode==='point'?'Klik posisi titik operasional.':''}/>
    {review && <div className="epm-scroll"><table><caption>Pratinjau · {distanceLabel(review.length_m)}</caption><thead><tr><th>Titik</th><th>Jarak dari awal</th><th>Selisih dari trase</th></tr></thead><tbody>
      {review.points.map(p=><tr key={p.id}><td>{p.label}</td><td>{distanceLabel(p.station_m)}</td><td>{Math.round(p.offset_m||0)} m</td></tr>)}</tbody></table></div>}
    {message && <p role="status" className="epm-note">{message}</p>}
    {conflict && <details open><summary>Versi terbaru untuk ditinjau</summary><pre>{JSON.stringify(routePayload(conflict),null,2)}</pre><button type="button" onClick={()=>{
      if(window.confirm('Ganti draf dengan versi terbaru?')){setDraft(structuredClone(conflict));setText(rowsText(conflict.anchors));setReview(null);setConflict(null);setPendingShape(false);setTarget('');setMessage('Versi terbaru dimuat.');}
    }}>Gunakan versi terbaru</button></details>}
    <div className="epm-row"><button type="button" disabled={!!busy||!draft.geometry.coordinates.length} onClick={()=>submit(false)}>{busy==='preview'?'Menghitung…':'Pratinjau jarak & urutan'}</button>
    <button className="epm-primary" type="button" disabled={!!busy||!review} onClick={()=>submit(true)}>{busy==='save'?'Menyimpan…':'Simpan jalur'}</button></div>
  </section>;
}
