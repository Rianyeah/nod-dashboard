import api from '../../services/api';

export const evidenceAccept='image/jpeg,image/png,image/webp';

export function evidenceFileError(file) {
  if (file.size>10*1024*1024) return 'Ukuran melebihi 10 MiB.';
  if (file.type && !evidenceAccept.split(',').includes(file.type)) return 'Gunakan JPEG, PNG, atau WebP.';
  return '';
}

export function uploadEvidence(pointId,{id,file,caption},incidentId,onUploadProgress) {
  return api.post('/epm/points/'+pointId+'/photos',file,{
    params:{upload_id:id,incident_id:incidentId || undefined,caption},
    headers:{'Content-Type':file.type || 'application/octet-stream'},timeout:120000,onUploadProgress,
  });
}
