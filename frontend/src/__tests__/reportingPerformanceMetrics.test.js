import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAreaGrandTotal,
  calculateBackupSuksesRate,
} from '../features/reporting/reportingPerformanceMetrics.js';

describe('Reporting Performance Table metrics', () => {
  it('returns zero when the BPS denominator is zero', () => {
    assert.equal(calculateBackupSuksesRate(4, 0), 0);
  });

  it('calculates the row rate against BPS tickets', () => {
    assert.equal(calculateBackupSuksesRate(5, 20), 25);
  });

  it('builds the grand total from additive facts and duration-weighted availability', () => {
    const total = buildAreaGrandTotal([
      {
        total_sites: 2,
        u30_sites: 4,
        previous_u30_sites: 2,
        u60_sites: 1,
        previous_u60_sites: 2,
        revenue: 300,
        previous_revenue: 250,
        payload: 30,
        previous_payload: 25,
        total_time_minutes: 2_000,
        outage_minutes: 30,
        previous_total_time_minutes: 2_000,
        previous_outage_minutes: 20,
        ticket_swfm_bps: 10,
        backup_sukses_bps: 5,
      },
      {
        total_sites: 1,
        u30_sites: 2,
        previous_u30_sites: 1,
        u60_sites: 2,
        previous_u60_sites: 1,
        revenue: 100,
        previous_revenue: 80,
        payload: 10,
        previous_payload: 8,
        total_time_minutes: 1_000,
        outage_minutes: 30,
        previous_total_time_minutes: 1_000,
        previous_outage_minutes: 20,
        ticket_swfm_bps: 30,
        backup_sukses_bps: 3,
      },
    ]);

    assert.equal(total.revenue, 400);
    assert.equal(total.u30_sites, 6);
    assert.equal(total.previous_u30_sites, 3);
    assert.equal(total.u30_mom_pct, 100);
    assert.equal(total.u60_sites, 3);
    assert.equal(total.previous_u60_sites, 3);
    assert.equal(total.u60_mom_pct, 0);
    assert.equal(total.revenue_delta_pct, ((400 - 330) / 330) * 100);
    assert.equal(total.payload, 40);
    assert.equal(total.payload_delta_pct, ((40 - 33) / 33) * 100);
    assert.equal(total.avg_availability, 98);
    assert.equal(total.previous_avg_availability, 98.66666666666667);
    assert.equal(total.availability_delta_pct, 98 - 98.66666666666667);
    assert.equal(total.backup_sukses_rate, 20);
  });
});
