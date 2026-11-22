import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pointMasterCode,siteMasterCode,sitePointLabel} from '../features/epm/siteMaster.js';
import {blankRoute,prepareReshape} from '../features/epm/routeEditing.js';

test('site master labels resolve old code-only points and pasted master names',()=>{
  assert.equal(siteMasterCode('Site PSN100_Racibangil'),'PSN100');
  assert.equal(siteMasterCode('E_PSN100M41_RaciBangil-PTI'),'PSN100');
  assert.equal(siteMasterCode('EPM163_PSN100_POLPSRudenimidcRemot7'),'EPM163');
  const point={id:'end',type:'remote_sector',label:'Rudenim'};
  const route={end_site:'EPM163',points:[{id:'origin',type:'site'},point]};
  assert.equal(pointMasterCode(route,point),'EPM163');
  assert.equal(pointMasterCode(route,{...point,type:'sambungan'}),'');
  assert.equal(sitePointLabel(point,null),'Rudenim');
  assert.equal(sitePointLabel(point,{site_name:'Nama master'}),'Nama master');
});

test('new EPM destinations default to Remote Sector and reshaping preserves a saved choice',()=>{
  const anchors=[{id:'start',label:'PSN100',lat:-7.6,lng:112.8},{id:'end',label:'EPM163_Rudenim',lat:-7.61,lng:112.81}];
  const geometry={type:'LineString',coordinates:[[112.8,-7.6],[112.81,-7.61]]};
  const route=prepareReshape(blankRoute(),anchors,geometry,'manual');
  assert.equal(route.points[0].type,'site');
  assert.equal(route.points[1].type,'remote_sector');
  route.points[1].type='site';
  assert.equal(prepareReshape(route,anchors,geometry,'manual').points[1].type,'site');
});
