import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRevenueTotals,
  calculateBackupSuksesRate,
} from '../features/reporting/reportingPerformanceMetrics.js';

describe('Reporting Performance Table metrics', () => {
  it('returns zero when the BPS denominator is zero', () => {
    assert.equal(calculateBackupSuksesRate(4, 0), 0);
  });

  it('calculates the row rate against BPS tickets', () => {
    assert.equal(calculateBackupSuksesRate(5, 20), 25);
  });

  it('calculates Total from summed counts instead of averaging row percentages', () => {
    const total = buildRevenueTotals([
      {
        total_sites: 2,
        avg_availability: 99,
        ticket_swfm_bps: 10,
        backup_sukses_bps: 5,
        backup_sukses_rate: 50,
        proker_open: 2,
        proker_closed: 1,
      },
      {
        total_sites: 8,
        avg_availability: 100,
        ticket_swfm_bps: 30,
        backup_sukses_bps: 3,
        backup_sukses_rate: 10,
        proker_open: 4,
        proker_closed: 3,
      },
    ]);

    assert.equal(total.backup_sukses_bps, 8);
    assert.equal(total.ticket_swfm_bps, 40);
    assert.equal(total.backup_sukses_rate, 20);
    assert.equal(total.proker_open, 6);
    assert.equal(total.proker_closed, 4);
    assert.equal(total.avg_availability, 99.8);
  });
});
