import { useEffect, useRef, useState } from "react";
import type { Note } from "../model/note";
import * as Api from "../util/fetch";
import PdfPreview from "./pdfPreview";

const size = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MiB` : `${Math.ceil(bytes / 1024)} KiB`;
const download = (blob: Blob, name: string) => { const url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); };
function Preview({ file }: { file: Api.AttachmentFile }) {
  const [blob, setBlob] = useState<Blob | null>(null), [url, setUrl] = useState(""), [text, setText] = useState(""), [error, setError] = useState("");
  useEffect(() => {
    let active = true, objectUrl = "";
    Api.fetchAttachmentContent(file.id).then(async value => {
      const text = file.mime === "text/plain" ? await value.text() : "";
      if (!active) return;
      setBlob(value); setText(text.slice(0, 50000)); objectUrl = URL.createObjectURL(value); setUrl(objectUrl);
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Could not load the file."); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file.id, file.mime]);
  return <section className="attachment-preview" aria-label={`Preview ${file.name}`}>
    <h3>{file.name}</h3>{error && <p role="alert">{error}</p>}{!blob && !error && <p role="status">Loading preview…</p>}
    {blob && <><button type="button" className="btn-ghost" onClick={() => download(blob, file.name)}>Download file</button>
      {file.mime.startsWith("image/") && <img src={url} alt={file.name} />}
      {file.mime === "text/plain" && <><pre>{text}</pre>{blob.size > 50000 && <small>Preview shows up to 50,000 characters. Download for the full text.</small>}</>}
      {file.mime === "application/pdf" && <PdfPreview blob={blob} />}</>}
  </section>;
}
export default function AttachmentLibrary({ owner, notes, initialNoteId, onOpenNote, onClose }: { owner: string; notes: Note[]; initialNoteId?: string; onOpenNote: (id: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), generation = useRef(0), alive = useRef(true);
  const [library, setLibrary] = useState<Api.AttachmentLibraryData | null>(null), [noteId, setNoteId] = useState(initialNoteId ?? ""), [scope, setScope] = useState("mine"), [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Api.AttachmentFile | null>(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("");
  const note = notes.find(item => item._id === noteId), editable = note && (note.owner === owner || note.sharedWith.some(item => item.userId === owner && item.permission === "editor"));
  const reload = async () => {
    const current = ++generation.current; setLoading(true);
    try { const data = await Api.fetchAttachments(query, scope === "note" ? noteId : undefined); if (alive.current && generation.current === current) setLibrary(data); }
    catch (error) { if (alive.current && generation.current === current) setError(error instanceof Error ? error.message : "Could not load attachments."); }
    finally { if (alive.current && generation.current === current) setLoading(false); }
  };
  useEffect(() => { alive.current = true; const node = dialog.current; node?.showModal(); return () => { alive.current = false; node?.close(); }; }, []);
  useEffect(() => {
    const current = ++generation.current; setLoading(true); setError(""); setSelected(null); setLibrary(null);
    const timer = setTimeout(() => { Api.fetchAttachments(query, scope === "note" ? noteId : undefined).then(data => { if (alive.current && generation.current === current) setLibrary(data); }).catch(error => { if (alive.current && generation.current === current) setError(error instanceof Error ? error.message : "Could not load attachments."); }).finally(() => { if (alive.current && generation.current === current) setLoading(false); }); }, 200);
    return () => { clearTimeout(timer); };
  }, [query, scope, noteId]);
  const mutate = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return; setBusy(true); setError(""); setStatus("");
    try { await action(); if (alive.current) { setStatus(message); setSelected(null); await reload(); } }
    catch (error) { if (alive.current) setError(error instanceof Error ? error.message : "Could not update attachments."); }
    finally { if (alive.current) setBusy(false); }
  };
  const upload = (file: File) => void mutate(async () => {
    if (file.size > 2 * 1024 * 1024) throw new Error("Use a file no larger than 2 MiB.");
    const mime = file.type || (/\.txt$/i.test(file.name) ? "text/plain" : "");
    if (!["image/png", "image/jpeg", "image/webp", "text/plain", "application/pdf"].includes(mime)) throw new Error("Choose a PNG, JPEG, WebP, PDF, or UTF-8 text file.");
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("Could not read this file.")); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.readAsDataURL(file); });
    await Api.uploadAttachment(file.name, mime, data); setScope("mine"); setQuery("");
  }, "File saved privately. Link it to a note when you want its collaborators to access it.");
  return <dialog ref={dialog} className="attachment-dialog" aria-labelledby="attachments-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><div><h2 id="attachments-title">Attachments</h2><p>Keep files together and link them to your notes.</p></div><button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>Close</button></header>
    {library && <p className="attachment-usage">Your storage: {size(library.usage.bytes)} / {size(library.limits.accountBytes)} · {library.usage.count} / {library.limits.count} files</p>}
    <div className="attachment-actions"><label>Upload file<input type="file" disabled={busy} accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,.txt" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) upload(file); }} /></label><small>Up to 2 MiB each. Static images, PDF, or UTF-8 text. Images lose embedded metadata.</small></div>
    <div className="attachment-filters"><label>Show<select aria-label="Show" disabled={busy} value={scope} onChange={event => setScope(event.target.value)}><option value="mine">My files</option><option value="note" disabled={!noteId}>Files linked to selected note</option></select></label><label>Selected note<select aria-label="Selected note" disabled={busy} value={noteId} onChange={event => setNoteId(event.target.value)}><option value="">Choose a note</option>{notes.map(note => <option key={note._id} value={note._id}>{note.title}</option>)}</select></label><label>Search files<input maxLength={120} disabled={busy} value={query} onChange={event => setQuery(event.target.value)} /></label><button type="button" className="btn-ghost" disabled={busy || loading} onClick={() => void reload()}>Refresh</button></div>
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}{loading && <p role="status">Loading files…</p>}
    <div className="attachment-layout"><section aria-label="File list">{!loading && library?.files.map(file => <article className="attachment-file" key={file.id}>
      <button type="button" className="attachment-file-name" aria-pressed={selected?.id === file.id} onClick={() => setSelected(file)}>{file.name}</button><small>{size(file.bytes)} · {file.mime} · {file.owner === owner ? "Your file" : "Shared through a note"}</small>
      <div className="attachment-actions"><button type="button" className="btn-ghost" onClick={() => setSelected(file)}>Preview</button>
        {file.owner === owner && editable && !file.references.some(ref => ref.noteId === noteId) && <button type="button" className="btn-ghost" disabled={busy} onClick={() => { if (window.confirm(`Link this file to “${note!.title}”? Everyone who can read that note will be able to download it, including future collaborators.`)) void mutate(() => Api.referenceAttachment(file.id, noteId, false), "File linked to note."); }}>Link to selected note</button>}
        {file.owner === owner && <button type="button" className="btn-ghost" disabled={busy} onClick={() => { if (window.confirm(`Permanently delete “${file.name}” and remove it from every linked note?`)) void mutate(() => Api.deleteAttachment(file.id), "File deleted."); }}>Delete file</button>}
      </div><ul>{file.references.map(ref => <li key={ref.noteId}><button type="button" className="btn-ghost" disabled={!notes.some(note => note._id === ref.noteId) || busy} onClick={() => { onClose(); onOpenNote(ref.noteId); }}>{ref.title}</button>{(file.owner === owner || (ref.noteId === noteId && editable)) && <button type="button" className="btn-ghost" aria-label={`Unlink from ${ref.title}`} disabled={busy} onClick={() => void mutate(() => Api.referenceAttachment(file.id, ref.noteId, true), "File unlinked from note.")}>Unlink</button>}</li>)}</ul>
    </article>)}{!loading && !library?.files.length && <p>No files for this selection.</p>}{library?.truncated && <p>Showing 100 files. Narrow your search to find more.</p>}</section>
      {selected ? <Preview key={selected.id} file={selected} /> : <div className="attachment-empty">Select a file to preview it.</div>}
    </div>
  </dialog>;
}
