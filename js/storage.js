// js/storage.js — persistence layer.
// Primary backend: IndexedDB (no ~5MB limit, async, no main-thread blocking).
// Fallback backend: localStorage (for browsers/environments where IDB is blocked,
// e.g. some file:// setups). Both backends expose the exact same async API.

const DB_NAME = "quizPracticeApp";
const DB_VERSION = 1;
const STORE = { META: "meta", DATA: "data", PROGRESS: "progress", SETTINGS: "settings" };
const LS = {
  index: "qpa:meta",
  data: (id) => `qpa:data:${id}`,
  progress: (id) => `qpa:progress:${id}`,
  settings: "qpa:settings",
};

let dbPromise = null;
let backend = "indexeddb";

export function getBackend() {
  return backend;
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("indexedDB-unavailable"));
      return;
    }
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE.META)) db.createObjectStore(STORE.META, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE.DATA)) db.createObjectStore(STORE.DATA, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE.PROGRESS)) db.createObjectStore(STORE.PROGRESS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE.SETTINGS)) db.createObjectStore(STORE.SETTINGS, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexedDB-open-failed"));
    request.onblocked = () => reject(new Error("indexedDB-blocked"));
  });
  return dbPromise;
}

function run(storeName, mode, action) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let result;
        const request = action(store);
        if (request) {
          request.onsuccess = () => {
            result = request.result;
          };
          request.onerror = () => reject(request.error);
        }
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("transaction-aborted"));
      })
  );
}

function idbGetAll(storeName) {
  return run(storeName, "readonly", (store) => store.getAll());
}
function idbGet(storeName, key) {
  return run(storeName, "readonly", (store) => store.get(key));
}
function idbPut(storeName, value) {
  return run(storeName, "readwrite", (store) => store.put(value));
}
function idbDelete(storeName, key) {
  return run(storeName, "readwrite", (store) => store.delete(key));
}

// ---- localStorage fallback helpers ------------------------------------------

function lsRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn("localStorage read failed:", err);
    return fallback;
  }
}

function lsWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (err && (err.name === "QuotaExceededError" || err.code === 22)) {
      const quota = new Error("Browser storage is full. Delete a collection or export a backup first.");
      quota.name = "QuotaExceededError";
      throw quota;
    }
    throw err;
  }
}

function toQuotaError(err) {
  if (err && (err.name === "QuotaExceededError" || err.code === 22)) {
    const quota = new Error("Browser storage is full. Delete a collection or export a backup first.");
    quota.name = "QuotaExceededError";
    return quota;
  }
  return err;
}

// ---- Public API (async, backend-agnostic) -----------------------------------

export async function init() {
  try {
    await openDb();
    backend = "indexeddb";
  } catch (err) {
    console.warn("IndexedDB unavailable, falling back to localStorage:", err && err.message);
    backend = "localStorage";
  }
  return backend;
}

export async function listCollections() {
  if (backend === "localStorage") return lsRead(LS.index, []);
  const metas = (await idbGetAll(STORE.META)) || [];
  return metas;
}

export async function fetchCollection(id) {
  if (backend === "localStorage") {
    const meta = (lsRead(LS.index, []) || []).find((m) => m.id === id);
    if (!meta) return null;
    const data = lsRead(LS.data(id), { questions: [] });
    const record = lsRead(LS.progress(id), {});
    return {
      meta,
      questions: data.questions || [],
      progress: record.done || {},
      saved: record.saved || {},
      notes: record.notes || {},
    };
  }
  const [meta, data, record] = await Promise.all([
    idbGet(STORE.META, id),
    idbGet(STORE.DATA, id),
    idbGet(STORE.PROGRESS, id),
  ]);
  if (!meta) return null;
  return {
    meta,
    questions: (data && data.questions) || [],
    progress: (record && record.done) || {},
    saved: (record && record.saved) || {},
    notes: (record && record.notes) || {},
  };
}

export async function saveCollection({ meta, questions, progress, saved, notes }) {
  try {
    if (backend === "localStorage") {
      const index = lsRead(LS.index, []);
      const nextIndex = index.filter((m) => m.id !== meta.id).concat(meta);
      lsWrite(LS.data(meta.id), { questions });
      lsWrite(LS.progress(meta.id), { done: progress || {}, saved: saved || {}, notes: notes || {} });
      lsWrite(LS.index, nextIndex);
      return;
    }
    await idbPut(STORE.META, meta);
    await idbPut(STORE.DATA, { id: meta.id, questions });
    await idbPut(STORE.PROGRESS, { id: meta.id, done: progress || {}, saved: saved || {}, notes: notes || {} });
  } catch (err) {
    throw toQuotaError(err);
  }
}

export async function updateMeta(meta) {
  try {
    if (backend === "localStorage") {
      const index = lsRead(LS.index, []);
      lsWrite(LS.index, index.map((m) => (m.id === meta.id ? meta : m)));
      return;
    }
    await idbPut(STORE.META, meta);
  } catch (err) {
    throw toQuotaError(err);
  }
}

// Persists the whole study record (done + saved + notes) in one write.
export async function saveStudyState(id, { done, saved, notes }) {
  const record = { id, done: done || {}, saved: saved || {}, notes: notes || {} };
  try {
    if (backend === "localStorage") {
      lsWrite(LS.progress(id), record);
      return;
    }
    await idbPut(STORE.PROGRESS, record);
  } catch (err) {
    throw toQuotaError(err);
  }
}

export async function deleteCollection(id) {
  if (backend === "localStorage") {
    const index = lsRead(LS.index, []);
    lsWrite(LS.index, index.filter((m) => m.id !== id));
    localStorage.removeItem(LS.data(id));
    localStorage.removeItem(LS.progress(id));
    return;
  }
  await Promise.all([idbDelete(STORE.META, id), idbDelete(STORE.DATA, id), idbDelete(STORE.PROGRESS, id)]);
}

export async function getSetting(key, fallback = null) {
  if (backend === "localStorage") {
    const settings = lsRead(LS.settings, {});
    return key in settings ? settings[key] : fallback;
  }
  const record = await idbGet(STORE.SETTINGS, key);
  return record ? record.value : fallback;
}

export async function setSetting(key, value) {
  if (backend === "localStorage") {
    const settings = lsRead(LS.settings, {});
    settings[key] = value;
    lsWrite(LS.settings, settings);
    return;
  }
  await idbPut(STORE.SETTINGS, { key, value });
}

export async function exportCollection(id) {
  const record = await fetchCollection(id);
  if (!record) throw new Error("Collection not found.");
  return {
    app: "quiz-practice-app",
    version: 1,
    exportedAt: new Date().toISOString(),
    name: record.meta.name,
    examQuestionLimit: record.meta.examQuestionLimit,
    examTimeMinutes: record.meta.examTimeMinutes,
    questions: record.questions,
    progress: record.progress,
    saved: record.saved,
    notes: record.notes,
  };
}

// Lightweight map of { collectionId: { questionId: true } } used by the home
// screen so it never has to load the (large) question arrays just to show
// progress bars.
export async function getAllProgress() {
  if (backend === "localStorage") {
    const index = lsRead(LS.index, []);
    const map = {};
    index.forEach((meta) => {
      map[meta.id] = lsRead(LS.progress(meta.id), {});
    });
    return map;
  }
  const records = (await idbGetAll(STORE.PROGRESS)) || [];
  const map = {};
  records.forEach((record) => {
    map[record.id] = record.done || {};
  });
  return map;
}

