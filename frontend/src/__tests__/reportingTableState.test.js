import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { rankAndSortAreas, toAreaMobileMetric } from '../features/reporting/reportingTableState.js';


describe('Reporting area analysis state', () => {
  const rows = [
    { kabupaten: 'A', revenue: 300, payload: 10, avg_availability: 99.7, total_sites: 2, sla_status: 'met' },
    { kabupaten: 'B', revenue: 100, payload: 30, avg_availability: null, total_sites: 1, sla_status: 'unavailable' },
    { kabupaten: 'C', revenue: 200, payload: 20, avg_availability: 98, total_sites: 3, sla_status: 'missed' },
  ];

  it('applies top and bottom ranking without mutating API rows', () => {
    const top = rankAndSortAreas(rows, { metric: 'revenue', rank: 'top', limit: 2 });
    const bottom = rankAndSortAreas(rows, { metric: 'payload', rank: 'bottom', limit: 2 });

    assert.deepEqual(top.map((row) => row.kabupaten), ['A', 'C']);
    assert.deepEqual(bottom.map((row) => row.kabupaten), ['A', 'C']);
    assert.deepEqual(rows.map((row) => row.kabupaten), ['A', 'B', 'C']);
  });

  it('keeps unavailable values last and prioritizes mobile metrics', () => {
    const sorted = rankAndSortAreas(rows, { metric: 'availability', rank: 'bottom', limit: 3 });
    const mobile = toAreaMobileMetric(sorted[0]);

    assert.deepEqual(sorted.map((row) => row.kabupaten), ['C', 'A', 'B']);
    assert.deepEqual(Object.keys(mobile), ['identity', 'revenue', 'payload', 'availability', 'sites']);
    assert.equal(mobile.availability.sla, 'missed');
  });

  it('sorts Kabupaten identity in both directions', () => {
    assert.deepEqual(
      rankAndSortAreas(rows, { metric: 'kabupaten', direction: 'asc' }).map((row) => row.kabupaten),
      ['A', 'B', 'C'],
    );
    assert.deepEqual(
      rankAndSortAreas(rows, { metric: 'kabupaten', direction: 'desc' }).map((row) => row.kabupaten),
      ['C', 'B', 'A'],
    );
  });
});
