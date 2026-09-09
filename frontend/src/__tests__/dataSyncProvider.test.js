import assert from 'node:assert/strict';
import { describe, it } from 'node:test';


describe('data sync provider operations', () => {
  it('reconciles a timed-out start before deciding whether to notify', async () => {
    const { reconcileStartFailure } = await import(
      '../features/data-sync/dataSyncActions.js'
    );
    const payload = {
      enabled: true,
      jobs: {
        impact_service: { id: 'job-1', status: 'running' },
        data_master: null,
        activity_enom: null,
      },
    };

    const active = await reconcileStartFailure({
      dataset: 'impact_service',
      fetchStatus: async () => payload,
    });
    const absent = await reconcileStartFailure({
      dataset: 'data_master',
      fetchStatus: async () => payload,
    });

    assert.deepEqual(active, { payload, reportFailure: false });
    assert.deepEqual(absent, { payload, reportFailure: true });
  });

  it('reports a start failure when status reconciliation also fails', async () => {
    const { reconcileStartFailure } = await import(
      '../features/data-sync/dataSyncActions.js'
    );

    const result = await reconcileStartFailure({
      dataset: 'impact_service',
      fetchStatus: async () => {
        throw new Error('offline');
      },
    });

    assert.deepEqual(result, { payload: null, reportFailure: true });
  });

  it('refreshes authoritative state after a failed cancellation', async () => {
    const { requestDataSyncCancellation } = await import(
      '../features/data-sync/dataSyncActions.js'
    );
    const payload = {
      enabled: true,
      jobs: { impact_service: { id: 'job-1', status: 'running' } },
    };

    const result = await requestDataSyncCancellation({
      dataset: 'impact_service',
      jobId: 'job-1',
      cancelSync: async () => {
        throw new Error('stop not confirmed');
      },
      fetchStatus: async () => payload,
    });

    assert.equal(result.ok, false);
    assert.equal(result.payload, payload);
  });

  it('preserves an unauthorized cancellation error for logout handling', async () => {
    const { requestDataSyncCancellation } = await import(
      '../features/data-sync/dataSyncActions.js'
    );
    const unauthorized = Object.assign(new Error('unauthorized'), {
      response: { status: 401 },
    });

    const result = await requestDataSyncCancellation({
      dataset: 'impact_service',
      jobId: 'job-1',
      cancelSync: async () => {
        throw unauthorized;
      },
      fetchStatus: async () => null,
    });

    assert.equal(result.error, unauthorized);
  });
});
