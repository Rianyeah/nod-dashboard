import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildMonthRange,
  formatMonthRangeLabel,
  getSemesterRange,
} from '../components/dashboard-filters/periodRange.js';

describe('month period range helpers', () => {
  it('builds a single month and equal previous period', () => {
    const range = buildMonthRange('2026-06', '2026-06');

    assert.deepEqual(range.activeMonths, ['2026-06']);
    assert.equal(range.comparisonStart, '2026-05');
    assert.equal(range.comparisonEnd, '2026-05');
    assert.equal(range.contextStart, '2025-12');
  });

  it('builds a contiguous cross-year range', () => {
    const range = buildMonthRange('2025-11', '2026-02');

    assert.deepEqual(range.activeMonths, ['2025-11', '2025-12', '2026-01', '2026-02']);
    assert.equal(range.comparisonStart, '2025-07');
    assert.equal(range.comparisonEnd, '2025-10');
  });

  it('rejects reversed and over-twelve-month ranges', () => {
    assert.throws(() => buildMonthRange('2026-07', '2026-06'), /berurutan/i);
    assert.throws(() => buildMonthRange('2025-06', '2026-06'), /12 bulan/i);
  });

  it('creates semester shortcuts for the selected year', () => {
    assert.deepEqual(getSemesterRange(2026, 1), { start: '2026-01', end: '2026-06' });
    assert.deepEqual(getSemesterRange(2026, 2), { start: '2026-07', end: '2026-12' });
  });

  it('formats Indonesian single, semester, and cross-year labels', () => {
    assert.equal(formatMonthRangeLabel('2026-06', '2026-06'), 'Jun 2026');
    assert.equal(formatMonthRangeLabel('2026-01', '2026-06'), 'Semester 1 2026');
    assert.equal(formatMonthRangeLabel('2025-11', '2026-02'), 'Nov 2025-Feb 2026');
  });
});
