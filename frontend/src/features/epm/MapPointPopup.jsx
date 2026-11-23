import {X} from 'lucide-react';
import EvidenceGallery from './EvidenceGallery';
import {POINT_TYPES} from './routeEditing';
import {isSitePoint,sitePointLabel} from './siteMaster';

export default function MapPointPopup({point,events,lookup,onClose}) {
  const sitePoint=isSitePoint(point);
  const site=point.site_master;
  if (!sitePoint && !point.photo_count) return null;
  const title=sitePointLabel(point);
  const details=site && [
    ['ID Site',site.site_id],['Tipe Site',site.type_site],['Status',site.status_site],
    ['Kelas',site.site_class],['NOP',site.nop],['Kabupaten/Kota',site.kabupaten],
  ].filter(([,value])=>value);

  return <aside className="epm-map-popup epm-stack" aria-label={'Popup '+title}
    onKeyDown={event=>{if(event.key==='Escape' && !event.target.closest('dialog')) onClose();}}>
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
    {point.photo_count > 0 ? <EvidenceGallery pointId={point.id} incidents={events} readOnly/> :
      <p className="epm-muted">Belum ada foto bukti.</p>}
  </aside>;
}
