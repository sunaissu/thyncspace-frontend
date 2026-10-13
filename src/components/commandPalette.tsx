import { useEffect, useRef, useState } from "react";
import { noteMatchesSearch, type Note } from "../model/note";

export default function CommandPalette({ notes, onOpenNote, onNewNote, onLibrary, onImport, onStudy, onAttachments, onReminders, onOffline, onSources, onDiscussions, onNotebooks, onAi, onArchive }: {
  notes: Note[]; onOpenNote: (id: string) => void; onNewNote: () => void; onLibrary: () => void; onImport: () => void; onStudy?: () => void; onAttachments?: () => void; onReminders?: () => void; onOffline?: () => void; onSources?: () => void; onDiscussions?: () => void; onNotebooks?: () => void; onAi?: () => void; onArchive?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const show = () => { previousFocus.current = document.activeElement as HTMLElement; setQuery(""); dialog.current?.showModal(); input.current?.focus(); };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "p" && !event.isComposing && !document.querySelector("dialog[open], [aria-modal=true]")) {
        event.preventDefault(); previousFocus.current = document.activeElement as HTMLElement; setQuery(""); dialog.current?.showModal(); input.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const run = (action: () => void) => { dialog.current?.close(); action(); };
  const actions = [...(onArchive ? [{ label: "Workspace archive", run: onArchive }] : []), ...(onAi ? [{ label: "Passage AI actions", run: onAi }] : []), ...(onNotebooks ? [{ label: "Shared notebooks", run: onNotebooks }] : []), ...(onDiscussions ? [{ label: "Discussions and mentions", run: onDiscussions }] : []), { label: "Create a note", run: onNewNote }, { label: "Organize notes and recover trash", run: onLibrary }, { label: "Import Markdown", run: onImport }, ...(onSources ? [{ label: "Linked sources", run: onSources }] : []), ...(onOffline ? [{ label: "Make selected note available offline", run: onOffline }, { label: "Open offline library", run: () => window.open("/offline-library/", "_blank", "noopener,noreferrer") }] : []), ...(onReminders ? [{ label: "Reminders", run: onReminders }] : []), ...(onAttachments ? [{ label: "Attachments", run: onAttachments }] : []), ...(onStudy ? [{ label: "Study tools", run: onStudy }] : [])].filter(action => action.label.toLowerCase().includes(query.toLowerCase()));
  const matches = notes.filter(note => noteMatchesSearch(note, query)).slice(0, 50);
  return <>
    <button className="btn-ghost" type="button" title="Commands (Ctrl/⌘ Shift P)" onClick={show}>Commands</button>
    <dialog ref={dialog} className="workspace-command-palette" aria-labelledby="command-palette-title" onClose={() => previousFocus.current?.isConnected && previousFocus.current.focus()} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div onKeyDown={event => {
        if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>("input, button[data-command]") ?? []);
        const index = controls.indexOf(document.activeElement as HTMLElement);
        event.preventDefault(); controls[(index + (event.key === "ArrowDown" ? 1 : -1) + controls.length) % controls.length]?.focus();
      }}>
        <header><h2 id="command-palette-title">Commands</h2><button type="button" onClick={() => dialog.current?.close()} aria-label="Close commands">×</button></header>
        <input ref={input} aria-label="Find a note or command" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search notes and actions" onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); dialog.current?.querySelector<HTMLButtonElement>("button[data-command]")?.click(); } }} />
        <div className="command-results">{actions.map(action => <button type="button" data-command key={action.label} onClick={() => run(action.run)}>{action.label}<small>Action</small></button>)}
        {matches.map(note => <button type="button" data-command key={note._id} onClick={() => run(() => onOpenNote(note._id))}>{note.title}<small>{note.isArchived ? "Archived " : ""}{note.type}</small></button>)}
        {!actions.length && !matches.length && <p>No matching notes or commands.</p>}</div>
        <small>↑ ↓ to choose · Enter to open · Escape to close · up to 50 notes</small>
      </div>
    </dialog>
  </>;
}
