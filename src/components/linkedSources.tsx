import { useEffect, useRef, useState } from "react";
import { MarkdownRenderer } from "@sunaissu/document-editor";
import { Noteboard } from "@sunaissu/noteboard";
import { sanitizeNoteboardElements, sanitizeNoteboardViewport, type Note } from "../model/note";
import { useTheme } from "../context/themeContext";
import * as Api from "../util/fetch";

function SourcePreview({ value }: { value: Api.LinkedPreview }) {
  const { resolvedTheme } = useTheme();
  if (value.type === "document") return <div className="linked-document-preview"><MarkdownRenderer content={value.content} openLinksInNewTab /></div>;
  let board: { elements: ReturnType<typeof sanitizeNoteboardElements>; viewport: ReturnType<typeof sanitizeNoteboardViewport> } | null = null;
  try { const raw = JSON.parse(value.content), elements = sanitizeNoteboardElements(raw?.elements); if (Array.isArray(raw?.elements) && elements.length === raw.elements.length) board = { elements, viewport: sanitizeNoteboardViewport(raw.viewport) }; } catch { /* Preserve a visible error for malformed source content. */ }
  return board ? <div className="linked-board-preview"><Noteboard key={value.noteId + ":" + value.revision} elements={board.elements} initialViewport={board.viewport} readOnly theme={resolvedTheme} /></div> : <p role="alert">This board could not be previewed. Open the source to inspect it.</p>;
}
export default function LinkedSources({ note, notes, requestedOpen, onClose, onOpenNote }: { note: Note; notes: Note[]; requestedOpen: boolean; onClose: () => void; onOpenNote: (id: string) => void }) {
  const [data, setData] = useState<Api.LinkedSources | null>(null), [expanded, setExpanded] = useState(false), [sourceId, setSourceId] = useState(""), [previewId, setPreviewId] = useState("");
  const [preview, setPreview] = useState<Api.LinkedPreview | null>(null), [error, setError] = useState(""), [previewError, setPreviewError] = useState(""), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const active = useRef(true), generation = useRef(0), bodyRef = useRef<HTMLDivElement>(null), previewRef = useRef<HTMLDivElement>(null);
  const displayedSourceId = preview?.noteId;
  useEffect(() => { if (!displayedSourceId || !bodyRef.current || !previewRef.current) return; const body = bodyRef.current; body.scrollTop += previewRef.current.getBoundingClientRect().top - body.getBoundingClientRect().top; }, [displayedSourceId]);
  const isOpen = requestedOpen || expanded;
  useEffect(() => {
    active.current = true; let current = true;
    const load = async () => { const request = ++generation.current; try { const value = await Api.fetchLinkedSources(note._id); if (current && request === generation.current) { setData(previous => previous && previous.revision > value.revision ? previous : value); setError(""); } } catch (error) { if (current && request === generation.current) { setData(null); setPreview(null); setError(error instanceof Error ? error.message : "Could not load linked sources."); } } };
    void load(); const timer = isOpen ? setInterval(() => void load(), 30000) : undefined;
    return () => { current = false; active.current = false; if (timer) clearInterval(timer); };
  }, [note._id, isOpen, refresh]);
  const selected = data?.entries.find(entry => entry.noteId === previewId), accessible = selected?.available ?? false;
  useEffect(() => {
    setPreview(null); setPreviewError(""); if (!isOpen || !previewId || !accessible) return;
    let current = true, generation = 0;
    const load = async () => { const request = ++generation; try { const value = await Api.fetchLinkedPreview(note._id, previewId); if (current && request === generation) { setPreview(value); setPreviewError(""); } } catch (error) { if (current && request === generation) { setPreview(null); setPreviewError(error instanceof Error ? error.message : "The source is unavailable."); } } };
    void load(); const timer = setInterval(() => void load(), 30000);
    return () => { current = false; clearInterval(timer); };
  }, [note._id, previewId, accessible, isOpen, refresh]);
  const change = async (action: "add" | "remove" | "review", source: string) => {
    if (!data || busy) return; setBusy(true); setError(""); generation.current++;
    try { const value = await Api.updateLinkedSources(note._id, { action, sourceId: source, expectedRevision: data.revision, expectedSourceRevision: preview?.revision }); if (active.current) { setData(previous => previous && previous.revision > value.revision ? previous : value); if (action === "add") { setPreviewId(source); setSourceId(""); } if (action === "remove" && source === previewId) { setPreviewId(""); setPreview(null); } } }
    catch (error) { if (active.current) setError(error instanceof Error ? error.message : "Could not update linked sources."); }
    finally { if (active.current) setBusy(false); }
  };
  if (!isOpen && !data?.entries.length && !note.linkedSources?.length) return null;
  return <section className={`linked-sources ${isOpen ? "is-open" : ""}`} aria-label="Linked sources">
    <header><button type="button" className="btn-ghost" aria-expanded={isOpen} onClick={() => { if (isOpen) { setExpanded(false); onClose(); } else setExpanded(true); }}>Linked sources ({data?.entries.length ?? note.linkedSources?.length ?? 0})</button>{isOpen && <button type="button" className="btn-ghost" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh sources</button>}</header>
    {isOpen && <div ref={bodyRef} className="linked-sources-body"><p>Previews use the current source. Each viewer needs access to both notes; linking a source does not grant access. Open previews recheck access every 30 seconds.</p>
      {error && <p role="alert">{error}</p>}{!data && !error && <p role="status">Loading linked sources…</p>}
      {data?.canEdit && <form className="linked-source-add" onSubmit={event => { event.preventDefault(); void change("add", sourceId); }}><label>Source to link<select aria-label="Source to link" value={sourceId} disabled={busy} onChange={event => setSourceId(event.target.value)}><option value="">Choose a document or board</option>{notes.filter(source => source._id !== note._id && !data.entries.some(entry => entry.noteId === source._id)).map(source => <option key={source._id} value={source._id}>{source.title} · {source.type}</option>)}</select></label><button type="submit" className="btn-primary" disabled={busy || !sourceId || data.entries.length >= 20}>Link source</button></form>}
      <div className="linked-source-list">{data?.entries.map(entry => <article key={entry.noteId}><strong>{entry.title}</strong><span>{entry.available ? entry.stale ? "Source changed since last reviewed" : "Reviewed source revision" : "Source unavailable or access removed"}</span><div><button type="button" className="btn-ghost" disabled={!entry.available || busy} onClick={() => setPreviewId(entry.noteId)}>Preview source</button><button type="button" className="btn-ghost" disabled={!entry.available || busy} onClick={() => onOpenNote(entry.noteId)}>Open source</button>{data.canEdit && <button type="button" className="btn-ghost" disabled={busy} onClick={() => void change("remove", entry.noteId)}>Unlink source</button>}</div></article>)}</div>
      {previewId && <div ref={previewRef} className="linked-source-preview">{!accessible ? <p>This source is currently unavailable.</p> : preview?.noteId === previewId ? <><div className="linked-preview-header"><h3>{preview.title} · current preview</h3>{data?.canEdit && <button type="button" className="btn-ghost" disabled={busy} onClick={() => void change("review", previewId)}>Mark this revision reviewed</button>}<button type="button" className="btn-ghost" onClick={() => setPreviewId("")}>Close preview</button></div><SourcePreview value={preview} /></> : previewError ? <p role="alert">{previewError}</p> : <p role="status">Loading source preview…</p>}</div>}
      {data && !data.entries.length && <p>No linked sources yet. You can link up to 20 documents or boards.</p>}
    </div>}
  </section>;
}
