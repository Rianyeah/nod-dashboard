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
    assert.match(cards[0].contribution, /75,0%/);
    assert.match(cards[0].contribution, /Regional Jatim/);
    assert.equal(cards[1].tone, 'warning');
    assert.match(cards[1].contribution, /\+0,50 pp/);
    assert.match(cards[1].contribution, /50,0% outage/);
    assert.equal(cards[2].tone, 'info');
    assert.match(cards[2].contribution, /75,0%/);
    assert.doesNotMatch(cards[2].summary, /kapasitas|capacity|headroom|saturasi/i);
  });

  it('hides redundant Regional comparison when Regional Jatim is selected', () => {
    const cards = buildReportingInsights({
      scope_label: 'Regional Jatim',
      revenue: { value: 400, severity: 'unavailable', contribution: { contribution_pct: 100 }, target: { complete: false, missing_months: ['2026-07'] } },
      availability: { value: 98, severity: 'warning', contribution: {} },
      payload: { value: 40, severity: 'info', contribution: { contribution_pct: 100 } },
    });

    assert.equal(cards[0].contribution, 'Regional Jatim');
    assert.equal(cards[1].contribution, 'Regional Jatim');
    assert.equal(cards[2].contribution, 'Regional Jatim');
    assert.match(cards[0].detail, /Target belum lengkap/);
  });
});
