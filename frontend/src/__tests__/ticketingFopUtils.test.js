import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as fopUtils from '../features/ticketing/ticketingFopUtils.js';

const {
  getFopMonthCount,
  getTakeoverThreshold,
  sortFopRows,
} = fopUtils;

describe('Ticketing FOP utilities', () => {
  it('uses active period months and calculates 26 tickets per month', () => {
    assert.equal(getFopMonthCount({ active_months: ['2026-07'] }), 1);
    assert.equal(getFopMonthCount({ active_months: ['2026-06', '2026-07'] }), 2);
    assert.equal(getTakeoverThreshold(1), 26);
    assert.equal(getTakeoverThreshold(2), 52);
    assert.equal(getTakeoverThreshold(3), 78);
  });

  it('counts inclusive calendar months for custom dates and safely falls back to one', () => {
    assert.equal(getFopMonthCount(null, '2026-06-15', '2026-08-02'), 3);
    assert.equal(getFopMonthCount(null, '2026-07-01', '2026-07-31'), 1);
    assert.equal(getFopMonthCount(null, 'invalid', ''), 1);
  });

  it('marks takeover totals green only when they exceed 26 tickets per active month', () => {
    assert.equal(typeof fopUtils.exceedsTakeoverMonthlyTarget, 'function');
    assert.equal(fopUtils.exceedsTakeoverMonthlyTarget(26, 1), false);
    assert.equal(fopUtils.exceedsTakeoverMonthlyTarget(27, 1), true);
    assert.equal(fopUtils.exceedsTakeoverMonthlyTarget(52, 2), false);
    assert.equal(fopUtils.exceedsTakeoverMonthlyTarget(53, 2), true);
  });

  it('formats average daily takeover with two Indonesian decimal digits', () => {
    assert.equal(typeof fopUtils.formatTakeoverDaily, 'function');
    assert.equal(fopUtils.formatTakeoverDaily(2), '2,00');
    assert.equal(fopUtils.formatTakeoverDaily(0.03), '0,03');
    assert.equal(fopUtils.formatTakeoverDaily(null), '-');
  });

  it('sorts a copy by numeric fields with nulls last and deterministic ties', () => {
    const rows = [
      { rank: 2, pic: 'Zulu', performance_score: 60, average_response_minutes: null },
      { rank: 1, pic: 'Alpha', performance_score: 60, average_response_minutes: 10 },
      { rank: 3, pic: 'Beta', performance_score: 40, average_response_minutes: 5 },
    ];

    assert.deepEqual(sortFopRows(rows, 'performance_score', 'desc').map((row) => row.pic), ['Alpha', 'Zulu', 'Beta']);
    assert.deepEqual(sortFopRows(rows, 'average_response_minutes', 'asc').map((row) => row.pic), ['Beta', 'Alpha', 'Zulu']);
    assert.deepEqual(rows.map((row) => row.pic), ['Zulu', 'Alpha', 'Beta']);
  });

  it('sorts PIC alphabetically in either direction', () => {
    const rows = [{ pic: 'Zulu' }, { pic: 'Alpha' }, { pic: 'Beta' }];
    assert.deepEqual(sortFopRows(rows, 'pic', 'asc').map((row) => row.pic), ['Alpha', 'Beta', 'Zulu']);
    assert.deepEqual(sortFopRows(rows, 'pic', 'desc').map((row) => row.pic), ['Zulu', 'Beta', 'Alpha']);
  });
});
