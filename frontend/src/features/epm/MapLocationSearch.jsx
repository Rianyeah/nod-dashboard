import {useEffect,useRef,useState} from 'react';
import {Search} from 'lucide-react';
import {searchLocations} from './locationSearch';

export default function MapLocationSearch({token,onSelect}) {
  const [query,setQuery]=useState('');
  const [results,setResults]=useState([]);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const request=useRef(null);
  useEffect(()=>()=>request.current?.abort(),[]);

  async function search(event) {
    event.preventDefault();
    request.current?.abort();
    const controller=new AbortController();
    request.current=controller;
    setMessage('');setResults([]);setBusy(true);
    try {
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]);
      const matches=await searchLocations(query,token,signal);
      if (controller.signal.aborted) return;
      setResults(matches);
      if (!matches.length) setMessage('Lokasi tidak ditemukan. Coba nama lain atau masukkan koordinat.');
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error.name==='TimeoutError' || error instanceof TypeError
        ? 'Pencarian gagal terhubung. Coba lagi.' : error.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <div className="epm-location-search">
    <form className="epm-location-form" onSubmit={search}>
      <input type="search" aria-label="Cari lokasi" placeholder="Nama wilayah, jalan, atau lintang, bujur"
        value={query} maxLength={200} onChange={event=>{
          request.current?.abort();setBusy(false);setQuery(event.target.value);setResults([]);setMessage('');
        }}/>
      <button type="submit" disabled={busy || query.trim().length<2}><Search size={15}/>{busy?'Mencari…':'Cari'}</button>
    </form>
    {message && <p role="status" className="epm-muted">{message}</p>}
    {!!results.length && <ul className="epm-location-results" aria-label="Hasil pencarian lokasi">
      {results.map((location,i)=><li key={location.label+i}>
        <button type="button" onClick={()=>{onSelect(location);setQuery(location.label);setResults([]);}}>{location.label}</button>
      </li>)}
    </ul>}
  </div>;
}
