import { shouldReportDataSyncStartFailure } from './dataSyncState.js';


export async function reconcileStartFailure({ dataset, fetchStatus }) {
  try {
    const payload = await fetchStatus();
    return {
      payload,
      reportFailure: shouldReportDataSyncStartFailure(payload, dataset),
    };
  } catch {
    return { payload: null, reportFailure: true };
  }
}

export async function requestDataSyncCancellation({
  dataset,
  jobId,
  cancelSync,
  fetchStatus,
}) {
  try {
    const response = await cancelSync(dataset, jobId);
    return { ok: true, response, payload: null };
  } catch (error) {
    if (error?.response?.status === 401) {
      return { ok: false, response: null, payload: null, error };
    }
    try {
      return { ok: false, response: null, payload: await fetchStatus() };
    } catch {
      return { ok: false, response: null, payload: null };
    }
  }
}
