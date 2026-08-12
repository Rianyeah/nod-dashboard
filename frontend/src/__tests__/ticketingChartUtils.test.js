import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStackedLocationData,
  getTicketTrendTitle,
} from '../features/ticketing/ticketingChartUtils.js';

describe('Ticketing chart utilities', () => {
  it('maps backend trend granularity to business titles with a daily fallback', () => {
    assert.equal(getTicketTrendTitle('day'), 'Daily Trend Ticket by Kategori');
    assert.equal(getTicketTrendTitle('week'), 'Weekly Trend Ticket by Kategori');
    assert.equal(getTicketTrendTitle('month'), 'Monthly Trend Ticket by Kategori');
    assert.equal(getTicketTrendTitle('unexpected'), 'Daily Trend Ticket by Kategori');
  });

  it('pivots all values for the active location metric into deterministic stacked rows', () => {
    const rows = [
      { label: 'Beta', metric: 'takeover', value: 'TAKE OVER', tickets: 5 },
      { label: 'Beta', metric: 'takeover', value: 'NOT TAKEN', tickets: 1 },
      { label: 'Alpha', metric: 'takeover', value: 'TAKE OVER', tickets: 2 },
      { label: 'Alpha', metric: 'takeover', value: 'NOT TAKEN', tickets: 8 },
      { label: 'Zulu', metric: 'visitation', value: 'Visit site', tickets: 99 },
    ];

    const result = buildStackedLocationData(rows, 'takeover', 2);

    assert.deepEqual(result.series.map((series) => series.label), ['TAKE OVER', 'NOT TAKEN']);
    assert.deepEqual(result.rows, [
      { label: 'Alpha', total: 10, location_series_0: 2, location_series_1: 8 },
      { label: 'Beta', total: 6, location_series_0: 5, location_series_1: 1 },
    ]);
    assert.equal(rows[0].label, 'Beta');
  });

  it('normalizes invalid tickets, keeps unknown categories, and limits after total sorting', () => {
    const rows = [
      { label: 'Zulu', metric: 'takeover', value: 'Unknown', tickets: '2' },
      { label: 'Alpha', metric: 'takeover', value: 'TAKE OVER', tickets: 'invalid' },
      { label: 'Beta', metric: 'takeover', value: 'TAKE OVER', tickets: 1 },
    ];

    const result = buildStackedLocationData(rows, 'takeover', 2);

    assert.deepEqual(result.series.map((series) => series.label), ['TAKE OVER', 'Unknown']);
    assert.deepEqual(result.rows.map((row) => [row.label, row.total]), [['Zulu', 2], ['Beta', 1]]);
  });
});
