import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSectorViewportDescriptor,
  sectorLodForZoom,
} from '../utils/sectorViewport.js';


function mapAt({ west = 112.1, south = -7.9, east = 112.9, north = -7.1, zoom = 10.25 } = {}) {
  return {
    getBounds() {
      return {
        getWest: () => west,
        getSouth: () => south,
        getEast: () => east,
        getNorth: () => north,
      };
    },
    getZoom: () => zoom,
  };
}


describe('sector viewport helpers', () => {
  it('uses the backend-owned zoom boundaries', () => {
    const cases = [
      [0, 'none'],
      [8.99, 'none'],
      [9, 'lite'],
      [11.99, 'lite'],
      [12, 'medium'],
      [13.99, 'medium'],
      [14, 'full'],
      [24, 'full'],
    ];

    for (const [zoom, expected] of cases) {
      assert.equal(sectorLodForZoom(zoom), expected);
    }
  });

  it('rejects invalid zoom values instead of choosing an expensive fallback', () => {
    for (const zoom of [-1, 24.01, Number.NaN, Number.POSITIVE_INFINITY, 'bad', null]) {
      assert.throws(() => sectorLodForZoom(zoom), /zoom/i);
    }
  });

  it('builds a stable bounded request descriptor', () => {
    const descriptor = buildSectorViewportDescriptor(mapAt(), 'SIDOARJO');

    assert.deepEqual(descriptor, {
      bbox: '112.100000,-7.900000,112.900000,-7.100000',
      zoom: 10.25,
      lod: 'lite',
      nop: 'SIDOARJO',
      key: '112.100000,-7.900000,112.900000,-7.100000|10.25|SIDOARJO',
    });
  });

  it('rounds noisy bounds and zoom into the same request identity', () => {
    const first = buildSectorViewportDescriptor(mapAt({
      west: 112.1000001,
      south: -7.9000001,
      east: 112.9000001,
      north: -7.1000001,
      zoom: 10.251,
    }), null);
    const second = buildSectorViewportDescriptor(mapAt({
      west: 112.1000002,
      south: -7.9000002,
      east: 112.9000002,
      north: -7.1000002,
      zoom: 10.252,
    }), '');

    assert.equal(first.key, second.key);
    assert.equal(first.nop, null);
  });

  it('rejects missing, non-finite, reversed, and dateline-crossing bounds', () => {
    assert.throws(() => buildSectorViewportDescriptor(null, null), /map/i);
    assert.throws(() => buildSectorViewportDescriptor(mapAt({ west: Number.NaN }), null), /bounds/i);
    assert.throws(() => buildSectorViewportDescriptor(mapAt({ west: 114, east: 112 }), null), /bounds/i);
  });
});
