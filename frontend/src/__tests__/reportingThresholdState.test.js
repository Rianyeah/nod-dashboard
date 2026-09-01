import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  thresholdDraftPayload,
  validateThresholdDraft,
} from '../features/management-data/reportingThresholdState.js';


const validDraft = () => ({
  availability: {
    diamond: '99,87',
    platinum: '99,73',
    gold: '99,68',
    silver: '99,67',
    bronze: '99,73',
  },
  revenue_u30_upper: '30000000',
  revenue_u60_upper: '60000000',
  payload_target_tb: '15',
});


describe('Reporting threshold form state', () => {
  it('rejects inverted revenue bands and invalid availability', () => {
    const draft = validDraft();
    draft.availability.diamond = '100,1';
    draft.revenue_u30_upper = '70000000';

    const result = validateThresholdDraft(draft);

    assert.equal(result.valid, false);
    assert.ok(result.errors.diamond);
    assert.ok(result.errors.revenue_u30_upper);
  });

  it('parses comma decimals only at the API boundary', () => {
    const payload = thresholdDraftPayload(validDraft());

    assert.equal(payload.availability.diamond, 99.87);
    assert.equal(payload.revenue_u30_upper, 30_000_000);
    assert.equal(payload.revenue_u60_upper, 60_000_000);
    assert.equal(payload.payload_target_tb, 15);
  });

  it('keeps rupiah boundaries integer-only', () => {
    const draft = validDraft();
    draft.revenue_u30_upper = '30000000,5';

    const result = validateThresholdDraft(draft);

    assert.equal(result.valid, false);
    assert.ok(result.errors.revenue_u30_upper);
  });
});
