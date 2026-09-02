import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { enrichRevenueBandTrend } from '../features/reporting/reportingTrendState.js';


describe('Reporting U30 and U60 trend state', () => {
  it('computes at-risk totals and deltas from the preceding displayed month', () => {
    const rows = enrichRevenueBandTrend([
      { trx_month: '2026-06', u30_sites: 2, u60_sites: 3 },
      { trx_month: '2026-07', u30_sites: 4, u60_sites: 2 },
    ]);

    assert.deepEqual(
      rows.map((row) => [row.at_risk_sites, row.at_risk_delta]),
      [[5, null], [6, 1]],
    );
  });

  it('keeps a threshold-missing month unavailable instead of zero', () => {
    const [row] = enrichRevenueBandTrend([
      { trx_month: '2026-07', u30_sites: null, u60_sites: null },
    ]);

    assert.equal(row.at_risk_sites, null);
    assert.equal(row.at_risk_delta, null);
  });

  it('does not mutate the API rows', () => {
    const input = [{ trx_month: '2026-07', u30_sites: 1, u60_sites: 2 }];
    const [row] = enrichRevenueBandTrend(input);

    assert.notEqual(row, input[0]);
    assert.equal('at_risk_sites' in input[0], false);
  });
});
