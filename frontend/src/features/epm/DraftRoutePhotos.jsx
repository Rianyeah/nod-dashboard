import {useRef,useState} from 'react';
import {Camera} from 'lucide-react';
import {evidenceAccept,evidenceFileError} from './evidenceUpload';

export default function DraftRoutePhotos({points,items,onChange,disabled,saved}) {
  const [target,setTarget]=useState('');
  const input=useRef(null);
  const targets=points.filter(point=>point.label.trim());
  const pointId=targets.some(point=>point.id===target) ? target : targets[0]?.id || '';
  const change=(id,patch)=>onChange(list=>list.map(item=>item.id===id ? {...item,...patch} : item));

  function pick(event) {
    const added=Array.from(event.target.files,file=>({
      id:crypto.randomUUID(),pointId,file,caption:'',validation:evidenceFileError(file),
    }));
    onChange(list=>[...list,...added]);
    event.target.value='';
  }

  return <section className="epm-stack epm-panel" aria-label="Foto bukti">
    <h3>Foto bukti</h3>
    {!saved && <>
      <p className="epm-muted">{pointId ? 'Foto akan diunggah saat kamu menyimpan jalur.' :
        'Tambahkan titik jalur dan isi labelnya untuk memilih foto.'}</p>
      <div className="epm-row">
        {!!pointId && <label>Titik tujuan foto<select value={pointId} disabled={disabled} onChange={e=>setTarget(e.target.value)}>
          {targets.map(point=><option key={point.id} value={point.id}>{point.label}</option>)}
        </select></label>}
        <button type="button" disabled={disabled || !pointId} onClick={()=>input.current.click()}>
          <Camera size={15}/> Pilih foto
        </button>
        <input type="file" aria-label="Pilih file foto bukti" ref={input} hidden disabled={disabled}
          multiple accept={evidenceAccept} onChange={pick}/>
      </div>
    </>}
    {!!items.length && <ul className="epm-draft-photos">
      {items.map(item=>{
        const validTarget=targets.some(point=>point.id===item.pointId);
        return <li key={item.id} className="epm-stack">
          <strong>{item.file.name}</strong>
          {saved ? <span>{targets.find(point=>point.id===item.pointId)?.label}</span> : <div className="epm-form">
            <label>Simpan ke titik<select disabled={disabled} value={validTarget ? item.pointId : ''}
              onChange={e=>change(item.id,{pointId:e.target.value})}>
              {!validTarget && <option value="" disabled>Pilih titik jalur</option>}
              {targets.map(point=><option key={point.id} value={point.id}>{point.label}</option>)}
            </select></label>
            <label>Keterangan foto<input disabled={disabled} maxLength={500} value={item.caption}
              onChange={e=>change(item.id,{caption:e.target.value})}/></label>
          </div>}
          {(item.error || item.validation || (!validTarget && !saved)) && <p role="alert">
            {item.error || item.validation || 'Titik tujuan berubah. Pilih titik lain atau hapus foto dari draf.'}
          </p>}
          {!saved && <div><button type="button" disabled={disabled}
            onClick={()=>onChange(list=>list.filter(photo=>photo.id!==item.id))}>Hapus dari draf</button></div>}
        </li>;
      })}
    </ul>}
  </section>;
}
