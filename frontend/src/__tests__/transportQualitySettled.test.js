import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { collectTransportDashboardResults } from '../features/transport-quality/transportQualitySettled.js';

describe('Transport Quality partial dashboard results', () => {
  it('keeps fulfilled modules available when another module fails', () => {
    const failure = new Error('trend unavailable');
    const result = collectTransportDashboardResults([
      { status: 'fulfilled', value: { total_sites: 12 } },
      { status: 'rejected', reason: failure },
      { status: 'fulfilled', value: { by_packet_loss: [1] } },
      { status: 'fulfilled', value: { by_nop: [2] } },
    ]);

    assert.deepEqual(result.values, {
      summary: { total_sites: 12 },
      distributions: { by_packet_loss: [1] },
      breakdowns: { by_nop: [2] },
    });
    assert.deepEqual(result.failedModules, ['trend']);
    assert.equal(result.failures.trend, failure);
  });

  it('reports all module names when every request fails', () => {
    const results = Array.from({ length: 4 }, () => ({ status: 'rejected', reason: new Error('offline') }));
    const result = collectTransportDashboardResults(results);

    assert.deepEqual(result.values, {});
    assert.deepEqual(result.failedModules, ['summary', 'trend', 'distributions', 'breakdowns']);
  });
});
