import { useEffect, useState } from "react";
import type { Note } from "../model/note";
import * as Api from "../util/fetch";

export default function NoteLibrary({ note, onRecovered, onOrganizationChange, onClose }: {
  note: Note | null; onRecovered: (note: Note) => void;
  onOrganizationChange: (note: Note) => void; onClose: () => void;
}) {
  const noteId = note?._id;
  const [trash, setTrash] = useState<Note[]>([]);
  const [versions, setVersions] = useState<Api.NoteVersion[]>([]);
  const [notebook, setNotebook] = useState(note?.notebook ?? "");
  const [tags, setTags] = useState(note?.tags?.join(", ") ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let active = true;
    Promise.all([Api.fetchTrash(), noteId ? Api.fetchNoteHistory(noteId) : Promise.resolve([])])
      .then(([deleted, history]) => { if (active) { setTrash(deleted); setVersions(history); } })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : "Could not load library"); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [noteId]);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Could not save changes"); }
    finally { setBusy(false); }
  };
  return <section className="note-library" aria-label="Note library">
    <header><h2>Organize and recover</h2><button className="btn-ghost" type="button" onClick={onClose}>Close</button></header>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Working…</p>}
    {note && <>
      <form onSubmit={event => { event.preventDefault(); void perform(async () => {
        const saved = await Api.updateNoteOrganization(note._id, notebook, tags.split(",").map(tag => tag.trim()).filter(Boolean));
        onOrganizationChange(saved);
      }); }}>
        <label>Notebook<input value={notebook} maxLength={80} onChange={event => setNotebook(event.target.value)} /></label>
        <label>Tags, separated by commas<input value={tags} maxLength={820} onChange={event => setTags(event.target.value)} /></label>
        <button className="btn-primary" disabled={busy}>Save organization</button>
      </form>
      <h3>Recent versions</h3><p>Restore one of the last five saved versions as a new private note.</p>
      {!busy && versions.length === 0 && <p>No earlier versions yet.</p>}
      {versions.map(version => <div className="library-row" key={version.id}><span>{version.title}<small>{new Date(version.savedAt).toLocaleString()}</small></span>
        <button className="btn-ghost" disabled={busy} onClick={() => void perform(async () => onRecovered(await Api.recoverNote(note._id, version.id)))}>Restore copy</button>
      </div>)}
    </>}
    <h3>Trash</h3><p>Restored notes are private. Share them again when ready.</p>
    {!busy && trash.length === 0 && <p>Trash is empty.</p>}
    {trash.map(item => <div className="library-row" key={item._id}><span>{item.title}<small>{item.type}</small></span>
      <button className="btn-ghost" disabled={busy} onClick={() => void perform(async () => {
        const recovered = await Api.recoverNote(item._id); setTrash(current => current.filter(note => note._id !== item._id)); onRecovered(recovered);
      })}>Restore note</button>
    </div>)}
  </section>;
}
