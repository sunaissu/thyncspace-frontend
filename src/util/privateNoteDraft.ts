const DATABASE_NAME = "thyncspace-browser-drafts";
const DATABASE_VERSION = 2;
// Retain the legacy store without reading unscoped drafts into another account.
const STORE_NAME = "private-note-drafts-v2";
// Failed writes must survive in-app navigation when IndexedDB is unavailable.
const memoryDrafts = new Map<string, PrivateNoteDraft>();

export interface PrivateNoteDraft {
  baseRevisionKey: string;
  contentRevisionKey: string;
  noteId: string;
  supersededByRevisionKey?: string;
  updatedAt: string;
  value: string;
}

const getIndexedDb = () =>
  typeof window === "undefined" ? undefined : window.indexedDB;

const fallbackRevisionKey = (value: string) => {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `fallback:${value.length}:${(first >>> 0).toString(16)}:${(
    second >>> 0
  ).toString(16)}`;
};

export async function privateNoteRevisionKey(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return fallbackRevisionKey(value);

  try {
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } catch {
    return fallbackRevisionKey(value);
  }
}

const isPrivateNoteDraft = (value: unknown): value is PrivateNoteDraft => {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Partial<PrivateNoteDraft>;
  return (
    typeof draft.baseRevisionKey === "string" &&
    typeof draft.contentRevisionKey === "string" &&
    typeof draft.noteId === "string" &&
    typeof draft.updatedAt === "string" &&
    typeof draft.value === "string" &&
    (draft.supersededByRevisionKey === undefined ||
      typeof draft.supersededByRevisionKey === "string")
  );
};

const openDatabase = (): Promise<IDBDatabase | null> => {
  const indexedDb = getIndexedDb();
  if (!indexedDb) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Close older Thyncspace tabs to upgrade browser draft storage"));
    };
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "noteId" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) { database.close(); return; }
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
};

const waitForTransaction = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });

export async function readPrivateNoteDraft(
  noteId: string,
): Promise<PrivateNoteDraft | null> {
  if (memoryDrafts.has(noteId)) return memoryDrafts.get(noteId)!;
  const database = await openDatabase();
  if (!database) return null;

  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(noteId);
    const result = await new Promise<unknown>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as unknown);
    });
    await waitForTransaction(transaction);
    return isPrivateNoteDraft(result) ? result : null;
  } finally {
    database.close();
  }
}

export async function writePrivateNoteDraft(
  draft: PrivateNoteDraft,
): Promise<boolean> {
  memoryDrafts.set(draft.noteId, { ...draft });
  const database = await openDatabase();
  if (!database) return false;

  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(draft);
    await waitForTransaction(transaction);
    return true;
  } finally {
    database.close();
  }
}

export async function deletePrivateNoteDraftIfContentRevision(
  noteId: string,
  contentRevisionKey: string,
): Promise<boolean> {
  if (memoryDrafts.get(noteId)?.contentRevisionKey === contentRevisionKey) memoryDrafts.delete(noteId);
  const database = await openDatabase();
  if (!database) return false;

  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(noteId);
    let deleted = false;
    request.onsuccess = () => {
      const draft = request.result as unknown;
      if (
        isPrivateNoteDraft(draft) &&
        draft.contentRevisionKey === contentRevisionKey
      ) {
        store.delete(noteId);
        deleted = true;
      }
    };
    await waitForTransaction(transaction);
    return deleted;
  } finally {
    database.close();
  }
}

export async function markPrivateNoteDraftSuperseded(
  noteId: string,
  serverRevisionKey: string,
): Promise<boolean> {
  const database = await openDatabase();
  if (!database) return false;

  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(noteId);
    let marked = false;
    request.onsuccess = () => {
      const draft = request.result as unknown;
      if (
        isPrivateNoteDraft(draft) &&
        draft.contentRevisionKey !== serverRevisionKey
      ) {
        store.put({
          ...draft,
          supersededByRevisionKey: serverRevisionKey,
        });
        marked = true;
      }
    };
    await waitForTransaction(transaction);
    return marked;
  } finally {
    database.close();
  }
}

/** Account and session keys prevent concurrent tabs from overwriting recovery. */
export const privateDraftPrefix = (accountId: string, noteId: string) =>
  JSON.stringify([accountId, noteId]) + ":";

export async function listPrivateNoteDrafts(accountId: string, noteId: string): Promise<PrivateNoteDraft[]> {
  const prefix = privateDraftPrefix(accountId, noteId);
  const memory = [...memoryDrafts.values()].filter(draft => draft.noteId.startsWith(prefix));
  const database = await openDatabase().catch(() => null);
  if (!database) return memory;
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const completion = waitForTransaction(transaction);
    const request = transaction.objectStore(STORE_NAME).getAll(IDBKeyRange.bound(prefix, prefix + "\uffff"));
    const results = await new Promise<unknown[]>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    await completion;
    const combined = new Map(results.filter(isPrivateNoteDraft).map(draft => [draft.noteId, draft]));
    memory.forEach(draft => combined.set(draft.noteId, draft));
    return [...combined.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } finally { database.close(); }
}

/** Call only after the authenticated API has confirmed this account owns the private note. */
export async function migrateLegacyPrivateNoteDraft(accountId: string, noteId: string): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  try {
    const legacyStore = "private-note-drafts";
    if (!database.objectStoreNames.contains(legacyStore)) return;
    const transaction = database.transaction([legacyStore, STORE_NAME], "readwrite");
    const complete = waitForTransaction(transaction);
    const oldStore = transaction.objectStore(legacyStore);
    const request = oldStore.get(noteId);
    request.onsuccess = () => {
      const draft: unknown = request.result;
      if (!isPrivateNoteDraft(draft)) return;
      const id = privateDraftPrefix(accountId, noteId) + "legacy";
      const destination = transaction.objectStore(STORE_NAME);
      const existing = destination.get(id);
      existing.onsuccess = () => {
        if (existing.result) return;
        destination.put({ ...draft, noteId: id });
        oldStore.delete(noteId);
      };
    };
    await complete;
  } finally { database.close(); }
}
