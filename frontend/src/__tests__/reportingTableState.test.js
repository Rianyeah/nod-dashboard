import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { rankAndSortAreas, toAreaMobileMetric } from '../features/reporting/reportingTableState.js';


describe('Reporting area analysis state', () => {
  const rows = [
    { kabupaten: 'A', revenue: 300, payload: 10, traffic: 4, avg_availability: 99.7, total_sites: 2, ticket_swfm_bps: 1, ticket_swfm_ts: 1, proker_open: 1, proker_closed: 0 },
    { kabupaten: 'B', revenue: 100, payload: 30, traffic: 7, avg_availability: null, total_sites: 1, ticket_swfm_bps: 4, ticket_swfm_ts: 0, proker_open: 0, proker_closed: 3 },
    { kabupaten: 'C', revenue: 200, revenue_delta_pct: -4.5, payload: 20, payload_delta_pct: 2.5, traffic: 2, avg_availability: 98, availability_delta_pct: -0.03, total_sites: 3, ticket_swfm_bps: 0, ticket_swfm_ts: 1, proker_open: 1, proker_closed: 1 },
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
    assert.deepEqual(mobile.revenue, { value: 200, delta: -4.5 });
    assert.deepEqual(mobile.payload, { value: 20, delta: 2.5 });
    assert.deepEqual(mobile.availability, { value: 98, delta: -0.03 });
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

  it('sorts every derived Kabupaten header deterministically', () => {
    assert.deepEqual(
      rankAndSortAreas(rows, { metric: 'ticket_backup', direction: 'desc' }).map((row) => row.kabupaten),
      ['B', 'A', 'C'],
    );
    assert.deepEqual(
      rankAndSortAreas(rows, { metric: 'proker', direction: 'desc' }).map((row) => row.kabupaten),
      ['B', 'C', 'A'],
    );
    assert.deepEqual(
      rankAndSortAreas(rows, { metric: 'traffic', rank: 'top', limit: 2 }).map((row) => row.kabupaten),
      ['B', 'A'],
    );
  });
});
