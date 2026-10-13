import { useEffect, useRef, useState } from "react";
import * as Api from "../util/fetch";
import { recognizeImage } from "../util/imageOcr";

export default function AttachmentOcr({ id, blob, onSaved, onDirty }: { id: string; blob: Blob; onSaved: () => void; onDirty: (value: boolean) => void }) {
  const alive = useRef(true), controller = useRef<AbortController | null>(null);
  const [index, setIndex] = useState<Api.AttachmentIndex | null>(null), [text, setText] = useState(""), [error, setError] = useState(""), [status, setStatus] = useState(""), [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [consent, setConsent] = useState(false);
  const dirty = Boolean(index && text !== index.text);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const reload = async () => { try { const value = await Api.fetchAttachmentIndex(id); if (alive.current) { setIndex(value); setText(value.text); setError(""); } } catch (error) { if (alive.current) setError(error instanceof Error ? error.message : "Could not load the search index."); } };
  useEffect(() => {
    alive.current = true; let active = true;
    Api.fetchAttachmentIndex(id).then(value => { if (active) { setIndex(value); setText(value.text); } }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Could not load the search index."); });
    return () => { active = false; alive.current = false; controller.current?.abort(); };
  }, [id]);
  const recognize = async () => {
    if (busy || saving || !consent) return;
    const control = new AbortController(); controller.current = control;
    setBusy(true); setError(""); setStatus("Preparing English text recognition…");
    try { const value = await recognizeImage(blob, control.signal, value => { if (alive.current) setStatus(value); }); if (alive.current) { setText(value); setStatus(value.trim() ? "Review and correct the recognized text before saving." : "No text was found. You can type a search transcription manually."); } }
    catch (error) { if (alive.current) { setError(error instanceof Error ? error.message : "Text recognition failed."); setStatus(""); } }
    finally { if (alive.current) setBusy(false); controller.current = null; }
  };
  const save = async (value: string) => {
    if (!index || busy || saving) return;
    setSaving(true); setError("");
    try { const saved = await Api.updateAttachmentIndex(id, value, index.revision); if (alive.current) { setIndex(saved); setText(saved.text); setStatus(saved.indexedAt ? "Search text saved for this image." : "Search text removed."); onSaved(); } }
    catch (error) { if (alive.current) setError(error instanceof Error ? error.message : "Could not save. Your edited text is still here."); }
    finally { if (alive.current) setSaving(false); }
  };
  return <details className="attachment-ocr"><summary>Image text and search</summary>
    <p>Recognize English text from this image in your browser. Nothing is indexed automatically. Saving sends the reviewed text to ThyncSpace and makes it searchable to people who can access this file through a note.</p>
    <label className="attachment-consent"><input type="checkbox" checked={consent} disabled={busy || saving} onChange={event => setConsent(event.target.checked)} /> I want to process this selected image.</label>
    <div className="attachment-actions"><button type="button" className="btn-ghost" disabled={!consent || busy || saving || !index} onClick={() => void recognize()}>Recognize image text</button>{busy && <button type="button" className="btn-ghost" onClick={() => controller.current?.abort()}>Cancel recognition</button>}</div>
    {index && <><label>Review search text<textarea rows={6} maxLength={50000} disabled={busy || saving} value={text} onChange={event => setText(event.target.value)} /></label><small>{text.length.toLocaleString()} / 50,000 characters · {index.indexedAt ? `Saved ${new Date(index.indexedAt).toLocaleString()}` : "Not indexed"}</small>
      <div className="attachment-actions"><button type="button" className="btn-primary" disabled={busy || saving || !consent || !text.trim()} onClick={() => void save(text)}>Save reviewed text to search</button><button type="button" className="btn-ghost" disabled={busy || saving || !index.indexedAt} onClick={() => { if (window.confirm("Remove this image’s search text? The original image stays in your library.")) void save(""); }}>Remove search text</button></div></>}
    <button type="button" className="btn-ghost" disabled={busy || saving} onClick={() => { if (text !== index?.text && !window.confirm("Reload saved search text and discard these edits?")) return; void reload(); }}>Reload saved text</button>
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
  </details>;
}
