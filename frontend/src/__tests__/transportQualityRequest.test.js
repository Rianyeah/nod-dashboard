import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isRetryableTransportError,
  withTransportRetry,
} from '../services/transportQualityRequest.js';

describe('Transport Quality request retry policy', () => {
  it('retries transient failures twice and returns the successful value', async () => {
    let attempts = 0;
    const waits = [];

    const value = await withTransportRetry(async () => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error('temporarily unavailable');
        error.response = { status: 503 };
        throw error;
      }
      return 'ready';
    }, {
      wait: async (delay) => waits.push(delay),
    });

    assert.equal(value, 'ready');
    assert.equal(attempts, 3);
    assert.deepEqual(waits, [250, 500]);
  });

  it('does not retry authentication, ordinary client, or canceled failures', async () => {
    for (const error of [
      Object.assign(new Error('unauthorized'), { response: { status: 401 } }),
      Object.assign(new Error('bad request'), { response: { status: 400 } }),
      Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' }),
    ]) {
      let attempts = 0;
      await assert.rejects(() => withTransportRetry(async () => {
        attempts += 1;
        throw error;
      }, { wait: async () => {} }), error);
      assert.equal(attempts, 1);
    }
  });

  it('recognizes network, timeout, rate limit, and gateway failures as transient', () => {
    for (const error of [
      { code: 'ERR_NETWORK' },
      { code: 'ECONNABORTED' },
      { code: 'ETIMEDOUT' },
      { response: { status: 408 } },
      { response: { status: 429 } },
      { response: { status: 502 } },
      { response: { status: 503 } },
      { response: { status: 504 } },
    ]) {
      assert.equal(isRetryableTransportError(error), true);
    }
  });

  it('throws the final transient error after the retry budget is exhausted', async () => {
    const error = Object.assign(new Error('gateway timeout'), { response: { status: 504 } });
    let attempts = 0;

    await assert.rejects(() => withTransportRetry(async () => {
      attempts += 1;
      throw error;
    }, { wait: async () => {} }), error);

    assert.equal(attempts, 3);
  });
});
