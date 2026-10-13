import { useEffect, useRef, useState } from "react";
import type { Note } from "../model/note";
import * as Api from "../util/fetch";

export default function Discussions({ owner, notes, initialNoteId, onClose, onOpenNote }: { owner: string; notes: Note[]; initialNoteId?: string; onClose: () => void; onOpenNote: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), active = useRef(true), generation = useRef(0);
  const [scope, setScope] = useState(initialNoteId ?? ""), [filter, setFilter] = useState("unresolved"), [cursor, setCursor] = useState("");
  const [list, setList] = useState<Api.DiscussionList | null>(null), [selected, setSelected] = useState<{ id: string; noteId: string } | null>(null), [thread, setThread] = useState<Api.Discussion | null>(null);
  const [body, setBody] = useState(""), [mentions, setMentions] = useState<string[]>([]), [editing, setEditing] = useState(""), [editRevision, setEditRevision] = useState(0), [requestId, setRequestId] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const dirty = Boolean(body || mentions.length), discard = () => !dirty || window.confirm("Discard the unsent comment changes?");
  const resetDraft = () => { setBody(""); setMentions([]); setEditing(""); setRequestId(crypto.randomUUID()); };
  const close = () => { if (!busy && discard()) onClose(); };
  useEffect(() => { active.current = true; const node = dialog.current; node?.showModal(); setRequestId(crypto.randomUUID()); return () => { active.current = false; node?.close(); }; }, []);
  useEffect(() => { const listener = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", listener); return () => window.removeEventListener("beforeunload", listener); }, [dirty]);
  useEffect(() => {
    let current = true;
    const load = async () => { const request = ++generation.current; try { const value = await Api.fetchDiscussions(scope, filter, cursor); if (current && request === generation.current) setList(value); } catch (error) { if (current && request === generation.current) { setList(null); setThread(null); setError(error instanceof Error ? error.message : "Could not load discussions."); } } };
    void load(); const timer = setInterval(() => void load(), 30000); return () => { current = false; clearInterval(timer); };
  }, [scope, filter, cursor, refresh]);
  useEffect(() => {
    let current = true, request = 0; setThread(null); if (!selected) return;
    const load = async () => { const id = ++request; try { const value = await Api.fetchDiscussion(selected.noteId, selected.id); if (current && id === request) setThread(previous => previous && previous.revision > value.revision ? previous : value); } catch (error) { if (current && id === request) { setThread(null); setError(error instanceof Error ? error.message : "This discussion is unavailable."); } } };
    void load(); const timer = setInterval(() => void load(), 30000); return () => { current = false; clearInterval(timer); };
  }, [selected, refresh]);
  const changeView = (change: () => void) => { if (!busy && discard()) { change(); setList(null); setSelected(null); setThread(null); setCursor(""); setError(""); resetDraft(); } };
  const mutate = async (action: Api.DiscussionAction["action"], postId?: string) => {
    const noteId = selected?.noteId ?? scope; if (busy || !noteId) return;
    if (action === "remove" && !window.confirm("Permanently remove this discussion and all comments?")) return;
    if (action === "delete-post" && !window.confirm("Delete your comment?")) return;
    setBusy(true); setError(""); generation.current++;
    try {
      const result = await Api.changeDiscussion(noteId, selected?.id, { action, id: postId ?? requestId, body, mentions, expectedRevision: action === "edit" ? editRevision : thread?.revision, confirmation: action === "remove" ? selected?.id : undefined });
      if (active.current) { if (["create", "reply", "edit"].includes(action)) resetDraft(); if (result.removed) { resetDraft(); setSelected(null); setThread(null); } else setSelected({ noteId, id: result.id }); setRefresh(value => value + 1); }
    } catch (error) { if (active.current) setError(error instanceof Error ? error.message : "Could not change the discussion. Your draft is retained."); }
    finally { if (active.current) setBusy(false); }
  };
  const canCompose = selected ? thread?.canEdit && (!thread.resolved || editing) : list?.canEdit && scope;
  const members = thread?.members ?? list?.members ?? [];
  return <dialog ref={dialog} className="discussion-dialog" aria-labelledby="discussion-heading" onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2 id="discussion-heading">Discussions</h2><button type="button" className="btn-ghost" disabled={busy} onClick={close}>Close discussions</button></header>
    <div className="discussion-filters"><label>Discussion scope<select value={scope} disabled={busy} onChange={event => changeView(() => setScope(event.target.value))}><option value="">Inbox across notes</option>{notes.map(note => <option key={note._id} value={note._id}>{note.title}</option>)}</select></label><label>Show discussions<select value={filter} disabled={busy} onChange={event => changeView(() => setFilter(event.target.value))}><option value="unresolved">Unresolved</option><option value="mentions">Mentions of me</option><option value="replies">Replies in my discussions</option><option value="all">All discussions</option></select></label><button type="button" className="btn-ghost" disabled={busy} onClick={() => { setError(""); setRefresh(value => value + 1); }}>Refresh discussions</button></div>
    {error && <p role="alert">{error}</p>}
    <div className="discussion-layout"><nav aria-label="Discussion inbox">
      {scope && list?.canEdit && <button className="btn-primary" type="button" disabled={busy} onClick={() => { if (discard()) { setSelected(null); setThread(null); resetDraft(); } }}>New discussion</button>}
      {!list && !error && <p role="status">Loading discussions...</p>}{list?.entries.length === 0 && <p>No matching discussions.</p>}
      {list?.entries.map(entry => <button type="button" key={entry.id} aria-current={selected?.id === entry.id ? "true" : undefined} disabled={busy} onClick={() => { if (discard()) { resetDraft(); setError(""); setSelected({ id: entry.id, noteId: entry.noteId }); } }}><strong>{entry.title}</strong><span>{entry.excerpt}</span><small>{entry.resolved ? "Resolved" : "Unresolved"} · {entry.count} comments</small></button>)}
      <div className="discussion-actions">{cursor && <button type="button" className="btn-ghost" disabled={busy} onClick={() => changeView(() => setCursor(""))}>First page</button>}{list?.nextCursor && <button type="button" className="btn-ghost" disabled={busy} onClick={() => { if (discard()) { setCursor(list.nextCursor!); setList(null); setSelected(null); setThread(null); resetDraft(); } }}>Next page</button>}</div>
    </nav><section aria-label="Discussion detail">
      {selected && !thread && !error && <p role="status">Loading comments...</p>}
      {thread && <><h3>{thread.title}</h3><div className="discussion-actions"><button type="button" className="btn-ghost" disabled={busy} onClick={() => { if (discard()) { onClose(); onOpenNote(thread.noteId); } }}>Open discussion note</button>{thread.canEdit && <button type="button" className="btn-ghost" disabled={busy || dirty} onClick={() => void mutate(thread.resolved ? "reopen" : "resolve")}>{thread.resolved ? "Reopen discussion" : "Resolve discussion"}</button>}{thread.isOwner && <button type="button" className="btn-ghost" disabled={busy || dirty} onClick={() => void mutate("remove")}>Remove discussion</button>}</div>
        <ol className="discussion-posts">{thread.posts.map(post => <li key={post.id}><div><strong>{post.author}</strong><time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString()}{post.editedAt ? " · edited" : ""}</time></div><p>{post.deleted ? "Comment deleted" : post.body}</p>{!!post.mentions.length && <small>Mentions: {post.mentions.map(member => "@" + member.name).join(", ")}</small>}{thread.canEdit && post.authorId === owner && !post.deleted && <div className="discussion-actions"><button type="button" className="btn-ghost" disabled={busy} onClick={() => { if (discard()) { setEditing(post.id); setEditRevision(thread.revision); setBody(post.body); setMentions(post.mentions.filter(person => members.some(member => member.id === person.id)).map(person => person.id)); } }}>Edit comment</button><button type="button" className="btn-ghost" disabled={busy || dirty} onClick={() => void mutate("delete-post", post.id)}>Delete comment</button></div>}</li>)}</ol>
      </>}
      {canCompose ? <form onSubmit={event => { event.preventDefault(); void mutate(selected ? editing ? "edit" : "reply" : "create", editing || undefined); }}>
        <label>{editing ? "Edit your comment" : selected ? "Reply" : "Start a discussion"}<textarea aria-label="Comment text" rows={5} maxLength={4000} value={body} disabled={busy} onChange={event => setBody(event.target.value)} /></label>
        <details><summary>Mention collaborators ({mentions.length}/10)</summary><div className="discussion-mentions">{members.map(member => <label key={member.id}><input type="checkbox" checked={mentions.includes(member.id)} disabled={busy || (!mentions.includes(member.id) && mentions.length >= 10)} onChange={event => setMentions(value => event.target.checked ? [...value, member.id] : value.filter(id => id !== member.id))} />{member.name}{member.id === owner ? " (you)" : ""}</label>)}</div></details>
        <p className="discussion-hint">Comments are visible to everyone with access to this note. Mentions appear in their inbox; no email is sent.</p>
        <div className="discussion-actions"><button type="submit" className="btn-primary" disabled={busy || !body.trim() || (!editing && Boolean(thread && thread.posts.length >= 50))}>{editing ? "Save comment" : selected ? "Post reply" : "Post discussion"}</button>{dirty && <button type="button" className="btn-ghost" disabled={busy} onClick={() => { if (discard()) resetDraft(); }}>Discard comment</button>}</div>
      </form> : !selected ? <p>Choose a note to start a discussion, or open an inbox entry.</p> : thread && <p>{thread.resolved ? "This discussion is resolved." : "You have read-only access."}</p>}
      {!canCompose && dirty && <label>Retained unsent comment<textarea readOnly value={body} rows={4} /><small>You can copy this draft before closing. Posting requires edit access.</small></label>}
    </section></div>
  </dialog>;
}
