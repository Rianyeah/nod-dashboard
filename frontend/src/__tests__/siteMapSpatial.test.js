import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { nearbySites } from '../features/site-map/siteMapSpatial.js';

describe('site map spatial helpers', () => {
  it('returns only valid neighbors within one kilometre ordered by distance then Site ID', () => {
    const selected = { site_id: 'A', latitude: -7.65, longitude: 112.90 };
    const sites = [
      selected,
      { site_id: 'C', latitude: -7.651, longitude: 112.901 },
      { site_id: 'B', latitude: -7.6505, longitude: 112.9005 },
      { site_id: 'FAR', latitude: -7.70, longitude: 113.00 },
      { site_id: 'INVALID', latitude: null, longitude: 112.90 },
    ];

    assert.deepEqual(nearbySites(selected, sites).map((site) => site.site_id), ['B', 'C']);
  });

  it('uses Site ID as a deterministic tie breaker and respects the result limit', () => {
    const selected = { site_id: 'CENTER', latitude: 0, longitude: 0 };
    const sites = [
      selected,
      { site_id: 'Z', latitude: 0, longitude: 0.001 },
      { site_id: 'A', latitude: 0, longitude: -0.001 },
      { site_id: 'C', latitude: 0.002, longitude: 0 },
    ];

    assert.deepEqual(
      nearbySites(selected, sites, 1, 2).map((site) => site.site_id),
      ['A', 'Z'],
    );
  });

  it('returns an empty result when the selected site has no valid coordinates', () => {
    assert.deepEqual(nearbySites({ site_id: 'A', latitude: '#N/A' }, []), []);
  });
});
