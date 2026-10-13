import { useEffect, useRef, useState } from "react";
import type { Note } from "../model/note";
import * as Api from "../util/fetch";

export default function SharedNotebooks({ owner, notes, blockedNotes, onUpdated, onOpenNote, onClose }: { owner: string; notes: Note[]; blockedNotes: string[]; onUpdated: () => Promise<void>; onOpenNote: (note: Note) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), active = useRef(true);
  const [list, setList] = useState<Api.SharedNotebookList | null>(null), [selected, setSelected] = useState(""), [book, setBook] = useState<Api.SharedNotebook | null>(null), [cursor, setCursor] = useState("");
  const [name, setName] = useState(""), [newName, setNewName] = useState(""), [identifier, setIdentifier] = useState(""), [permission, setPermission] = useState<"viewer" | "editor">("viewer"), [noteId, setNoteId] = useState("");
  const [requestId, setRequestId] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  useEffect(() => { active.current = true; const node = dialog.current; node?.showModal(); setRequestId(crypto.randomUUID()); return () => { active.current = false; node?.close(); }; }, []);
  useEffect(() => {
    let current = true; setList(null);
    Api.fetchSharedNotebooks(cursor).then(value => { if (current) setList(value); }).catch(error => { if (current) setError(error instanceof Error ? error.message : "Could not load shared notebooks."); });
    return () => { current = false; };
  }, [cursor, refresh]);
  useEffect(() => {
    let current = true; setBook(null); setName(""); if (!selected) return;
    Api.fetchSharedNotebook(selected).then(value => { if (current) { setBook(value); setName(value.name); } }).catch(error => { if (current) setError(error instanceof Error ? error.message : "Notebook unavailable."); });
    return () => { current = false; };
  }, [selected, refresh]);
  const waitingForSave = Boolean(book?.notes.some(note => blockedNotes.includes(note.id))) || blockedNotes.includes(noteId);
  const run = async (input?: Omit<Api.NotebookAction, "expectedRevision">) => {
    if (busy || (input && (!book || waitingForSave))) return;
    if (input && ["attach", "member"].includes(input.action) && !window.confirm(input.action === "attach" ? "Add the saved note to this notebook? Every notebook member will get access to its document or board, linked attachments and discussions." : "Apply this person's access to every note in this notebook?")) return;
    if (input && ["detach", "delete", "remove-member"].includes(input.action) && !window.confirm(input.action === "delete" ? "Delete this notebook? Its notes will remain in your library and become private." : input.action === "detach" ? "Detach this note and remove all notebook members' access to it?" : "Remove this person's access to every note in the notebook?")) return;
    setBusy(true); setError("");
    try {
      if (!input) { const result = await Api.createSharedNotebook(requestId, newName.trim()); if (active.current) { setSelected(result.id); setNewName(""); setRequestId(crypto.randomUUID()); } }
      else {
        const extra = input.action === "attach" ? { expectedContentRevision: (await Api.fetchNote(input.noteId!)).contentRevision ?? 0 } : {};
        const result = await Api.changeSharedNotebook(book!.id, { ...input, ...extra, expectedRevision: book!.revision });
        if (active.current) { if (result.removed) { setSelected(""); setBook(null); } setIdentifier(""); setNoteId(""); }
      }
      if (active.current) setRefresh(value => value + 1);
      await onUpdated();
    } catch (error) { if (active.current) setError(error instanceof Error ? error.message : "Could not update the notebook. Refresh before retrying."); }
    finally { if (active.current) setBusy(false); }
  };
  const openNote = async (id: string) => { if (busy) return; setBusy(true); try { const note = await Api.fetchNote(id); if (active.current) { onClose(); onOpenNote(note); } } catch (error) { if (active.current) setError(error instanceof Error ? error.message : "This note is unavailable."); } finally { if (active.current) setBusy(false); } };
  return <dialog ref={dialog} className="notebook-dialog" aria-labelledby="notebook-heading" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><h2 id="notebook-heading">Shared notebooks</h2><button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>Close notebooks</button></header>
    <p>Membership applies to every contained document and board. Calculators stay private. Your personal folder labels remain separate.</p>
    <div className="notebook-actions"><button type="button" className="btn-ghost" disabled={busy} onClick={() => { setError(""); setRefresh(value => value + 1); }}>Refresh notebooks</button></div>
    {error && <p role="alert">{error}</p>}
    <div className="notebook-layout"><nav aria-label="Shared notebook list">
      {!list && !error && <p role="status">Loading notebooks...</p>}{list?.entries.length === 0 && <p>No shared notebooks yet.</p>}
      {list?.entries.map(entry => <button type="button" key={entry.id} disabled={busy} aria-current={selected === entry.id ? "true" : undefined} onClick={() => { setSelected(entry.id); setError(""); setIdentifier(""); setNoteId(""); }}><strong>{entry.name}</strong><small>{entry.ownerName} · {entry.permission} · {entry.noteCount} notes</small></button>)}
      <div className="notebook-actions">{cursor && <button type="button" className="btn-ghost" disabled={busy} onClick={() => setCursor("")}>First notebooks</button>}{list?.nextCursor && <button type="button" className="btn-ghost" disabled={busy} onClick={() => setCursor(list.nextCursor!)}>More notebooks</button>}</div>
      <form onSubmit={event => { event.preventDefault(); void run(); }}><label>New notebook name<input value={newName} maxLength={80} disabled={busy} onChange={event => setNewName(event.target.value)} /></label><button type="submit" className="btn-primary" disabled={busy || !newName.trim()}>Create notebook</button></form>
    </nav><section aria-label="Notebook details">
      {!book && <p>{selected ? "Choose Refresh notebooks if this notebook is unavailable." : "Choose or create a shared notebook."}</p>}
      {book && <><h3>{book.name}</h3><p>Owned by {book.ownerName}. {book.notes.length}/100 notes and {book.members.length}/100 members.</p>
        {waitingForSave && <p role="status">Wait for the open notes to show Saved before changing notebook access. Unsent drafts in other tabs stay local and may need recovery after sharing changes.</p>}
        {book.isOwner && <form className="notebook-inline" onSubmit={event => { event.preventDefault(); void run({ action: "rename", name }); }}><label>Notebook name<input value={name} maxLength={80} disabled={busy} onChange={event => setName(event.target.value)} /></label><button className="btn-ghost" type="submit" disabled={busy || waitingForSave || !name.trim() || name.trim() === book.name}>Rename notebook</button></form>}
        <h4>Members</h4><ul className="notebook-members">{book.members.map(member => <li key={member.id}><strong>{member.name}</strong><span>{member.permission}</span>{book.isOwner && <div className="notebook-actions"><button type="button" className="btn-ghost" disabled={busy || waitingForSave} onClick={() => void run({ action: "member", memberId: member.id, permission: member.permission === "editor" ? "viewer" : "editor" })}>{member.permission === "editor" ? "Make viewer" : "Make editor"}</button><button type="button" className="btn-ghost" disabled={busy || waitingForSave} onClick={() => void run({ action: "remove-member", memberId: member.id })}>Remove member</button></div>}</li>)}</ul>{!book.members.length && <p>Only the owner has access.</p>}
        {book.isOwner && <form className="notebook-inline" onSubmit={event => { event.preventDefault(); void run({ action: "member", identifier, permission }); }}><label>Confirmed username or verified email<input value={identifier} disabled={busy} maxLength={254} onChange={event => setIdentifier(event.target.value)} /></label><label>Member access<select aria-label="Member access" value={permission} disabled={busy} onChange={event => setPermission(event.target.value as "viewer" | "editor")}><option value="viewer">Viewer</option><option value="editor">Editor</option></select></label><button type="submit" className="btn-primary" disabled={busy || waitingForSave || !identifier.trim()}>Add member</button></form>}
        <h4>Notes</h4><ul className="notebook-notes">{book.notes.map(note => <li key={note.id}><button type="button" className="btn-ghost" disabled={busy} onClick={() => void openNote(note.id)}>{note.title}</button><small>{note.type}</small>{book.isOwner && <button type="button" className="btn-ghost" disabled={busy || waitingForSave} onClick={() => void run({ action: "detach", noteId: note.id })}>Detach note</button>}</li>)}</ul>
        {book.isOwner && <><form className="notebook-inline" onSubmit={event => { event.preventDefault(); void run({ action: "attach", noteId }); }}><label>Private note to add<select aria-label="Private note to add" value={noteId} disabled={busy} onChange={event => setNoteId(event.target.value)}><option value="">Choose a saved private note</option>{notes.filter(note => note.owner === owner && !note.sharedNotebookId && !note.sharedWith.length).map(note => <option key={note._id} value={note._id} disabled={blockedNotes.includes(note._id)}>{note.title}{blockedNotes.includes(note._id) ? " (waiting for save)" : ""}</option>)}</select></label><button type="submit" className="btn-primary" disabled={busy || waitingForSave || !noteId || book.notes.length >= 100}>Add note</button></form><p className="notebook-hint">Remove any per-note sharing before attaching a note. Attached notes use only notebook membership; detach them to return to private or per-note sharing.</p><button type="button" className="btn-ghost" disabled={busy || waitingForSave} onClick={() => void run({ action: "delete", confirmation: book.id })}>Delete notebook, keep notes</button></>}
      </>}
    </section></div>
  </dialog>;
}
