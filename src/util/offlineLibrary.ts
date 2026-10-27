import type { Note } from "../model/note";

export interface OfflineNote {
  account: string; username: string; noteId: string; title: string; type: "document" | "whiteboard" | "documentation";
  baseContent: string; baseRevision: number; pending: string | null; editable: boolean;
  revision: number; cachedAt: string; changedAt: string; error?: string;
}
const DATABASE = "thyncspace-offline-library", STORE = "notes", MAX_BYTES = 20 * 1024 * 1024;
const bytes = (value: OfflineNote) => new TextEncoder().encode(value.baseContent + (value.pending ?? "")).length;
function open(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) return Promise.reject(new Error("Offline storage is unavailable in this browser."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1); let blocked = false;
    request.onupgradeneeded = () => { const store = request.result.createObjectStore(STORE, { keyPath: ["account", "noteId"] }); store.createIndex("account", "account"); };
    request.onblocked = () => { blocked = true; reject(new Error("Close older tabs to update offline storage.")); };
    request.onerror = () => reject(request.error ?? new Error("Could not open offline storage."));
    request.onsuccess = () => { if (blocked) { request.result.close(); return; } request.result.onversionchange = () => request.result.close(); resolve(request.result); };
  });
}
function valid(value: unknown): value is OfflineNote {
  if (!value || typeof value !== "object") return false;
  const note = value as OfflineNote;
  return /^[a-f0-9]{24}$/i.test(note.account) && /^[a-f0-9]{24}$/i.test(note.noteId) && typeof note.username === "string" && typeof note.title === "string" && ["document", "whiteboard", "documentation"].includes(note.type) && typeof note.baseContent === "string" && (note.pending === null || typeof note.pending === "string") && Number.isSafeInteger(note.baseRevision) && note.baseRevision >= 0 && Number.isSafeInteger(note.revision) && note.revision >= 0 && typeof note.editable === "boolean" && typeof note.cachedAt === "string" && typeof note.changedAt === "string" && (note.error === undefined || typeof note.error === "string");
}
export async function listOfflineNotes(account?: string): Promise<OfflineNote[]> {
  const database = await open();
  try { return await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readonly"), store = transaction.objectStore(STORE);
    const request = account ? store.index("account").getAll(account) : store.getAll();
    transaction.onabort = () => reject(transaction.error); transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => { const notes = request.result as unknown[]; if (!notes.every(valid)) reject(new Error("An offline record is invalid. Download the raw recovery data before resetting the offline library.")); else resolve(notes); };
  }); } finally { database.close(); }
}
export async function putOfflineNote(note: OfflineNote, expectedRevision: number | null): Promise<OfflineNote> {
  if (!valid(note) || (new TextEncoder().encode(note.baseContent).length > 1024 * 1024 || new TextEncoder().encode(note.pending ?? "").length > 1024 * 1024)) throw new Error("Offline notes must contain at most 1 MiB of text or board data.");
  const database = await open();
  try { return await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite"), store = transaction.objectStore(STORE); let failure: Error | undefined;
    const saved = { ...note, revision: (expectedRevision ?? -1) + 1, changedAt: new Date().toISOString() };
    const request = store.index("account").getAll(note.account);
    request.onsuccess = () => {
      const entries = request.result as OfflineNote[], current = entries.find(value => value.noteId === note.noteId);
      if ((expectedRevision === null && current) || (expectedRevision !== null && current?.revision !== expectedRevision)) failure = new Error("This offline note changed in another tab. Download your edits, then reload before saving.");
      else if ((!current && entries.length >= 100) || entries.reduce((total, value) => total + (value.noteId === note.noteId ? 0 : bytes(value)), bytes(saved)) > MAX_BYTES) failure = new Error("Offline storage is limited to 100 notes and 20 MiB per account. Remove a cached note first.");
      if (failure) transaction.abort(); else store.put(saved);
    };
    transaction.oncomplete = () => resolve(saved); transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("Offline changes could not be saved.")); transaction.onerror = () => reject(transaction.error);
  }); } finally { database.close(); }
}
export async function cacheOfflineNote(account: string, username: string, note: Note): Promise<OfflineNote> {
  const current = (await listOfflineNotes(account)).find(value => value.noteId === note._id);
  if (current && current.pending !== null) throw new Error("This note has queued offline edits. Resolve them in the offline library before refreshing its cache.");
  return putOfflineNote({ account, username, noteId: note._id, title: note.title, type: note.type, baseContent: typeof note.content === "string" ? note.content : JSON.stringify(note.content), baseRevision: note.contentRevision ?? 0, pending: null, editable: note.owner === account && note.sharedWith.length === 0, revision: 0, cachedAt: new Date().toISOString(), changedAt: new Date().toISOString() }, current?.revision ?? null);
}
export async function deleteOfflineNote(account: string, noteId: string, expectedRevision: number): Promise<void> {
  const database = await open();
  try { await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite"), store = transaction.objectStore(STORE); let conflict = false;
    const request = store.get([account, noteId]); request.onsuccess = () => { if (request.result?.revision !== expectedRevision) { conflict = true; transaction.abort(); } else store.delete([account, noteId]); };
    transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(new Error(conflict ? "This offline note changed in another tab. Reload before removing it." : "Could not remove the offline note.")); transaction.onerror = () => reject(transaction.error);
  }); } finally { database.close(); }
}

/** Raw recovery preserves damaged records without rendering or executing them. */
export async function rawOfflineRecovery(): Promise<unknown[]> {
  const database = await open();
  try { return await new Promise((resolve, reject) => { const transaction = database.transaction(STORE, "readonly"), request = transaction.objectStore(STORE).getAll(); transaction.oncomplete = () => resolve(request.result); transaction.onabort = () => reject(transaction.error); transaction.onerror = () => reject(transaction.error); }); } finally { database.close(); }
}
export async function resetOfflineLibrary(): Promise<void> {
  const database = await open();
  try { await new Promise<void>((resolve, reject) => { const transaction = database.transaction(STORE, "readwrite"); transaction.objectStore(STORE).clear(); transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error); transaction.onerror = () => reject(transaction.error); }); } finally { database.close(); }
}
