import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPivotGrid, sortPivotRows, validatePivotDraft } from '../features/reporting/reportingPivotState.js';


describe('Reporting Pivot state', () => {
  it('validates limits before Apply', () => {
    assert.deepEqual(validatePivotDraft({ rows: [], columns: [], values: [] }), {
      valid: false,
      message: 'Pilih minimal satu baris dan satu nilai.',
    });
    assert.equal(validatePivotDraft({ rows: ['kabupaten'], columns: ['period'], values: [{ field: 'revenue' }] }).valid, true);
  });

  it('shapes flat server aggregates into a compact cross-tab with totals', () => {
    const grid = buildPivotGrid({
      row_dimensions: ['kabupaten'],
      column_dimensions: ['period'],
      value_fields: ['revenue'],
      rows: [
        { dimensions: { kabupaten: 'A', period: '2026-06' }, values: { revenue: 100 } },
        { dimensions: { kabupaten: 'A', period: '2026-07' }, values: { revenue: 150 } },
        { dimensions: { kabupaten: 'B', period: '2026-07' }, values: { revenue: 50 } },
      ],
    });

    assert.deepEqual(grid.columns, ['2026-06 · revenue', '2026-07 · revenue']);
    assert.deepEqual(grid.rows[0], { label: 'A', cells: [100, 150], total: 250 });
    assert.deepEqual(grid.totals, [100, 200]);
    assert.equal(grid.grandTotal, 300);
  });

  it('does not add unlike measures into a misleading row or grand total', () => {
    const grid = buildPivotGrid({
      row_dimensions: ['kabupaten'],
      column_dimensions: [],
      value_fields: ['revenue', 'payload'],
      rows: [
        { dimensions: { kabupaten: 'A' }, values: { revenue: 100, payload: 20 } },
        { dimensions: { kabupaten: 'B' }, values: { revenue: 50, payload: 10 } },
      ],
    });

    assert.deepEqual(grid.totals, [30, 150]);
    assert.equal(grid.rows[0].total, null);
    assert.equal(grid.grandTotal, null);
  });

  it('sorts any pivot result header with null-last and stable labels', () => {
    const grid = {
      columns: ['Revenue'],
      rows: [
        { label: 'A', cells: [20], total: 20 },
        { label: 'C', cells: [null], total: null },
        { label: 'B', cells: [10], total: 10 },
      ],
    };

    assert.deepEqual(sortPivotRows(grid, { key: 'cell', index: 0, direction: 'asc' }).map((row) => row.label), ['B', 'A', 'C']);
    assert.deepEqual(sortPivotRows(grid, { key: 'label', direction: 'desc' }).map((row) => row.label), ['C', 'B', 'A']);
    assert.deepEqual(grid.rows.map((row) => row.label), ['A', 'C', 'B']);
  });
});
