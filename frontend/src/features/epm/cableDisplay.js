export const CABLE_COLOR='#8348df';
export const CABLE_PREVIEW_COLOR='#aa70fc';

export function cableFeatures(route, preview) {
  const features=(route?.cable_replacements || []).map(({geometry})=>({
    type:'Feature', properties:{preview:false}, geometry,
  }));
  if(preview) features.push({type:'Feature',properties:{preview:true},geometry:preview});
  return {type:'FeatureCollection',features};
}
