import { migrateTowerPlan } from './towerPlanState';

const DB_NAME = 'nod-tower-plan';
const DB_VERSION = 1;
const DOCUMENT_STORE = 'documents';
const ASSET_STORE = 'assets';
const DRAFT_KEY = 'active-draft';
const FALLBACK_KEY = 'nod_tower_plan_draft_v6';
const LEGACY_FALLBACK_KEYS = ['nod_tower_plan_draft_v5', 'nod_tower_plan_draft_v4'];

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DOCUMENT_STORE)) {
        database.createObjectStore(DOCUMENT_STORE);
      }
      if (!database.objectStoreNames.contains(ASSET_STORE)) {
        database.createObjectStore(ASSET_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStore(storeName, key) {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function writeStore(storeName, key, value) {
  const database = await openDatabase();
  if (!database) return;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function loadTowerPlanDraft() {
  try {
    const stored = await readStore(DOCUMENT_STORE, DRAFT_KEY);
    if (stored) return migrateTowerPlan(stored);
  } catch {
    // Continue to the localStorage compatibility fallback.
  }
  try {
    const fallback = [FALLBACK_KEY, ...LEGACY_FALLBACK_KEYS]
      .map((key) => localStorage.getItem(key))
      .find(Boolean);
    return fallback ? migrateTowerPlan(JSON.parse(fallback)) : null;
  } catch {
    return null;
  }
}

export async function saveTowerPlanDraft(plan) {
  const snapshot = structuredClone(plan);
  try {
    await writeStore(DOCUMENT_STORE, DRAFT_KEY, snapshot);
  } catch {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(snapshot));
  }
}

export async function loadTowerPlanAsset(key) {
  try {
    return await readStore(ASSET_STORE, key);
  } catch {
    return null;
  }
}

export async function saveTowerPlanAsset(key, fileOrBlob, name = 'tower-plan.png') {
  await writeStore(ASSET_STORE, key, {
    blob: fileOrBlob,
    name,
    type: fileOrBlob.type,
    savedAt: new Date().toISOString(),
  });
}
