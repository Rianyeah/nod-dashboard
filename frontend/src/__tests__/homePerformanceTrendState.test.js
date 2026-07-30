import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveHomePerformanceTrendState } from '../features/home/homePerformanceTrendState.js';

describe('Home Performance Trend state', () => {
  it('returns error when the reporting overview module failed', () => {
    assert.deepEqual(
      resolveHomePerformanceTrendState({
        rows: [],
        moduleError: 'reporting query failed',
      }),
      { status: 'error', rows: [], message: 'reporting query failed' },
    );
  });

  it('returns empty only for a valid response without rows', () => {
    assert.deepEqual(
      resolveHomePerformanceTrendState({ rows: [], moduleError: '' }),
      { status: 'empty', rows: [], message: '' },
    );
  });

  it('keeps valid rows even when availability is null', () => {
    const rows = [
      {
        trx_month: '2026-06',
        total_revenue: 100,
        total_payload: 50,
        avg_availability: null,
      },
    ];

    assert.deepEqual(
      resolveHomePerformanceTrendState({ rows, moduleError: '' }),
      { status: 'ready', rows, message: '' },
    );
  });
});
