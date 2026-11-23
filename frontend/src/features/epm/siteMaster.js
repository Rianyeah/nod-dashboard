export function siteMasterCode(value) {
  return /^(?:site\s+)?(?:[a-z]_)?([a-z]{2,6}\d{1,7})(?=(?:m\d+)?(?:$|[\s_-]))/i
    .exec(String(value ?? '').trim())?.[1].toUpperCase() || '';
}

export function isSitePoint(point) {
  return point.type==='site' || point.type==='remote_sector';
}

export function pointMasterCode(route,point) {
  if(!isSitePoint(point)) return '';
  const endpointId=point.id===route.points[0]?.id ? route.start_site
    : point.id===route.points.at(-1)?.id ? route.end_site : '';
  return siteMasterCode(endpointId) || siteMasterCode(point.label);
}

export function sitePointLabel(point,site=point.site_master) {
  return site?.site_name?.trim() || point.label;
}
