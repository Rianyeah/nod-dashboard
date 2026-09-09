export const DATA_SYNC_DATASETS = Object.freeze([
  'impact_service',
  'data_master',
  'activity_enom',
]);

const ACTIVE_STATUSES = new Set(['dispatching', 'running', 'dispatch_unknown']);
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'timed_out', 'canceled']);

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
      message: formatDataSyncResultMessage(job),
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
  if (status === 'canceled') return 'Sinkronisasi telah dibatalkan.';
  return 'Sinkronisasi gagal.';
}

export function formatDataSyncResultMessage(job) {
  if (job?.result_code === 'completed' && Number.isFinite(job.rows_processed)) {
    const rows = new Intl.NumberFormat('id-ID').format(job.rows_processed);
    return `Sinkronisasi selesai. ${rows} baris diproses.`;
  }
  return job?.public_message || terminalFallback(job?.status);
}

export function formatDataSyncRateLimitMessage(retryAfter, limitKind) {
  const seconds = Math.max(1, Math.ceil(Number(retryAfter) || 1));
  if (limitKind === 'cooldown') {
    return `Tunggu ${seconds} detik sebelum mencoba sinkronisasi ulang.`;
  }
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Batas 10 sinkronisasi per jam tercapai. Coba lagi dalam ${minutes} menit.`;
}

export function getDataSyncStartErrorMessage({ status, retryAfter, limitKind }) {
  if (status === 429) {
    return formatDataSyncRateLimitMessage(retryAfter, limitKind);
  }
  if (status === 503) {
    return 'Sinkronisasi data sedang dinonaktifkan.';
  }
  return 'Sinkronisasi tidak dapat dimulai. Status sedang diperiksa ulang.';
}

export function shouldReportDataSyncStartFailure(payload, dataset) {
  return !isActiveDataSyncStatus(payload?.jobs?.[dataset]?.status);
}

export function getDataSyncButtonPresentation({
  enabled,
  actionPending = false,
  cancelPending = false,
  job = null,
  terminalObservedAt = null,
  nowMs = Date.now(),
}) {
  if (!enabled) {
    return { hidden: true, disabled: true, spinning: false, label: 'Sync Data' };
  }
  if (cancelPending) {
    return { hidden: false, disabled: true, spinning: true, label: 'Canceling...' };
  }
  if (actionPending || job?.status === 'dispatching') {
    const elapsed = isActiveDataSyncStatus(job?.status)
      ? formatDataSyncElapsed(job.started_at, nowMs)
      : '00:00';
    return { hidden: false, disabled: true, spinning: true, label: `Starting ${elapsed}` };
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
  if (showTerminal && job?.status === 'canceled') {
    return { hidden: false, disabled: false, spinning: false, label: 'Canceled' };
  }
  return { hidden: false, disabled: false, spinning: false, label: 'Sync Data' };
}
