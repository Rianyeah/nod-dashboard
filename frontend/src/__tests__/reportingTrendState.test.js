import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { enrichRevenueBandTrend } from '../features/reporting/reportingTrendState.js';


describe('Reporting U30 and U60 trend state', () => {
  it('computes achieved deltas from the preceding displayed month', () => {
    const rows = enrichRevenueBandTrend([
      { trx_month: '2026-06', u30_sites: 2, u60_sites: 3, achieved_sites: 7 },
      { trx_month: '2026-07', u30_sites: 4, u60_sites: 2, achieved_sites: 9 },
    ]);

    assert.deepEqual(
      rows.map((row) => [row.achieved_sites, row.achieved_delta]),
      [[7, null], [9, 2]],
    );
    assert.equal('at_risk_sites' in rows[0], false);
  });

  it('keeps a threshold-missing month unavailable instead of zero', () => {
    const [row] = enrichRevenueBandTrend([
      { trx_month: '2026-07', u30_sites: null, u60_sites: null, achieved_sites: null },
    ]);

    assert.equal(row.achieved_sites, null);
    assert.equal(row.achieved_delta, null);
  });

  it('does not mutate the API rows', () => {
    const input = [{ trx_month: '2026-07', u30_sites: 1, u60_sites: 2, achieved_sites: 3 }];
    const [row] = enrichRevenueBandTrend(input);

    assert.notEqual(row, input[0]);
    assert.equal('achieved_delta' in input[0], false);
  });
});
