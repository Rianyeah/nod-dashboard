import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  revenueBandPresentation,
  toggleRevenueBand,
} from '../features/reporting/reportingSiteState.js';


describe('Reporting site revenue band state', () => {
  it('toggles U30 and U60 shortcuts independently from other filters', () => {
    assert.equal(toggleRevenueBand('all', 'u30'), 'u30');
    assert.equal(toggleRevenueBand('u30', 'u30'), 'all');
    assert.equal(toggleRevenueBand('u30', 'u60'), 'u60');
  });

  it('presents the backend band instead of operational active status', () => {
    assert.equal(revenueBandPresentation('u30').label, 'U30');
    assert.equal(revenueBandPresentation('u60').label, 'U60');
    assert.equal(revenueBandPresentation('achieved').label, 'Achieved');
    assert.equal(revenueBandPresentation('unavailable').label, 'Unavailable');
    assert.equal(revenueBandPresentation('active').label, 'Unavailable');
  });
});
