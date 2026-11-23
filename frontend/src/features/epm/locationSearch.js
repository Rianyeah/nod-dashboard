import {pointCoordinate} from './routeEditing.js';

export async function searchLocations(input, token, signal, fetchImpl=fetch) {
  const query=input.trim();
  const position=/^([+-]?(?:\d+\.?\d*|\.\d+))\s*[,;]\s*([+-]?(?:\d+\.?\d*|\.\d+))$/.exec(query);
  if (position) {
    const lat=pointCoordinate(position[1],85), lng=pointCoordinate(position[2],180);
    if (lat===null || lng===null) throw Error('Lintang atau bujur di luar rentang peta.');
    return [{label:lat+', '+lng,coordinates:[lng,lat]}];
  }
  if (query.length<2) throw Error('Masukkan minimal dua karakter.');
  if (!token?.startsWith('pk.')) throw Error('Pencarian nama lokasi memerlukan token peta.');
  const params=new URLSearchParams({q:query.replaceAll(';',' '),access_token:token,language:'id',
    country:'ID',autocomplete:'false',limit:'5'});
  const response=await fetchImpl('https://api.mapbox.com/search/geocode/v6/forward?'+params,{signal,cache:'no-store'});
  if (!response.ok) throw Error('Pencarian lokasi gagal ('+response.status+'). Coba lagi atau masukkan koordinat.');
  const {features}=await response.json();
  return (features || []).flatMap(({geometry,properties})=>{
    const [lng,lat]=geometry?.coordinates || [];
    const label=properties?.full_address || [properties?.name,properties?.place_formatted].filter(Boolean).join(', ');
    return label && geometry?.type==='Point' && Number.isFinite(lng) && Number.isFinite(lat)
      && pointCoordinate(lng,180)!==null && pointCoordinate(lat,85)!==null ? [{label,coordinates:[lng,lat]}] : [];
  });
}
