import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatLocalDate,
  getSevenDayWindow,
  parseLocalDate,
} from '../features/impact-service/impactServiceDateRange.js';

describe('Impact Service date range helpers', () => {
  it('round-trips a local YYYY-MM-DD date without UTC drift', () => {
    const date = parseLocalDate('2026-06-12');

    assert.equal(date.getFullYear(), 2026);
    assert.equal(date.getMonth(), 5);
    assert.equal(date.getDate(), 12);
    assert.equal(formatLocalDate(date), '2026-06-12');
  });

  it('returns the seven-day window ending on the selected date', () => {
    assert.deepEqual(getSevenDayWindow('2026-06-12'), {
      start_date: '2026-06-06',
      end_date: '2026-06-12',
    });
  });

  it('crosses month and year boundaries using calendar days', () => {
    assert.deepEqual(getSevenDayWindow('2026-03-03'), {
      start_date: '2026-02-25',
      end_date: '2026-03-03',
    });
    assert.deepEqual(getSevenDayWindow('2026-01-03'), {
      start_date: '2025-12-28',
      end_date: '2026-01-03',
    });
  });

  it('returns null values when the selected end date is incomplete', () => {
    assert.deepEqual(getSevenDayWindow(''), {
      start_date: null,
      end_date: null,
    });
  });
});
