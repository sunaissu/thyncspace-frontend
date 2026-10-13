import { useEffect, useRef, useState } from "react";
import * as Api from "../util/fetch";

const description = (event: Api.NoteActivityEvent) => {
  switch (event.kind) {
    case "embed": return "Updated linked sources";
    case "edit": return "Saved edits";
    case "share": return `Shared with ${event.target ?? "a former account"} as ${event.permission}`;
    case "permission": return `Changed ${event.target ?? "a former account"} to ${event.permission}`;
    case "unshare": return `Removed access for ${event.target ?? "a former account"}`;
    case "restore": return event.sourceVersionId ? "Restored a retained version as this private copy" : "Restored this note from trash";
    case "trash": return "Moved to trash and removed sharing";
    case "organize": return "Updated private organization";
    default: return "Note updated";
  }
};
export default function NoteActivity({ noteId, title, onClose }: { noteId: string; title: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<Api.NoteActivity | null>(null), [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  useEffect(() => {
    let active = true; setData(null); setError("");
    Api.fetchNoteActivity(noteId).then(value => { if (active) setData(value); }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Could not load activity."); });
    return () => { active = false; };
  }, [noteId, refresh]);
  return <dialog ref={dialog} className="note-activity-dialog" aria-labelledby="note-activity-heading" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><h2 id="note-activity-heading">Note activity</h2><p>{title}</p></div><button type="button" className="btn-ghost" onClick={onClose}>Close activity</button></header>
    <p>Visible only to the owner. Up to 100 recent events are retained from this update onwards. A live save may combine changes from several people.</p>
    <button type="button" className="btn-ghost" onClick={() => setRefresh(value => value + 1)}>Refresh activity</button>
    {!data && !error && <p role="status">Loading activity…</p>}{error && <p role="alert">{error}</p>}
    {data && <><p>Note created {new Date(data.createdAt).toLocaleString()}.</p><ol>{data.events.map(event => <li key={event.id}><strong>{description(event)}</strong><p>{event.actor} · <time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time></p></li>)}</ol>{data.events.length === 0 && <p>No activity has been recorded yet.</p>}</>}
  </dialog>;
}
