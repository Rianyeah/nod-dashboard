import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildReportingInsights } from '../features/reporting/reportingInsights.js';


describe('Reporting Executive Insight presentation', () => {
  it('shows selected values and Regional contribution without availability division', () => {
    const cards = buildReportingInsights({
      scope_label: 'SIDOARJO',
      revenue: {
        value: 300_000_000,
        previous_value: 250_000_000,
        delta_pct: 20,
        severity: 'success',
        contribution: { regional_value: 400_000_000, contribution_pct: 75 },
        target: { complete: true, target_revenue: 300_000_000, gap: 0, attainment_pct: 100 },
      },
      payload: {
        value: 30_000,
        previous_value: 25_000,
        delta_pct: 20,
        severity: 'info',
        contribution: { regional_value: 40_000, contribution_pct: 75 },
      },
      availability: {
        value: 98.5,
        previous_value: 99,
        delta_pct: -0.5,
        severity: 'warning',
        contribution: { regional_value: 98, difference_pp: 0.5, contribution_pct: 50 },
      },
    }, 'vs periode sebelumnya');

    assert.equal(cards[0].tone, 'success');
    assert.equal(cards[0].contribution, 'Kontribusi NOP SIDOARJO Rp 300,0 Jt / 75,0% pada Regional Jatim.');
    assert.equal(cards[1].tone, 'warning');
    assert.match(cards[1].contribution, /\+0,50 pp/);
    assert.match(cards[1].contribution, /kontribusi outage 50,0%/);
    assert.equal(cards[2].tone, 'info');
    assert.equal(cards[2].contribution, 'Kontribusi NOP SIDOARJO 29,3 GB / 75,0% pada Regional Jatim.');
    assert.doesNotMatch(cards[2].summary, /kapasitas|capacity|headroom|saturasi/i);
  });

  it('hides redundant Regional comparison when Regional Jatim is selected', () => {
    const cards = buildReportingInsights({
      scope_label: 'Regional Jatim',
      revenue: { value: 400, severity: 'unavailable', contribution: { contribution_pct: 100 }, target: { complete: false, missing_months: ['2026-07'] } },
      availability: { value: 98, severity: 'warning', contribution: {} },
      payload: { value: 40, severity: 'info', contribution: { contribution_pct: 100 } },
    });

    assert.equal(cards[0].contribution, null);
    assert.equal(cards[1].contribution, null);
    assert.equal(cards[2].contribution, null);
    assert.match(cards[0].detail, /Target belum lengkap/);
  });

  it('uses configured threshold context without generic SLA or payload capacity claims', () => {
    const cards = buildReportingInsights({
      scope_label: 'SIDOARJO',
      thresholds: {
        availability: { DIAMOND: 99.87, PLATINUM: 99.73, GOLD: 99.68, SILVER: 99.67, BRONZE: 99.73 },
        payload_target_tb: 15,
      },
      revenue: { value: 1, severity: 'unavailable', target: { complete: false }, contribution: {} },
      availability: { value: 99.7, delta_pct: -0.01, severity: 'warning', contribution: {} },
      payload: { value: 1, delta_pct: 1, severity: 'info', contribution: {} },
    });

    assert.match(cards[1].detail, /99,67%-99,87%/);
    assert.doesNotMatch(cards[1].title + cards[1].detail, /SLA/);
    assert.match(cards[2].detail, /15 TB per bulan/);
    assert.doesNotMatch(cards[2].detail, /kapasitas|capacity|headroom/i);
  });
});
