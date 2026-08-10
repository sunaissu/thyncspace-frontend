const DATABASE_NAME = "thyncspace-browser-drafts";
const DATABASE_VERSION = 1;
const STORE_NAME = "private-note-drafts";

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
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "noteId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
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
