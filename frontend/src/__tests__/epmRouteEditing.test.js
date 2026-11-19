import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateRoad, prepareReshape, routePayload } from '../features/epm/routeEditing.js';

test('routes more than 25 anchors without dropping the link between requests', async () => {
  const anchors = Array.from({ length: 27 }, (_, i) => ({ id: String(i), lng: 112 + i * 0.001, lat: -7 }));
  const batches = [];
  const result = await calculateRoad(anchors, 'pk.test', undefined, async url => {
    const coords = new URL(url).pathname.split('/').at(-1).split(';')
      .map(value => value.split(',').map(Number));
    batches.push(coords);
    const legs = coords.slice(1).map((end, i) => ({
      steps: [{ geometry: { coordinates: [coords[i], end] } }],
    }));
    return { ok: true, json: async () => ({ code: 'Ok', routes: [{ legs }] }) };
  });
  assert.deepEqual(batches.map(batch => batch.length), [25, 3]);
  assert.deepEqual(batches[0].at(-1), batches[1][0]);
  assert.equal(result.geometry.coordinates.length, 27);
  assert.deepEqual(result.anchors.map(anchor => anchor.vertex_index), anchors.map((_, i) => i));
});

test('changing trase keeps the incident location id and preserves the field reference', () => {
  const anchors = [
    { id: 'a', label: 'Awal', lat: -7, lng: 112, vertex_index: 0 },
    { id: 'b', label: 'Akhir', lat: -7, lng: 113, vertex_index: 1 },
  ];
  const route = { id: 'route', revision: 4, name: 'Jalur', verification: 'field', reference_distance: '4,7 km',
    points: [
      { id: 'first', label: 'Awal', type: 'site' },
      { id: 'break', label: 'Titik putus', type: 'tipus', lat: -7, lng: 112.5, from_anchor_id: 'a', to_anchor_id: 'b', station_m: 45 },
      { id: 'last', label: 'Akhir', type: 'site' },
    ] };
  const result = routePayload(prepareReshape(route, anchors, { type: 'LineString', coordinates: [[112, -7], [113, -7]] }, 'manual'));
  assert.equal(result.points[1].id, 'break');
  assert.equal(result.points[1].from_anchor_id, 'a');
  assert.equal(result.points[1].station_m, undefined);
  assert.equal(result.reference_distance, '4,7 km');
  assert.equal(result.expected_revision, 4);
  assert.equal(result.verification, 'pending');
});
