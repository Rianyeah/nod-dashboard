import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pointCoordinate,routePayload} from '../features/epm/routeEditing.js';
import {searchLocations} from '../features/epm/locationSearch.js';

test('operational coordinates accept comma decimals and reject partial or out-of-range values',()=>{
  assert.equal(pointCoordinate(' -7,605254 ',85),-7.605254);
  assert.equal(pointCoordinate('112.824882',180),112.824882);
  assert.equal(pointCoordinate(0,180),0);
  assert.equal(pointCoordinate(0.0000001,180),0.0000001);
  for(const input of ['', '-', '112/824882', '180.001']) assert.equal(pointCoordinate(input,180),null);
});

test('route preview and save send the operational correction without altering the line',()=>{
  const geometry={type:'LineString',coordinates:[[112.823,-7.604],[112.825,-7.606]]};
  const payload=routePayload({geometry,anchors:[],points:[{id:'point',lat:'-7,605254',lng:'112,824882'}]});
  assert.equal(payload.points[0].lat,-7.605254);
  assert.equal(payload.points[0].lng,112.824882);
  assert.equal(payload.points[0].id,'point');
  assert.deepEqual(payload.geometry,geometry);
});

test('coordinate search is local, preserves lat/lng order in the query, and rejects invalid ranges',async()=>{
  const noNetwork=()=>{throw Error('Coordinate search must be local');};
  const [result]=await searchLocations('-7.605254, 112.824882','',null,noNetwork);
  assert.deepEqual(result.coordinates,[112.824882,-7.605254]);
  await assert.rejects(searchLocations('-95,112','',null,noNetwork),/rentang/);
});

test('name search requests temporary Mapbox geocoding and displays only valid point features',async()=>{
  const signal=new AbortController().signal;
  const results=await searchLocations('Jalan Raya Gerbo','pk.test',signal,async (input,options)=>{
    const url=new URL(input);
    assert.equal(url.pathname,'/search/geocode/v6/forward');
    assert.equal(url.searchParams.get('q'),'Jalan Raya Gerbo');
    assert.equal(url.searchParams.get('autocomplete'),'false');
    assert.equal(options.cache,'no-store');
    assert.equal(options.signal,signal);
    return {ok:true,json:async()=>({features:[
      {properties:{full_address:'Jalan Raya Gerbo, Pasuruan'},geometry:{type:'Point',coordinates:[112.781,-7.841]}},
      {properties:{name:'Tidak valid'},geometry:{type:'Point',coordinates:[0,210]}},
    ]})};
  });
  assert.deepEqual(results,[{label:'Jalan Raya Gerbo, Pasuruan',coordinates:[112.781,-7.841]}]);
});
