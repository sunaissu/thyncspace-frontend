export interface StudyCard {
  id: string; owner: string; revision: number; noteId: string; noteTitle: string;
  question: string; answer: string; source: string; sourceUpdatedAt: string;
  reviewed: number; known: number; updatedAt: string;
}
export type CardDraft = Pick<StudyCard, "question" | "answer" | "source">;
export const MAX_STUDY_CARDS = 200;

/** Drafts quote the selected source, without sending text to another service. */
export function createStudyDrafts(text: string): CardDraft[] {
  if (text.length > 20000) throw new Error("Select at most 20,000 characters for study drafts.");
  const lines = text.replace(/\r\n/g, "\n").split("\n"), cards: CardDraft[] = [];
  let fence = "";
  const add = (question: string, answer: string, source: string) => {
    if (cards.length < 20 && question.trim() && answer.trim() && question.length <= 500 && answer.length <= 4000 && source.length <= 8000 && !cards.some(card => card.question === question.trim() && card.answer === answer.trim())) cards.push({ question: question.trim(), answer: answer.trim(), source });
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index], delimiter = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (delimiter) { if (!fence) fence = delimiter[1]; else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length && !line.slice(delimiter[0].length).trim()) fence = ""; continue; }
    if (fence) continue;
    const question = /^Q:\s*(.+)$/i.exec(line), answer = /^A:\s*(.+)$/i.exec(lines[index + 1] ?? "");
    if (question && answer) { add(question[1], answer[1], line + "\n" + lines[++index]); continue; }
    const term = /^\s*(?:[-*]\s+)?([^:\n]{2,100}):\s+(.{4,4000})$/.exec(line);
    if (term && !/^#{1,6}\s/.test(line)) { add(`What is ${term[1].replace(/\*\*/g, "").trim()}?`, term[2], line); continue; }
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (heading) {
      let end = index + 1; while (end < lines.length && !lines[end].trim()) end++;
      const start = end;
      while (end < lines.length && lines[end].trim() && !/^\s*(?:#|`{3,}|~{3,})/.test(lines[end])) end++;
      const paragraph = lines.slice(start, end).join("\n");
      if (paragraph) add(`Explain ${heading[1].trim()}.`, paragraph, lines.slice(index, end).join("\n"));
    }
  }
  return cards;
}

const DB_NAME = "thyncspace-private-study", STORE = "cards";
const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof window === "undefined" || !window.indexedDB) return reject(new Error("Private study storage is unavailable. Download your draft cards before leaving."));
  let blocked = false;
  const request = window.indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: ["owner", "id"] }).createIndex("owner", "owner");
  request.onsuccess = () => { if (blocked) { request.result.close(); return; } request.result.onversionchange = () => request.result.close(); resolve(request.result); };
  request.onerror = () => reject(request.error ?? new Error("Private study storage could not be opened."));
  request.onblocked = () => { blocked = true; reject(new Error("Close other ThyncSpace tabs before upgrading private study storage.")); };
});
const validText = (value: unknown, limit: number) => typeof value === "string" && value.length <= limit;
const validCard = (value: unknown): value is StudyCard => {
  if (!value || typeof value !== "object") return false;
  const card = value as StudyCard;
  return /^[a-f0-9-]{36}$/i.test(card.id) && /^[a-f0-9]{24}$/i.test(card.owner) && /^[a-f0-9]{24}$/i.test(card.noteId) && validText(card.noteTitle, 200) && validText(card.question, 500) && Boolean(card.question.trim()) && validText(card.answer, 4000) && Boolean(card.answer.trim()) && validText(card.source, 8000) && validText(card.sourceUpdatedAt, 40) && validText(card.updatedAt, 40) && Number.isSafeInteger(card.revision) && card.revision >= 0 && Number.isSafeInteger(card.reviewed) && card.reviewed >= 0 && Number.isSafeInteger(card.known) && card.known >= 0 && card.known <= card.reviewed;
};
export async function listStudyCards(owner: string): Promise<StudyCard[]> {
  const db = await openDb();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).index("owner").getAll(owner);
    request.onsuccess = () => resolve(request.result.filter(validCard).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
export async function writeStudyCard(card: StudyCard, expectedRevision: number | null): Promise<StudyCard> {
  if (!validCard(card)) throw new Error("The study card has invalid or oversized fields.");
  const db = await openDb();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"), store = tx.objectStore(STORE);
    let saved = card, failure: Error | undefined;
    const fail = (message: string) => { failure = new Error(message); tx.abort(); };
    const existing = store.get([card.owner, card.id]);
    existing.onsuccess = () => {
      const current = existing.result as StudyCard | undefined;
      if ((expectedRevision === null && current) || (expectedRevision !== null && (!current || current.revision !== expectedRevision))) return fail("This card changed in another tab. Reload the deck, or save your edits as a new card.");
      const count = store.index("owner").count(card.owner);
      count.onsuccess = () => {
        if (!current && count.result >= MAX_STUDY_CARDS) return fail(`Keep at most ${MAX_STUDY_CARDS} cards in this browser. Export and remove some cards first.`);
        saved = { ...card, revision: (current?.revision ?? -1) + 1, updatedAt: new Date().toISOString() };
        store.put(saved);
      };
    };
    tx.oncomplete = () => resolve(saved);
    tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error("The card could not be saved. Download it before leaving."));
  }); } finally { db.close(); }
}
export async function deleteStudyCard(owner: string, id: string, revision: number) {
  const db = await openDb();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"), store = tx.objectStore(STORE), request = store.get([owner, id]);
    let stale = false;
    request.onsuccess = () => { if (request.result && request.result.revision !== revision) { stale = true; tx.abort(); } else store.delete([owner, id]); };
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(new Error(stale ? "This card changed in another tab. Reload before deleting it." : "The card could not be removed."));
  }); } finally { db.close(); }
}
