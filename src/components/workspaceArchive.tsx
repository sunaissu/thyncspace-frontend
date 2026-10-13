import { useEffect, useRef, useState } from "react";
import * as Api from "../util/fetch";
import { archiveBatch, parseWorkspaceArchive, serializeWorkspaceArchive, type ArchivePreview } from "../util/workspaceArchive";

export default function WorkspaceArchive({ owner, canExport, onClose, onRestored }: { owner: string; canExport: boolean; onClose: () => void; onRestored: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null), active = useRef(true), fileInput = useRef<HTMLInputElement>(null), stop = useRef(false);
  const [preview, setPreview] = useState<ArchivePreview | null>(null), [job, setJob] = useState<Api.ArchiveStatus | null>(null), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [canStop, setCanStop] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState(""), [confirmed, setConfirmed] = useState(false);
  const load = async () => { const value = await Api.fetchArchiveStatus(owner); if (active.current) { setJob(value); setLoaded(true); } return value; };
  useEffect(() => { active.current = true; const node = dialog.current; node?.showModal(); Api.fetchArchiveStatus(owner).then(value => { if (active.current) { setJob(value); setLoaded(true); } }).catch(error => { if (active.current) setError(error instanceof Error ? error.message : "Could not load archive progress."); }); return () => { active.current = false; stop.current = true; node?.close(); }; }, [owner]);
  useEffect(() => { if (!busy) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [busy]);
  const perform = async (work: () => Promise<void>, stoppable = false) => { if (busy) return; setBusy(true); setCanStop(stoppable); setError(""); stop.current = false; try { await work(); } catch (error) { if (active.current) setError(error instanceof Error ? error.message : "The archive action failed."); } finally { if (active.current) { setBusy(false); setCanStop(false); } } };
  const download = () => perform(async () => {
    const stream = await Api.downloadWorkspaceArchive(owner), value = await parseWorkspaceArchive(stream);
    if (!active.current) return;
    const url = URL.createObjectURL(serializeWorkspaceArchive(value)), anchor = document.createElement("a"); anchor.href = url; anchor.download = "thyncspace-workspace.jsonl"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setStatus(`Downloaded ${value.notes} notes and ${value.files} files with a verified completion record.`);
  });
  const read = (file?: File) => perform(async () => { setPreview(null); setConfirmed(false); if (!file) return; if (file.size > 176 * 1024 * 1024) throw new Error("Choose an archive no larger than 175 MiB plus its manifest."); const value = await parseWorkspaceArchive(file.stream()); if (active.current) { setPreview(value); setStatus("Review the contents before uploading. Existing notes stay unchanged."); } });
  const restore = () => perform(async () => {
    if (!preview || !confirmed || !loaded) return;
    let current = await load();
    if (current && current.digest !== preview.digest) throw new Error("Dismiss the previous import before choosing a different archive.");
    if (!current) current = await Api.changeArchive(owner, { action: "start", clientId: crypto.randomUUID(), digest: preview.digest, records: preview.records.length });
    if (!current) throw new Error("The archive import did not start.");
    if (active.current) setJob(current);
    while (current.status !== "complete" && current.next < preview.records.length) {
      if (stop.current || !active.current) return;
      const before = current.next, requestId = current.clientId;
      current = await Api.changeArchive(owner, { action: "batch", clientId: requestId, index: before, records: archiveBatch(preview.records, before) });
      if (!current || current.next <= before || current.digest !== preview.digest || current.clientId !== requestId || current.expected !== preview.records.length) throw new Error("Archive progress changed unexpectedly. Refresh before continuing.");
      if (active.current) { setJob(current); setStatus(`Uploaded ${current.next}/${current.expected} records. Nothing is visible until the restore commits.`); }
    }
    if (stop.current || !active.current) return;
    if (current.status !== "complete") current = await Api.changeArchive(owner, { action: "commit", clientId: current.clientId, confirmation: "RESTORE PRIVATE COPIES" });
    if (active.current) { setJob(current); setConfirmed(false); setStatus("Restore completed. New notes are private; originally trashed notes remain in Trash."); await onRestored(); }
  }, true);
  const close = () => { if (!busy) onClose(); };
  return <dialog ref={dialog} className="archive-dialog" aria-labelledby="archive-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2 id="archive-title">Workspace archive</h2><button type="button" className="btn-ghost" disabled={busy} onClick={close}>Close archive</button></header>
    <p>Export your documents, boards, folders, tags, linked sources and files, including archived notes and Trash. Save open edits first.</p>
    <details><summary>What this archive includes</summary><p>Each record contains its saved data when read. Notes owned by someone else are excluded. Sharing permissions, discussions, history, account settings, local study cards and calculator contents are separate. Account privacy provides the broader account-data export.</p></details>
    <button type="button" className="btn-primary" disabled={busy || !canExport} onClick={() => void download()}>Download workspace archive</button>{!canExport && <p>Wait for open notes to show Saved before exporting.</p>}
    <section><h3>Restore private copies</h3><p>Choose an archive to preview. Restore keeps your existing notes and reconnects links between included copies. All restored notes are private. Links to sources outside the archive still need their original permissions.</p>
      <label>Workspace archive file<input ref={fileInput} type="file" accept=".jsonl,application/x-ndjson" disabled={busy} onChange={event => { void read(event.target.files?.[0]); event.target.value = ""; }} /></label>
      {preview && <div className="archive-preview" aria-label="Archive preview"><p>{preview.notes} {preview.notes === 1 ? "note" : "notes"} ({preview.trashed} in Trash), {preview.files} {preview.files === 1 ? "attachment" : "attachments"}, {(preview.bytes / 1048576).toFixed(2)} MiB.</p><details><summary>Included records</summary><ul>{preview.records.map(record => <li key={record.kind + record.id}>{record.kind}: {String(record.data.title ?? record.data.name ?? record.id)}</li>)}</ul></details></div>}
      {job && <div className="archive-progress" role="status"><p>{job.status === "complete" ? `Restored ${job.notes} ${job.notes === 1 ? "note" : "notes"} and ${job.files} ${job.files === 1 ? "file" : "files"} (${job.reusedFiles} existing files reused).` : `${job.next}/${job.expected} records uploaded. Select the same archive to resume before ${new Date(job.expiresAt).toLocaleString()}.`}</p><button type="button" className="btn-ghost" disabled={busy} onClick={() => { if (window.confirm(job.status === "complete" ? "Dismiss this receipt? Importing this archive again will create another set of copies. Restored notes will remain." : "Cancel this staged import? No existing notes will be removed.")) void perform(async () => { await Api.changeArchive(owner, { action: "cancel", clientId: job.clientId }); setJob(null); setConfirmed(false); setStatus("Import receipt or staged data dismissed. Existing notes remain."); }); }}>{job.status === "complete" ? "Dismiss restore receipt" : "Cancel staged import"}</button></div>}
      <label className="archive-consent"><input type="checkbox" checked={confirmed} disabled={busy || !preview || job?.status === "complete"} onChange={event => setConfirmed(event.target.checked)} />I want to restore these records as new private copies.</label>
      <div className="archive-actions"><button type="button" className="btn-primary" disabled={busy || !preview || !confirmed || !loaded || job?.status === "complete" || Boolean(job && job.digest !== preview.digest)} onClick={() => void restore()}>Restore private copies</button><button type="button" className="btn-ghost" disabled={busy} onClick={() => void perform(async () => { const value = await load(); if (value?.status === "complete") await onRestored(); })}>Refresh import progress</button>{busy && canStop && <button type="button" className="btn-ghost" onClick={() => { stop.current = true; setStatus("Stopping after the current upload. A commit already in progress will finish."); }}>Stop after current request</button>}</div>
    </section>
    <p className="archive-hint">Limits: 1,000 notes, 100 files, 175 MiB encoded records and 50 MiB attachment bytes. Normal account file limits still apply. Staged uploads expire after six hours. Nothing is removed from your original workspace.</p>
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
  </dialog>;
}
