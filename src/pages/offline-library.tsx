import Head from "next/head";
import OfflineDocumentationEditor from "../components/offlineDocumentationEditor";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DocumentEditor } from "@sunaissu/document-editor";
import { Noteboard } from "@sunaissu/noteboard";
import { useTheme } from "../context/themeContext";
import { sanitizeNoteboardElements, sanitizeNoteboardViewport, type Note } from "../model/note";
import * as Api from "../util/fetch";
import { deleteOfflineNote, listOfflineNotes, putOfflineNote, rawOfflineRecovery, resetOfflineLibrary, type OfflineNote } from "../util/offlineLibrary";

const contentOf = (note: Note) => typeof note.content === "string" ? note.content : JSON.stringify(note.content);
const download = (text: string, name: string) => { const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" })), anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); };
function parseBoard(value: string) {
  try { const parsed = JSON.parse(value); const elements = sanitizeNoteboardElements(parsed?.elements); return Array.isArray(parsed?.elements) && elements.length === parsed.elements.length ? { elements, viewport: sanitizeNoteboardViewport(parsed.viewport) } : null; } catch { return null; }
}
function OfflineEditor({ note, value, onChange }: { note: OfflineNote; value: string; onChange: (value: string) => void }) {
  const { resolvedTheme, packageBrandColors, packageScrollbar } = useTheme();
  if (note.type === "documentation") return <OfflineDocumentationEditor title={note.title} value={value} readOnly={!note.editable} onChange={onChange} />;
  if (note.type === "document") return <DocumentEditor value={value} onChange={onChange} readOnly={!note.editable} theme={resolvedTheme} brandColors={packageBrandColors} scrollbar={packageScrollbar} />;
  const board = parseBoard(value);
  if (!board) return <p role="alert">The cached board is invalid. Download it for recovery.</p>;
  const { elements, viewport } = board;
    return <div className="offline-board"><Noteboard elements={elements} initialViewport={viewport} readOnly={!note.editable} theme={resolvedTheme} brandColors={packageBrandColors} scrollbar={packageScrollbar} maxImageBytes={700 * 1024} acceptElementsChange={elements => new TextEncoder().encode(JSON.stringify({ elements, viewport })).length <= 1024 * 1024 - 4096} onElementsChange={elements => onChange(JSON.stringify({ elements, viewport }))} onViewportChange={() => {}} /></div>;
}
export default function OfflineLibrary() {
  const [notes, setNotes] = useState<OfflineNote[]>([]), [account, setAccount] = useState(""), [selected, setSelected] = useState<OfflineNote | null>(null), [value, setValue] = useState("");
  const [error, setError] = useState(""), [status, setStatus] = useState(""), [busy, setBusy] = useState(false), [remote, setRemote] = useState<Note | null>(null), [loaded, setLoaded] = useState(false);
  const active = useRef(true), dirty = Boolean(selected && value !== (selected.pending ?? selected.baseContent));
  const reload = async () => { const next = await listOfflineNotes(); if (active.current) { setNotes(next); setLoaded(true); } return next; };
  useEffect(() => { active.current = true; listOfflineNotes().then(value => { if (active.current) { setNotes(value); setAccount(value[0]?.account ?? ""); setLoaded(true); } }).catch(error => { if (active.current) setError(error instanceof Error ? error.message : "Could not read the offline library."); }); return () => { active.current = false; }; }, []);
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const leave = () => !dirty || window.confirm("Leave edits that have not been queued? Queue or download them first to keep a copy.");
  const choose = (note: OfflineNote) => { if (busy || !leave()) return; setSelected(note); setValue(note.pending ?? note.baseContent); setRemote(null); setError(""); setStatus(""); };
  const run = async (action: () => Promise<void>) => { if (busy) return; setBusy(true); setError(""); try { await action(); } catch (error) { if (active.current) setError(error instanceof Error ? error.message : "Offline operation failed. Your queued edits are retained."); } finally { if (active.current) setBusy(false); } };
  const authenticated = async () => { const user = await Api.getLoginUser(); if (user._id !== account) throw new Error("Sign in to the account that owns this offline library before synchronizing."); return user; };
  const persist = async () => {
    if (!selected || !selected.editable) return;
    const saved = await putOfflineNote({ ...selected, pending: value === selected.baseContent ? null : value, error: undefined }, selected.revision);
    setSelected(saved); await reload(); setStatus(saved.pending === null ? "Offline copy saved. No changes are queued." : "Edits saved on this device and queued for synchronization.");
  };
  const commitServer = async (cached: OfflineNote, server: Note) => {
    const saved = await putOfflineNote({ ...cached, title: server.title, type: server.type, baseContent: contentOf(server), baseRevision: server.contentRevision ?? 0, pending: null, editable: server.owner === account && server.sharedWith.length === 0, error: undefined, cachedAt: new Date().toISOString() }, cached.revision);
    if (selected?.noteId === saved.noteId) { setSelected(saved); setValue(saved.baseContent); setRemote(null); }
    return saved;
  };
  const sync = async () => {
    if (!leave()) return; await authenticated(); const queue = (await listOfflineNotes(account)).filter(note => note.pending !== null); let saved = 0, failed = 0;
    for (const cached of queue) {
      if (!active.current) break;
      try {
        const current = await Api.fetchOfflineSyncNote(account, cached.noteId);
        if (current.owner !== account || current.sharedWith.length) throw new Error("This note is shared or no longer owned by this account. Keep the local copy for review; queued replacement is paused.");
        if (contentOf(current) === cached.pending) { await commitServer(cached, current); saved++; continue; }
        if (current.contentRevision !== cached.baseRevision) throw new Error("The server version changed. Compare both versions before choosing what to keep.");
        const result = await Api.saveOfflineSyncNote(account, cached.noteId, cached.pending!, cached.baseRevision); await commitServer(cached, result); saved++;
      } catch (error) {
        failed++; const message = error instanceof Error ? error.message : "Could not sync. Retry when online.";
        try { await putOfflineNote({ ...cached, error: message }, cached.revision); } catch { /* A newer local edit stays untouched. */ }
      }
    }
    const current = await reload(); if (selected && !dirty) { const item = current.find(note => note.account === account && note.noteId === selected.noteId); if (item) { setSelected(item); setValue(item.pending ?? item.baseContent); } }
    setStatus(`${saved} synchronized; ${failed} retained for retry or conflict review.`);
  };
  const compare = async () => { if (!selected || !leave()) return; await authenticated(); setRemote(await Api.fetchOfflineSyncNote(account, selected.noteId)); };
  const members = [...new Map(notes.map(note => [note.account, note.username])).entries()], visible = notes.filter(note => note.account === account), queued = visible.filter(note => note.pending !== null).length;
  return <main className="offline-library"><Head><title>Offline library | ThyncSpace</title></Head>
    <header><h1>Offline library</h1><Link href="/notes/" onClick={event => { if (busy || !leave()) event.preventDefault(); }}>Online workspace</Link></header>
    <details className="offline-about"><summary>About copies stored on this device</summary><p>These are copies you chose to keep on this device. They remain available after sign-out to anyone using this browser profile. Private notes can be edited and queued here. Shared notes are cached for reading; pending live collaboration edits use the workspace’s separate recovery flow.</p>
    <p>Save pending online edits before caching a note. Attachment-library files are not downloaded with a note. Remove cached copies when you no longer want them on this device.</p></details>
    <div className="offline-actions"><label>Cached account<select aria-label="Cached account" value={account} disabled={busy} onChange={event => { if (leave()) { setAccount(event.target.value); setSelected(null); setRemote(null); } }}>{!members.length && <option value="">No cached accounts</option>}{members.map(([id, username]) => <option key={id} value={id}>{username} · {id.slice(-6)}</option>)}</select></label><button type="button" className="btn-primary" disabled={busy || !queued} onClick={() => void run(sync)}>Synchronize queue ({queued})</button><button type="button" className="btn-ghost" disabled={busy} onClick={() => { if (leave()) void run(async () => { await reload(); setSelected(null); setRemote(null); setStatus("Offline library reloaded."); }); }}>Reload local library</button><button type="button" className="btn-ghost" disabled={!visible.length} onClick={() => download(JSON.stringify({ format: "thyncspace-offline-recovery", version: 1, notes: visible }, null, 2), "thyncspace-offline-recovery.json")}>Download cached notes and queue</button></div>
    <p>{visible.length} / 100 cached notes · {queued} queued · 20 MiB per account, including queued copies</p>
    {error && <><p role="alert">{error}</p>{!loaded && <div className="offline-actions"><button type="button" className="btn-ghost" disabled={busy} onClick={() => void run(async () => download(JSON.stringify(await rawOfflineRecovery(), null, 2), "offline-raw-recovery.json"))}>Download raw recovery data</button><button type="button" className="btn-ghost" disabled={busy} onClick={() => { if (window.confirm("Reset ALL offline-library copies and queued edits for every account in this browser? Download raw recovery data first. Online notes and separate workspace drafts are not removed.")) void run(async () => { await resetOfflineLibrary(); await reload(); setAccount(""); setSelected(null); }); }}>Reset damaged offline library</button></div>}</>}{busy && <p role="status">Checking and saving…</p>}{status && <p role="status">{status}</p>}{!loaded && !error && <p role="status">Reading offline library…</p>}
    <div className="offline-layout"><nav aria-label="Cached notes">{visible.map(note => <button type="button" key={note.noteId} aria-current={selected?.noteId === note.noteId ? "page" : undefined} disabled={busy} onClick={() => choose(note)}><strong>{note.title}</strong><small>{note.pending !== null ? "Queued edits" : "Cached copy"}{note.error ? " · Needs review" : ""}{!note.editable ? " · Read only" : ""}</small></button>)}{loaded && !visible.length && <p>In the online workspace, select a note and choose Commands → Make selected note available offline.</p>}</nav>
      <section className="offline-detail">{selected ? <><h2>{selected.title}</h2><p>Cached {new Date(selected.cachedAt).toLocaleString()}. Current server permissions are checked again before every synchronization.</p>{selected.error && <p role="alert">{selected.error}</p>}
        <div className="offline-actions"><button type="button" className="btn-primary" disabled={busy || !dirty || !selected.editable} onClick={() => void run(persist)}>Queue changes on this device</button><button type="button" className="btn-ghost" disabled={busy} onClick={() => void run(compare)}>Compare with server</button><button type="button" className="btn-ghost" onClick={() => download(value, selected.type === "documentation" ? "offline-documentation.json" : selected.type === "document" ? "offline-note.md" : "offline-board.json")}>Download current edit</button><button type="button" className="btn-ghost" disabled={busy} onClick={() => { if (window.confirm("Remove this cached note and any queued edits from this device? Download a copy first if you need it.")) void run(async () => { await deleteOfflineNote(account, selected.noteId, selected.revision); setSelected(null); setRemote(null); await reload(); }); }}>Remove local copy</button></div>
        <p role="status">{dirty ? "Unqueued edits — save on this device before leaving." : selected.pending !== null ? "Queued edits are stored on this device." : "Viewing the cached version."}</p>
        {remote && <section className="offline-conflict"><h3>Compare versions</h3><p>Review both values. Choosing the offline version replaces server content only if its revision still matches the version below.</p><div><label>Offline version<textarea readOnly value={value} /></label><label>Current server version<textarea readOnly value={contentOf(remote)} /></label></div>
          <div className="offline-actions"><button type="button" className="btn-ghost" disabled={busy} onClick={() => { if (window.confirm("Discard queued/local edits and use this server version in the offline library?")) void run(async () => { await authenticated(); const current = await Api.fetchOfflineSyncNote(account, selected.noteId); await commitServer(selected, current); await reload(); setStatus("Offline copy refreshed from the server."); }); }}>Use server version</button>
            <button type="button" className="btn-primary" disabled={busy || remote.owner !== account || Boolean(remote.sharedWith.length)} onClick={() => { if (window.confirm("Replace the server’s content with the offline version shown here?")) void run(async () => { await authenticated(); const result = await Api.saveOfflineSyncNote(account, selected.noteId, value, remote.contentRevision ?? 0); await commitServer(selected, result); await reload(); setStatus("Reviewed offline version synchronized."); }); }}>Use offline version</button></div>
        </section>}
        <div className="offline-editor" inert={busy}><OfflineEditor key={`${selected.account}:${selected.noteId}:${selected.baseRevision}`} note={selected} value={value} onChange={next => { if (!busy) setValue(next); }} /></div>
      </> : <p>Choose a cached note to read or edit.</p>}</section>
    </div>
  </main>;
}
