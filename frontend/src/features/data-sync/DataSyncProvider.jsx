import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';

import { useAuth } from '../../auth/AuthContext';
import { fetchDataSyncStatus, startDataSync } from '../../services/api';
import {
  DATA_SYNC_DATASETS,
  createInitialDataSyncState,
  getDataSyncPollDelay,
  isActiveDataSyncStatus,
  reconcileDataSyncJobs,
} from './dataSyncState';


const DataSyncContext = createContext(null);
const pendingInitialRequests = new WeakMap();

const DATASET_LABELS = {
  impact_service: 'Impact Service',
  data_master: 'Data Potensi',
  activity_enom: 'Activity ENOM',
};

function datasetRecord(value) {
  return Object.fromEntries(DATA_SYNC_DATASETS.map((dataset) => [dataset, value]));
}

function createStore() {
  return {
    sync: createInitialDataSyncState(),
    actionPending: datasetRecord(false),
    actionErrors: datasetRecord(null),
    notifications: [],
  };
}

function appendNotifications(current, events) {
  const known = new Set(current.map((item) => item.id));
  return [...current, ...events.filter((item) => !known.has(item.id))].slice(-5);
}

function dataSyncReducer(store, action) {
  if (action.type === 'apply_payload') {
    const sync = reconcileDataSyncJobs(store.sync, action.payload, action.observedAt);
    return {
      ...store,
      sync,
      notifications: appendNotifications(store.notifications, sync.events),
    };
  }
  if (action.type === 'pending') {
    return {
      ...store,
      actionPending: { ...store.actionPending, [action.dataset]: action.value },
      actionErrors: action.value
        ? { ...store.actionErrors, [action.dataset]: null }
        : store.actionErrors,
    };
  }
  if (action.type === 'start_error') {
    return {
      ...store,
      actionErrors: { ...store.actionErrors, [action.dataset]: action.message },
      notifications: appendNotifications(store.notifications, [action.notification]),
    };
  }
  if (action.type === 'dismiss') {
    return {
      ...store,
      notifications: store.notifications.filter((item) => item.id !== action.id),
    };
  }
  return store;
}

function initialStatus(fetchStatus) {
  const existing = pendingInitialRequests.get(fetchStatus);
  if (existing) return existing;
  const request = Promise.resolve().then(() => fetchStatus());
  pendingInitialRequests.set(fetchStatus, request);
  void request.finally(() => {
    if (pendingInitialRequests.get(fetchStatus) === request) {
      pendingInitialRequests.delete(fetchStatus);
    }
  }).catch(() => {});
  return request;
}

function isUnauthorized(error) {
  return error?.response?.status === 401;
}

function actionFailureMessage(error) {
  if (error?.response?.status === 429) {
    return 'Batas permintaan sync tercapai. Coba kembali setelah jeda.';
  }
  if (error?.response?.status === 503) {
    return 'Sinkronisasi data sedang dinonaktifkan.';
  }
  return 'Sinkronisasi tidak dapat dimulai. Status sedang diperiksa ulang.';
}

const anonymousContext = {
  enabled: false,
  jobs: datasetRecord(null),
  successRevision: datasetRecord(0),
  terminalObservedAt: datasetRecord(null),
  actionPending: datasetRecord(false),
  actionErrors: datasetRecord(null),
  notifications: [],
  start: async () => null,
  dismissNotification: () => {},
};

export function DataSyncProvider(props) {
  const { status } = useAuth();
  if (status !== 'authenticated') {
    return (
      <DataSyncContext.Provider value={anonymousContext}>
        {props.children}
      </DataSyncContext.Provider>
    );
  }
  return <AuthenticatedDataSyncProvider {...props} />;
}

function AuthenticatedDataSyncProvider({
  children,
  fetchStatus = fetchDataSyncStatus,
  startSync = startDataSync,
  random = Math.random,
}) {
  const [store, dispatch] = useReducer(dataSyncReducer, undefined, createStore);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyPayload = useCallback((payload) => {
    if (!mountedRef.current) return;
    dispatch({ type: 'apply_payload', payload, observedAt: Date.now() });
  }, []);

  useEffect(() => {
    let disposed = false;
    let retryTimer;
    let failures = 0;
    const bootstrap = async () => {
      try {
        const payload = await initialStatus(fetchStatus);
        if (!disposed) applyPayload(payload);
      } catch (error) {
        if (disposed || isUnauthorized(error)) return;
        failures += 1;
        retryTimer = window.setTimeout(bootstrap, getDataSyncPollDelay(failures, random));
      }
    };
    void bootstrap();
    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
    };
  }, [applyPayload, fetchStatus, random]);

  const hasActiveJob = DATA_SYNC_DATASETS.some((dataset) =>
    isActiveDataSyncStatus(store.sync.jobs[dataset]?.status),
  );

  useEffect(() => {
    if (!hasActiveJob) return undefined;

    let disposed = false;
    let timer;
    let controller;
    let failures = 0;
    const poll = async () => {
      controller = new AbortController();
      try {
        const payload = await fetchStatus(controller.signal);
        if (disposed) return;
        failures = 0;
        applyPayload(payload);
        const remainsActive = DATA_SYNC_DATASETS.some((dataset) =>
          isActiveDataSyncStatus(payload?.jobs?.[dataset]?.status),
        );
        if (remainsActive) {
          timer = window.setTimeout(poll, getDataSyncPollDelay(0, random));
        }
      } catch (error) {
        if (disposed || isUnauthorized(error) || error?.name === 'CanceledError') return;
        failures += 1;
        timer = window.setTimeout(poll, getDataSyncPollDelay(failures, random));
      }
    };
    timer = window.setTimeout(poll, getDataSyncPollDelay(0, random));
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [applyPayload, fetchStatus, hasActiveJob, random]);

  const start = useCallback(async (dataset) => {
    if (!DATA_SYNC_DATASETS.includes(dataset) || !store.sync.enabled) return null;
    dispatch({ type: 'pending', dataset, value: true });
    try {
      const response = await startSync(dataset);
      applyPayload({
        enabled: store.sync.enabled,
        jobs: { ...store.sync.jobs, [dataset]: response.job },
      });
      return response;
    } catch (error) {
      if (!isUnauthorized(error)) {
        const message = actionFailureMessage(error);
        const id = `start:${dataset}:${Date.now()}`;
        dispatch({
          type: 'start_error',
          dataset,
          message,
          notification: { id, dataset, status: 'failed', message },
        });
        try {
          applyPayload(await fetchStatus());
        } catch {
          // The original request is never retried; regular polling can recover later.
        }
      }
      return null;
    } finally {
      if (mountedRef.current) {
        dispatch({ type: 'pending', dataset, value: false });
      }
    }
  }, [applyPayload, fetchStatus, startSync, store.sync]);

  const dismissNotification = useCallback((id) => {
    dispatch({ type: 'dismiss', id });
  }, []);

  const value = useMemo(() => ({
    enabled: store.sync.enabled,
    jobs: store.sync.jobs,
    successRevision: store.sync.successRevision,
    terminalObservedAt: store.sync.terminalObservedAt,
    actionPending: store.actionPending,
    actionErrors: store.actionErrors,
    notifications: store.notifications,
    start,
    dismissNotification,
  }), [dismissNotification, start, store]);

  return <DataSyncContext.Provider value={value}>{children}</DataSyncContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDataSync(dataset) {
  const context = useContext(DataSyncContext);
  if (!context) throw new Error('useDataSync must be used inside DataSyncProvider');
  if (!DATA_SYNC_DATASETS.includes(dataset)) throw new Error('Unknown data-sync dataset');
  return {
    enabled: context.enabled,
    job: context.jobs[dataset],
    start: () => context.start(dataset),
    successRevision: context.successRevision[dataset],
    terminalObservedAt: context.terminalObservedAt[dataset],
    actionPending: context.actionPending[dataset],
    actionError: context.actionErrors[dataset],
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDataSyncNotifications() {
  const context = useContext(DataSyncContext);
  if (!context) throw new Error('useDataSyncNotifications must be used inside DataSyncProvider');
  return {
    notifications: context.notifications.map((item) => ({
      ...item,
      datasetLabel: DATASET_LABELS[item.dataset] || item.dataset,
    })),
    dismissNotification: context.dismissNotification,
  };
}
