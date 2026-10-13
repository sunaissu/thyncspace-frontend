export interface ArchiveRecord { kind: "note" | "attachment"; id: string; data: Record<string, unknown> }
export interface ArchivePreview { records: ArchiveRecord[]; digest: string; notes: number; files: number; bytes: number; trashed: number; }
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, "0")).join("");
export async function parseWorkspaceArchive(stream: ReadableStream<Uint8Array>): Promise<ArchivePreview> {
  const reader = stream.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "", bytes = 0, started = false, complete = false, notes = 0, files = 0, trashed = 0, digest = "";
  const records: ArchiveRecord[] = [], hashes: string[] = [], ids = new Set<string>();
  const line = async (text: string) => {
    if (!text.trim()) throw new Error("The archive contains an empty record.");
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value) || complete) throw new Error("Invalid archive record order.");
    if (!started) { if (value.kind !== "manifest" || value.format !== "thyncspace-workspace" || value.version !== 1) throw new Error("Choose a ThyncSpace workspace archive, version 1."); started = true; return; }
    if (value.kind === "complete") {
      digest = await hash(hashes.join(""));
      if (value.records !== records.length || value.notes !== notes || value.files !== files || value.digest !== digest) throw new Error("The archive is incomplete or its checksum does not match.");
      complete = true; return;
    }
    if (!["note", "attachment"].includes(value.kind) || typeof value.id !== "string" || !/^[a-f0-9]{24}$/.test(value.id) || !value.data || typeof value.data !== "object" || Array.isArray(value.data)) throw new Error("Unsupported archive record.");
    const key = value.kind + ":" + value.id;
    if (ids.has(key)) throw new Error("The archive has duplicate record IDs."); ids.add(key);
    if (value.kind === "note") { if (++notes > 1000) throw new Error("An archive can contain at most 1,000 notes."); if (value.data.status === "trashed") trashed++; }
    else if (++files > 100) throw new Error("An archive can contain at most 100 attachments.");
    hashes.push(await hash(JSON.stringify(value)) + "\n"); records.push(value);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength; if (bytes > 176 * 1024 * 1024) throw new Error("The archive exceeds 175 MiB plus its manifest.");
      pending += decoder.decode(value, { stream: true });
      let end; while ((end = pending.indexOf("\n")) !== -1) { if (end > 4 * 1024 * 1024) throw new Error("An archive record is too large."); await line(pending.slice(0, end).replace(/\r$/, "")); pending = pending.slice(end + 1); }
      if (pending.length > 4 * 1024 * 1024) throw new Error("An archive record is too large.");
    }
    pending += decoder.decode(); if (pending) await line(pending);
    if (!started || !complete) throw new Error("The archive download was interrupted. No complete archive was found.");
    return { records, digest, notes, files, bytes, trashed };
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
export function serializeWorkspaceArchive(value: ArchivePreview) {
  return new Blob([
    JSON.stringify({ kind: "manifest", format: "thyncspace-workspace", version: 1 }) + "\n",
    ...value.records.map(record => JSON.stringify(record) + "\n"),
    JSON.stringify({ kind: "complete", records: value.records.length, notes: value.notes, files: value.files, digest: value.digest }) + "\n",
  ], { type: "application/x-ndjson" });
}

export function archiveBatch(records: ArchiveRecord[], start: number) {
  const batch: ArchiveRecord[] = []; let bytes = 0;
  for (const record of records.slice(start, start + 20)) { const size = new TextEncoder().encode(JSON.stringify(record)).length; if (batch.length && bytes + size > 4 * 1024 * 1024) break; batch.push(record); bytes += size; }
  return batch;
}
