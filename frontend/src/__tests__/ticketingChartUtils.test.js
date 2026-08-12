import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getTicketTrendTitle,
  getTopLocationRows,
} from '../features/ticketing/ticketingChartUtils.js';

describe('Ticketing chart utilities', () => {
  it('maps backend trend granularity to business titles with a daily fallback', () => {
    assert.equal(getTicketTrendTitle('day'), 'Daily Trend Ticket by Kategori');
    assert.equal(getTicketTrendTitle('week'), 'Weekly Trend Ticket by Kategori');
    assert.equal(getTicketTrendTitle('month'), 'Monthly Trend Ticket by Kategori');
    assert.equal(getTicketTrendTitle('unexpected'), 'Daily Trend Ticket by Kategori');
  });

  it('sorts a copy by the active metric and keeps deterministic top rows', () => {
    const rows = [
      { label: 'Zulu', takeover_tickets: 2, escalated_tickets: 9 },
      { label: 'Alpha', takeover_tickets: 2, escalated_tickets: 1 },
      { label: 'Beta', takeover_tickets: 5, escalated_tickets: 3 },
    ];

    assert.deepEqual(
      getTopLocationRows(rows, 'takeover_tickets', 2).map((row) => row.label),
      ['Beta', 'Alpha'],
    );
    assert.deepEqual(rows.map((row) => row.label), ['Zulu', 'Alpha', 'Beta']);
    assert.deepEqual(
      getTopLocationRows(rows, 'escalated_tickets', 2).map((row) => row.label),
      ['Zulu', 'Beta'],
    );
  });

  it('treats missing or nonnumeric metric values as zero', () => {
    const rows = [
      { label: 'Missing' },
      { label: 'Text', takeover_tickets: 'not-a-number' },
      { label: 'Valid', takeover_tickets: 1 },
    ];

    assert.deepEqual(
      getTopLocationRows(rows, 'takeover_tickets').map((row) => row.label),
      ['Valid', 'Missing', 'Text'],
    );
  });
});
