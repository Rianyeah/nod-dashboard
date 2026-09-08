import assert from 'node:assert/strict';
import { describe, it } from 'node:test';


const DATASETS = ['impact_service', 'data_master', 'activity_enom'];


function emptyPayload(enabled = true) {
  return {
    enabled,
    jobs: Object.fromEntries(DATASETS.map((dataset) => [dataset, null])),
  };
}


describe('shared data sync state', () => {
  it('recognizes every server-owned active status', async () => {
    const { isActiveDataSyncStatus } = await import('../features/data-sync/dataSyncState.js');

    assert.equal(isActiveDataSyncStatus('dispatching'), true);
    assert.equal(isActiveDataSyncStatus('running'), true);
    assert.equal(isActiveDataSyncStatus('dispatch_unknown'), true);
    assert.equal(isActiveDataSyncStatus('succeeded'), false);
    assert.equal(isActiveDataSyncStatus('failed'), false);
    assert.equal(isActiveDataSyncStatus(null), false);
  });

  it('formats elapsed server time without accumulating interval drift', async () => {
    const { formatDataSyncElapsed } = await import('../features/data-sync/dataSyncState.js');
    const startedAt = '2026-09-08T10:00:00Z';

    assert.equal(formatDataSyncElapsed(startedAt, Date.parse('2026-09-08T10:00:05Z')), '00:05');
    assert.equal(formatDataSyncElapsed(startedAt, Date.parse('2026-09-08T10:01:05Z')), '01:05');
    assert.equal(formatDataSyncElapsed(startedAt, Date.parse('2026-09-08T11:01:05Z')), '1:01:05');
    assert.equal(formatDataSyncElapsed(startedAt, Date.parse('2026-09-08T09:59:00Z')), '00:00');
  });

  it('uses 3-5 second polling jitter and bounded failure backoff', async () => {
    const { getDataSyncPollDelay } = await import('../features/data-sync/dataSyncState.js');

    assert.equal(getDataSyncPollDelay(0, () => 0), 3000);
    assert.equal(getDataSyncPollDelay(0, () => 1), 5000);
    assert.equal(getDataSyncPollDelay(1, () => 0), 5000);
    assert.equal(getDataSyncPollDelay(2, () => 0), 10000);
    assert.equal(getDataSyncPollDelay(10, () => 0), 30000);
  });

  it('suppresses historical terminal notifications during initial bootstrap', async () => {
    const { createInitialDataSyncState, reconcileDataSyncJobs } = await import(
      '../features/data-sync/dataSyncState.js'
    );
    const payload = emptyPayload();
    payload.jobs.impact_service = {
      id: 'job-old',
      dataset: 'impact_service',
      status: 'succeeded',
      started_at: '2026-09-08T09:00:00Z',
      finished_at: '2026-09-08T09:01:00Z',
      result_code: 'completed',
      public_message: 'Sinkronisasi selesai.',
    };

    const state = reconcileDataSyncJobs(createInitialDataSyncState(), payload, 1000);

    assert.deepEqual(state.events, []);
    assert.equal(state.successRevision.impact_service, 0);
    assert.equal(state.terminalObservedAt.impact_service, null);
  });

  it('emits one success transition and never duplicates its refresh revision', async () => {
    const { createInitialDataSyncState, reconcileDataSyncJobs } = await import(
      '../features/data-sync/dataSyncState.js'
    );
    const runningPayload = emptyPayload();
    runningPayload.jobs.data_master = {
      id: 'job-new',
      dataset: 'data_master',
      status: 'running',
      started_at: '2026-09-08T10:00:00Z',
      finished_at: null,
      result_code: null,
      public_message: null,
    };
    const succeededPayload = structuredClone(runningPayload);
    succeededPayload.jobs.data_master = {
      ...succeededPayload.jobs.data_master,
      status: 'succeeded',
      finished_at: '2026-09-08T10:01:00Z',
      result_code: 'completed',
      public_message: 'Sinkronisasi selesai.',
    };

    const running = reconcileDataSyncJobs(createInitialDataSyncState(), runningPayload, 1000);
    const succeeded = reconcileDataSyncJobs(running, succeededPayload, 2000);
    const repeated = reconcileDataSyncJobs(succeeded, succeededPayload, 3000);

    assert.equal(succeeded.events.length, 1);
    assert.equal(succeeded.events[0].jobId, 'job-new');
    assert.equal(succeeded.successRevision.data_master, 1);
    assert.equal(succeeded.terminalObservedAt.data_master, 2000);
    assert.deepEqual(repeated.events, []);
    assert.equal(repeated.successRevision.data_master, 1);
  });

  it('derives button labels from shared job state and server elapsed time', async () => {
    const { getDataSyncButtonPresentation } = await import(
      '../features/data-sync/dataSyncState.js'
    );
    const startedAt = '2026-09-08T10:00:00Z';
    const nowMs = Date.parse('2026-09-08T10:00:05Z');

    assert.deepEqual(
      getDataSyncButtonPresentation({ enabled: false, nowMs }),
      { hidden: true, disabled: true, spinning: false, label: 'Sync Data' },
    );
    assert.equal(
      getDataSyncButtonPresentation({ enabled: true, actionPending: true, nowMs }).label,
      'Starting...',
    );
    assert.equal(
      getDataSyncButtonPresentation({
        enabled: true,
        job: { status: 'running', started_at: startedAt },
        nowMs,
      }).label,
      'Syncing 00:05',
    );
    assert.equal(
      getDataSyncButtonPresentation({
        enabled: true,
        job: { status: 'succeeded', started_at: startedAt },
        terminalObservedAt: nowMs - 1000,
        nowMs,
      }).label,
      'Synced',
    );
    assert.equal(
      getDataSyncButtonPresentation({
        enabled: true,
        job: { status: 'succeeded', started_at: startedAt },
        terminalObservedAt: nowMs - 6000,
        nowMs,
      }).label,
      'Sync Data',
    );
  });
});
