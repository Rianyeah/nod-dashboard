import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Link} from 'react-router-dom';
import {ArrowUpRight,X} from 'lucide-react';
import SiteDetailModal from '../../components/SiteDetailModal';
import {fetchSiteDetailBundle} from '../../services/siteDetailBundle';
import EvidenceGallery from './EvidenceGallery';
import {POINT_TYPES} from './routeEditing';
import {isSitePoint,sitePointLabel} from './siteMaster';

const monthLabel=new Intl.DateTimeFormat('id-ID',{month:'short',year:'numeric',timeZone:'UTC'});
const percentLabel=new Intl.NumberFormat('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2});
const revenueLabel=new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0});

function MonthlyMetrics({data,error}) {
  const hasMetrics=data?.some(row=>row.availability!=null || row.revenue!=null);
  let status='';
  if (error) status='Kinerja bulanan gagal dimuat.';
  else if (!data) status='Memuat kinerja bulanan…';
  else if (!hasMetrics) status='Belum ada data kinerja untuk periode ini.';
  return <section className="epm-popup-metrics" aria-label="Kinerja 3 bulan terakhir">
    <h4>Kinerja 3 bulan terakhir</h4>
    {status ? <p className="epm-muted" role="status">{status}</p> :
        <table aria-label="Availability dan revenue bulanan">
          <thead><tr><th scope="col">Bulan</th><th scope="col">Availability</th><th scope="col">Revenue</th></tr></thead>
          <tbody>{data.map(row=><tr key={row.period}>
            <th scope="row">{monthLabel.format(new Date(row.period+'-01T00:00:00Z'))}</th>
            <td>{row.availability==null?'—':percentLabel.format(row.availability)+'%'}</td>
            <td>{row.revenue==null?'—':revenueLabel.format(row.revenue)}</td>
          </tr>)}</tbody>
        </table>}
  </section>;
}

function SiteActions({siteId}) {
  const [attempt,setAttempt]=useState(0);
  const [result,setResult]=useState(null);
  const current=result?.attempt===attempt ? result : null;
  const loading=attempt>0 && !current;
  useEffect(()=>{
    if(!attempt) return;
    const controller=new AbortController();
    fetchSiteDetailBundle(siteId,{signal:controller.signal})
      .then(bundle=>{if(!controller.signal.aborted) setResult({attempt,bundle});})
      .catch(()=>{if(!controller.signal.aborted) setResult({attempt,error:true});});
    return ()=>controller.abort();
  },[siteId,attempt]);
  const bundle=current?.bundle;
  return <>
    <div className="epm-popup-links">
      <button type="button" className="epm-link" disabled={loading} onClick={()=>{
        setResult(null);
        setAttempt(value=>value+1);
      }}>
        {loading?'Memuat detail…':'Detail site'}
      </button>
      <Link className="epm-link" target="_blank" rel="noopener" to={'/data-potensi?site='+encodeURIComponent(siteId)}>
        Data Potensi <ArrowUpRight size={14} aria-hidden="true"/>
      </Link>
    </div>
    {current?.error && <p className="epm-muted" role="alert">Detail site gagal dimuat. Coba lagi.</p>}
    {bundle && createPortal(<SiteDetailModal data={bundle.detail} trendData={bundle.trendData}
      performanceData={bundle.performanceData} onClose={()=>setAttempt(0)}/>,document.body)}
  </>;
}

export default function MapPointPopup({point,events,lookup,metrics,onClose}) {
  const sitePoint=isSitePoint(point);
  const site=point.site_master;
  if (!sitePoint && !point.photo_count) return null;
  const title=sitePointLabel(point);
  const details=site && [
    ['ID Site',site.site_id],['Tipe Site',site.type_site],['Status',site.status_site],
    ['Kelas',site.site_class],['NOP',site.nop],['Kabupaten/Kota',site.kabupaten],
  ].filter(([,value])=>value);

  return <aside className="epm-map-popup epm-stack" aria-label={'Popup '+title}
    onKeyDown={event=>{if(event.key==='Escape' && !event.target.closest('dialog,[role="dialog"]')) onClose();}}>
    <div className="epm-map-popup-header">
      <div>
        {sitePoint && <small>{POINT_TYPES[point.type]}</small>}
        <h3>{title}</h3>
      </div>
      <button type="button" className="epm-icon" aria-label="Tutup popup" onClick={onClose}><X size={16}/></button>
    </div>
    {sitePoint && (site ? <dl className="epm-values epm-master-values">{details.map(([label,value])=><div key={label}>
      <dt>{label}</dt><dd>{value}</dd>
    </div>)}</dl> : <p className="epm-muted" role="status">{
      !point.site_code ? 'Isi ID Site Master di Info jalur.' :
        lookup.error ? 'Data Site Master belum dapat dimuat.' :
          lookup.data ? point.site_code+' belum ditemukan di Site Master.' : 'Memuat data Site Master…'
    }</p>)}
    {sitePoint && point.site_code && <>
      <MonthlyMetrics {...metrics}/>
      <SiteActions key={point.site_code} siteId={point.site_code}/>
    </>}
    {point.id && (point.photo_count > 0 ? <EvidenceGallery pointId={point.id} incidents={events} readOnly/> :
      <p className="epm-muted">Belum ada foto bukti.</p>)}
  </aside>;
}
