import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import {evidenceAccept as accept,evidenceFileError,uploadEvidence} from './evidenceUpload';
import './EvidenceGallery.css';

const dateFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short',
});
const dayFormat = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'long' });
const imageUrl = (id, size) => `/api/v1/epm/photos/${id}/${size}`;
const problem = (err, fallback) => typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : fallback;
const incidentLabel = (incident) => incident.ticket || (incident.started_at
  ? `Kejadian ${dateFormat.format(new Date(incident.started_at))} WIB` : 'Kejadian terdahulu');

function PhotoViewer({ photo, previous, next, close, refresh, position, readOnly }) {
  const dialog = useRef(null);
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(photo.caption);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  async function save(archive) {
    setBusy(true);
    setError('');
    try {
      if (archive) await api.delete(`/epm/photos/${photo.id}`);
      else await api.patch(`/epm/photos/${photo.id}`, { caption });
      await refresh();
      if (archive) close();
      else setEditing(false);
    } catch (err) {
      setError(problem(err, 'Perubahan gagal disimpan. Coba lagi.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} aria-label="Foto evidence" className="epm-photo-view" onCancel={close}
      onKeyDown={(event) => {
        if (!editing && !confirmArchive && !busy) {
          if (event.key === 'ArrowRight' && next) next();
          if (event.key === 'ArrowLeft' && previous) previous();
        }
      }}>
      <div className="epm-photo-head">
        <strong>Foto evidence · {position}</strong>
        <button type="button" onClick={close} aria-label="Tutup foto">Tutup</button>
      </div>
      <div className="epm-photo-frame">
        {unavailable ? <div role="alert">Foto belum dapat dimuat. <button type="button" onClick={() => {
          setUnavailable(false); setAttempt(attempt + 1);
        }}>Coba lagi</button></div> :
          <img src={imageUrl(photo.id, 'preview') + `?v=${attempt}`}
            alt={photo.caption || 'Foto evidence titik putus'} onError={() => setUnavailable(true)} />}
      </div>
      <p>{photo.caption || 'Tanpa keterangan'}<br />
        <small>Diunggah {dateFormat.format(new Date(photo.created_at))} WIB</small></p>
      {editing ? <form onSubmit={(event) => { event.preventDefault(); save(false); }}>
        <label>Keterangan foto<input value={caption} maxLength={500} onChange={e => setCaption(e.target.value)} /></label>
        <button type="submit" disabled={busy}>Simpan</button>
        <button type="button" disabled={busy} onClick={() => setEditing(false)}>Batal</button>
      </form> : confirmArchive ? <div>
        <p>Arsipkan foto ini dari galeri?</p>
        <button type="button" disabled={busy} onClick={() => save(true)}>Ya, arsipkan</button>
        <button type="button" disabled={busy} onClick={() => setConfirmArchive(false)}>Batal</button>
      </div> : <div className="epm-photo-actions">
        <button type="button" onClick={previous} disabled={!previous}>Sebelumnya</button>
        <button type="button" onClick={next} disabled={!next}>Berikutnya</button>
        <a href={imageUrl(photo.id, 'original')} download={`evidence-${photo.id}.${photo.media_type.split('/')[1]}`}>Unduh asli</a>
        {!readOnly && <>
          <button type="button" onClick={() => setEditing(true)}>Ubah keterangan</button>
          <button type="button" onClick={() => setConfirmArchive(true)}>Arsipkan</button>
        </>}
      </div>}
      {error && <p role="alert">{error}</p>}
    </dialog>
  );
}

function Gallery({ pointId, incidents = [], incidentId = null, onChange, readOnly = false }) {
  const [photos, setPhotos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [uploadTarget, setUploadTarget] = useState(incidentId || '');
  const [queue, setQueue] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const galleryPicker = useRef(null);
  const cameraPicker = useRef(null);
  const locked = useRef(false);
  const objectUrls = useRef(new Set());
  const generation = useRef(0);
  const pointIncidents = incidents.filter(i => i.point_id === pointId);
  const active = photos.findIndex(p => p.id === selected);
  const hasPending = queue.some(item => ['ready', 'failed'].includes(item.state));
  const submitting = queue.some(item => item.state === 'uploading');

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    try {
      const { data } = await api.get(`/epm/points/${pointId}/photos`, { params: { incident_id: incidentId || undefined } });
      if (ticket === generation.current) { setPhotos(data); setError(''); }
    } catch (err) {
      if (ticket === generation.current) setError(problem(err, 'Galeri belum dapat dimuat.'));
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }, [pointId, incidentId]);

  useEffect(() => {
    const release = objectUrls.current;
    const refresh = () => { if (!document.hidden) void load(); };
    const initial = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      generation.current += 1;
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      release.forEach(url => URL.revokeObjectURL(url));
    };
  }, [load]);

  const changed = async () => { await load(); onChange?.(); };
  const update = (id, patch) => setQueue(list => list.map(item => item.id === id ? { ...item, ...patch } : item));
  function remove(item) {
    URL.revokeObjectURL(item.url);
    objectUrls.current.delete(item.url);
    setQueue(list => list.filter(entry => entry.id !== item.id));
  }
  function pick(event) {
    const items = Array.from(event.target.files || [], file => {
      const errorText = evidenceFileError(file);
      const url = errorText ? '' : URL.createObjectURL(file);
      if (url) objectUrls.current.add(url);
      return { id: crypto.randomUUID(), file, url, caption: '', state: errorText ? 'invalid' : 'ready', error: errorText };
    });
    setQueue(list => [...list, ...items]);
    event.target.value = '';
  }
  async function send(items) {
    if (locked.current) return;
    locked.current = true;
    let saved = false;
    try {
      for (const item of items) {
        const target = item.target === undefined ? uploadTarget : item.target;
        update(item.id, { state: 'uploading', progress: 0, error: '', target });
        try {
          await uploadEvidence(pointId,item,target,e=>update(item.id,{progress:Math.round((e.progress || 0)*100)}));
          remove(item);
          saved = true;
        } catch (err) {
          update(item.id, { state: 'failed', error: problem(err, 'Unggahan gagal. Coba lagi.') });
        }
      }
      if (saved) await changed();
    } finally { locked.current = false; }
  }

  const groups = new Map();
  for (const photo of photos) {
    const key = photo.incident_id || 'location';
    if (!groups.has(key)) groups.set(key, new Map());
    const day = dayFormat.format(new Date(photo.created_at));
    const days = groups.get(key);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(photo);
  }

  return <section className="epm-evidence" aria-label="Galeri foto evidence">
    <div className="epm-photo-head"><h3>Foto evidence <small>({photos.length})</small></h3>
      {!readOnly && <div className="epm-photo-actions">
        <button type="button" onClick={() => galleryPicker.current.click()}>Tambah foto</button>
        <button type="button" className="epm-camera" onClick={() => cameraPicker.current.click()}>Kamera</button>
      </div>}</div>
    {!readOnly && <>
      <input hidden type="file" ref={galleryPicker} accept={accept} multiple onChange={pick} />
      <input hidden type="file" ref={cameraPicker} accept={accept} capture="environment" onChange={pick} />
    </>}
    {!readOnly && !!queue.length && <div className="epm-upload-list">
      {incidentId ? <strong>{incidentLabel(pointIncidents.find(i => i.id === incidentId) || {})}</strong> :
        <label>Simpan foto ke<select value={uploadTarget} disabled={submitting} onChange={e => setUploadTarget(e.target.value)}>
          <option value="">Foto lokasi</option>
          {pointIncidents.filter(i => !i.archived_at).map(i => <option key={i.id} value={i.id}>{incidentLabel(i)}</option>)}
        </select></label>}
      {queue.map(item => <div key={item.id} className="epm-upload-row">
        {item.url && <img src={item.url} alt={`Pratinjau ${item.file.name}`} />}
        <div><small>{item.file.name}</small>
          <input aria-label={`Keterangan ${item.file.name}`} placeholder="Keterangan foto" value={item.caption}
            maxLength={500} disabled={item.state !== 'ready' || submitting} onChange={e => update(item.id, { caption: e.target.value })} />
          {item.state === 'uploading' && <small role="status">{item.progress < 100 ? `Mengunggah ${item.progress}%` : 'Memproses foto…'}</small>}
          {item.error && <small role="alert">{item.error}</small>}
          {item.state === 'failed' && <button type="button" disabled={submitting} onClick={() => send([item])}>Coba lagi</button>}
          <button type="button" disabled={submitting} onClick={() => remove(item)}>Batalkan</button>
        </div></div>)}
      <button type="button" disabled={!hasPending || submitting}
        onClick={() => send(queue.filter(item => ['ready', 'failed'].includes(item.state)))}>Unggah foto</button>
    </div>}
    {error && <p role="alert">{error} <button type="button" onClick={load}>Muat ulang</button></p>}
    {loading ? <small>Memuat foto…</small> : !photos.length && !error && <small>Belum ada foto.</small>}
    {[...groups.entries()].map(([key, days]) => <div key={key} className="epm-photo-group">
      <strong>{key === 'location' ? 'Foto lokasi' : incidentLabel(pointIncidents.find(i => i.id === key) || {})}</strong>
      {[...days.entries()].map(([day, list]) => <div key={day}><small>{day}</small>
        <div className="epm-thumb-grid">{list.map(photo =>
          <button title={photo.caption || 'Lihat foto'} key={photo.id} type="button" onClick={() => setSelected(photo.id)}>
            <img src={imageUrl(photo.id, 'thumbnail')} loading="lazy" alt={photo.caption || `Foto evidence ${day}`} />
          </button>)}</div></div>)}
    </div>)}
    {active >= 0 && <PhotoViewer key={selected} photo={photos[active]} position={`${active + 1} / ${photos.length}`}
      previous={active > 0 ? () => setSelected(photos[active - 1].id) : null}
      next={active + 1 < photos.length ? () => setSelected(photos[active + 1].id) : null}
      close={() => setSelected(null)} refresh={changed} readOnly={readOnly} />}
  </section>;
}

export default function EvidenceGallery(props) {
  return props.pointId ? <Gallery key={`${props.pointId}/${props.incidentId || ''}`} {...props} /> : null;
}
