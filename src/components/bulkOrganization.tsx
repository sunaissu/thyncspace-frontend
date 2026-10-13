import { useState } from "react";
import type { Note } from "../model/note";
import * as Api from "../util/fetch";

export default function BulkOrganization({ notes, onUpdated }: { notes: Note[]; onUpdated: (notes: Note[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [notebook, setNotebook] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const tags = [...new Set(notes.flatMap(note => note.tags ?? []))].sort();
  const perform = async (operation: Parameters<typeof Api.bulkOrganizeNotes>[0]) => {
    if (busy) return;
    setBusy(true); setError(""); setStatus("");
    let saved = false;
    try {
      const result = await Api.bulkOrganizeNotes(operation);
      saved = true;
      const refreshed = await Api.fetchNotes();
      onUpdated(refreshed); setSelected([]); setStatus(`Updated ${result.affected} notes.`);
    } catch (error) { setError(saved ? "Organization was saved, but the list could not refresh. Reopen the workspace to load it." : error instanceof Error ? error.message : "Organization could not be updated."); }
    finally { setBusy(false); }
  };
  return <details className="bulk-organization"><summary>Move notes and manage tags</summary>
    <p>Notebook paths create nested groups, for example <code>Research/Physics</code>. These settings are private to the owner.</p>
    <label>Find owned notes<input value={search} onChange={event => setSearch(event.target.value)} /></label>
    <div className="bulk-note-choices">{notes.filter(note => note.title.toLowerCase().includes(search.toLowerCase())).map(note => <label key={note._id}><input type="checkbox" disabled={busy || (!selected.includes(note._id) && selected.length >= 100)} checked={selected.includes(note._id)} onChange={event => setSelected(current => event.target.checked ? [...current, note._id] : current.filter(id => id !== note._id))} />{note.title}<small>{note.notebook || "No notebook"}</small></label>)}</div>
    <form onSubmit={event => { event.preventDefault(); void perform({ action: "move", noteIds: selected, notebook }); }}><label>Move selected notes to notebook<input value={notebook} maxLength={80} onChange={event => setNotebook(event.target.value)} placeholder="Research/Physics or blank to unfile" /></label><button className="btn-primary" disabled={busy || !selected.length}>Move {selected.length} notes</button></form>
    <form onSubmit={event => {
      event.preventDefault();
      if (!window.confirm(`Rename “${from}” to “${to.trim()}” across your active notes? Existing copies of the target tag will be merged.`)) return;
      void perform({ action: "rename-tag", from, to });
    }}><label>Existing tag<select value={from} onChange={event => setFrom(event.target.value)}><option value="">Choose a tag</option>{tags.map(tag => <option key={tag} value={tag}>{tag}</option>)}</select></label><label>Rename or merge into<input value={to} maxLength={40} onChange={event => setTo(event.target.value)} /></label><button className="btn-primary" disabled={busy || !from || !to.trim() || from === to.trim().toLowerCase()}>Rename or merge tag</button></form>
    {busy && <p role="status">Updating organization…</p>}{status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
  </details>;
}
