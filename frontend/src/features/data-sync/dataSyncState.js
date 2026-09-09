export const DATA_SYNC_DATASETS = Object.freeze([
  'impact_service',
  'data_master',
  'activity_enom',
]);

const ACTIVE_STATUSES = new Set(['dispatching', 'running', 'dispatch_unknown']);
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'timed_out']);

function datasetRecord(value) {
  return Object.fromEntries(DATA_SYNC_DATASETS.map((dataset) => [dataset, value]));
}

export function createInitialDataSyncState() {
  return {
    initialized: false,
    enabled: false,
    jobs: datasetRecord(null),
    successRevision: datasetRecord(0),
    terminalObservedAt: datasetRecord(null),
    observedTerminalJobIds: [],
    events: [],
  };
}

export function isActiveDataSyncStatus(status) {
  return ACTIVE_STATUSES.has(status);
}

export function formatDataSyncElapsed(startedAt, nowMs = Date.now()) {
  const startedMs = Date.parse(startedAt);
  const elapsedSeconds = Number.isFinite(startedMs)
    ? Math.max(0, Math.floor((nowMs - startedMs) / 1000))
    : 0;
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  const minuteSecond = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${minuteSecond}` : minuteSecond;
}

export function getDataSyncPollDelay(failureCount, random = Math.random) {
  if (failureCount <= 0) {
    const sample = Math.min(1, Math.max(0, Number(random()) || 0));
    return 3000 + Math.round(sample * 2000);
  }
  return Math.min(30000, 5000 * (2 ** (failureCount - 1)));
}

export function reconcileDataSyncJobs(previousState, payload, observedAt = Date.now()) {
  const previous = previousState || createInitialDataSyncState();
  const observedIds = new Set(previous.observedTerminalJobIds);
  const jobs = {};
  const successRevision = { ...previous.successRevision };
  const terminalObservedAt = { ...previous.terminalObservedAt };
  const events = [];

  for (const dataset of DATA_SYNC_DATASETS) {
    const job = payload?.jobs?.[dataset] || null;
    jobs[dataset] = job;
    if (!job || !TERMINAL_STATUSES.has(job.status) || observedIds.has(job.id)) {
      continue;
    }

    observedIds.add(job.id);
    if (!previous.initialized) {
      continue;
    }

    terminalObservedAt[dataset] = observedAt;
    if (job.status === 'succeeded') {
      successRevision[dataset] += 1;
    }
    events.push({
      id: `${job.id}:${job.status}`,
      jobId: job.id,
      dataset,
      status: job.status,
      message: job.public_message || terminalFallback(job.status),
      observedAt,
    });
  }

  return {
    initialized: true,
    enabled: Boolean(payload?.enabled),
    jobs,
    successRevision,
    terminalObservedAt,
    observedTerminalJobIds: [...observedIds].slice(-100),
    events,
  };
}

function terminalFallback(status) {
  if (status === 'succeeded') return 'Sinkronisasi selesai.';
  if (status === 'timed_out') return 'Sinkronisasi melewati batas waktu.';
  return 'Sinkronisasi gagal.';
}

export function getDataSyncButtonPresentation({
  enabled,
  actionPending = false,
  job = null,
  terminalObservedAt = null,
  nowMs = Date.now(),
}) {
  if (!enabled) {
    return { hidden: true, disabled: true, spinning: false, label: 'Sync Data' };
  }
  if (actionPending || job?.status === 'dispatching') {
    return { hidden: false, disabled: true, spinning: true, label: 'Starting...' };
  }
  if (isActiveDataSyncStatus(job?.status)) {
    return {
      hidden: false,
      disabled: true,
      spinning: true,
      label: `Syncing ${formatDataSyncElapsed(job.started_at, nowMs)}`,
    };
  }
  const showTerminal = terminalObservedAt != null && nowMs - terminalObservedAt < 5000;
  if (showTerminal && job?.status === 'succeeded') {
    return { hidden: false, disabled: false, spinning: false, label: 'Synced' };
  }
  if (showTerminal && job?.status === 'failed') {
    return { hidden: false, disabled: false, spinning: false, label: 'Sync failed' };
  }
  if (showTerminal && job?.status === 'timed_out') {
    return { hidden: false, disabled: false, spinning: false, label: 'Timed out' };
  }
  return { hidden: false, disabled: false, spinning: false, label: 'Sync Data' };
}
