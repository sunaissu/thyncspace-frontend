import { useEffect, useRef, useState } from "react";
import { NoteType, type Note } from "../model/note";
import * as Api from "../util/fetch";

export default function PassageAi({ notes, initialNoteId, onClose, onOpenNote, onCreated }: { notes: Note[]; initialNoteId?: string; onClose: () => void; onOpenNote: (id: string) => void; onCreated: (note: Note) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), active = useRef(true);
  const [id, setId] = useState(initialNoteId ?? ""), [source, setSource] = useState<Note | null>(null), [settings, setSettings] = useState<Api.AiSettings | null>(null);
  const [range, setRange] = useState({ start: 0, end: 0 }), [action, setAction] = useState<"summarize" | "variables">("summarize"), [consent, setConsent] = useState(false);
  const [result, setResult] = useState<Api.AiPassageResult | null>(null), [resultId, setResultId] = useState(""), [saved, setSaved] = useState<Note | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  const content = source?.type === NoteType.Document ? source.content : "", excerpt = content.slice(range.start, range.end), valid = excerpt.trim().length > 0 && excerpt.length <= 8000;
  useEffect(() => { active.current = true; const node = dialog.current; node?.showModal(); let current = true; Api.fetchAiSettings().then(value => { if (current) setSettings(value); }).catch(error => { if (current) setError(error instanceof Error ? error.message : "Could not load AI settings."); }); return () => { active.current = false; current = false; node?.close(); }; }, []);
  useEffect(() => {
    let current = true; setSource(null); setRange({ start: 0, end: 0 }); setConsent(false); setResult(null); setSaved(null); if (!id) return;
    Api.fetchNote(id).then(value => { if (value.type !== NoteType.Document) throw new Error("Choose a document for a passage action."); if (current) setSource(value); }).catch(error => { if (current) setError(error instanceof Error ? error.message : "Could not load the saved source."); });
    return () => { current = false; };
  }, [id, refresh]);
  useEffect(() => { if ((!result || saved) && !busy) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [result, saved, busy]);
  const close = () => { if (!busy && (!result || saved || window.confirm("Close this unsaved AI result? Download it or save a private copy to keep it."))) onClose(); };
  const send = async () => {
    if (!source || !valid || !consent || !settings?.enabled || busy) return;
    if (result && !saved && !window.confirm("Replace the unsaved AI result with a new request?")) return;
    setBusy(true); setError(""); setResult(null); setSaved(null);
    try { const value = await Api.runPassageAi(source._id, { action, ...range, excerpt, expectedRevision: source.contentRevision ?? 0, consent: true }); if (active.current) { setResult(value); setResultId(crypto.randomUUID()); } }
    catch (error) { if (active.current) setError(error instanceof Error ? error.message : "The AI action failed. Your source was not changed."); }
    finally { if (active.current) { setBusy(false); setConsent(false); } }
  };
  const save = async () => {
    if (!result || !resultId || busy || saved) return; setBusy(true); setError("");
    try {
      // Indented code preserves generated text and source excerpts literally;
      // model output cannot create active Markdown links or image requests.
      const literal = (text: string) => text.split("\n").map(line => "    " + line).join("\n");
      const text = "# AI result: review before use\n\nSource: [[" + result.source.noteId + "]]\n\nSource revision " + result.source.revision + ", characters " + (result.source.start + 1) + "–" + result.source.end + ".\n\n## Generated result\n\n" + literal(result.result.text) + (result.result.variables.length ? "\n\n## Extracted variables\n\n" + literal(result.result.variables.map(item => `${item.name}: ${item.value} ${item.unit}\nSource quote: ${item.quote}`).join("\n\n")) : "") + (result.result.warnings.length ? "\n\n## Review notes\n\n" + literal(result.result.warnings.join("\n")) : "") + "\n\n## Source passage\n\n" + literal(result.source.excerpt);
      const note = await Api.saveCapture(resultId, ("AI " + (result.action === "summarize" ? "summary" : "variables") + ": " + result.source.title).slice(0, 200), text);
      if (active.current) { setSaved(note); onCreated(note); }
    } catch (error) { if (active.current) setError(error instanceof Error ? error.message : "Could not save the private copy. The result remains here."); }
    finally { if (active.current) setBusy(false); }
  };
  const download = () => { if (!result) return; const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" })), anchor = document.createElement("a"); anchor.href = url; anchor.download = "thyncspace-passage-result.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  return <dialog ref={dialog} className="passage-ai-dialog" aria-labelledby="passage-ai-heading" onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2 id="passage-ai-heading">Passage AI actions</h2><button type="button" className="btn-ghost" disabled={busy} onClick={close}>Close AI actions</button></header>
    <p>Choose a passage from the saved document, review what will be sent, then send it to OpenAI. Generated results stay here until you save or download them.</p>
    {settings && !settings.enabled && <p role="status">AI actions are not enabled for this workspace.</p>}{error && <p role="alert">{error}</p>}
    <div className="passage-ai-controls"><label>Source document<select aria-label="Source document" disabled={busy} value={id} onChange={event => { if (!result || saved || window.confirm("Discard the unsaved result and choose another source?")) { setError(""); setId(event.target.value); } }}><option value="">Choose a document</option>{notes.filter(note => note.type === NoteType.Document).map(note => <option key={note._id} value={note._id}>{note.title}</option>)}</select></label><button type="button" className="btn-ghost" disabled={busy || !id} onClick={() => { if (!result || saved || window.confirm("Discard the unsaved result and reload the source?")) { setError(""); setRefresh(value => value + 1); } }}>Reload saved source</button></div>
    {source && <><label>Saved source: select a passage<textarea aria-label="Saved source: select a passage" readOnly disabled={busy} key={source._id + ":" + (source.contentRevision ?? 0)} defaultValue={content} rows={8} onSelect={event => { const node = event.currentTarget; if (node.selectionStart !== range.start || node.selectionEnd !== range.end) { setRange({ start: node.selectionStart, end: node.selectionEnd }); setConsent(false); } }} /></label>
      <label>AI action<select aria-label="AI action" value={action} disabled={busy} onChange={event => { setAction(event.target.value as "summarize" | "variables"); setConsent(false); }}><option value="summarize">Summarize passage</option><option value="variables">Extract stated variables</option></select></label>
      <section className="passage-ai-preview" aria-label="Send preview"><h3>Passage sent to OpenAI</h3><p>{excerpt.length.toLocaleString()}/8,000 characters · saved revision {source.contentRevision ?? 0}</p>{excerpt ? <pre>{excerpt}</pre> : <p>Select text in the saved source above.</p>}<p>The request includes this passage and the chosen action instructions. Other notes, attachments, account details and calculator contents are excluded.</p></section>
      <label className="passage-ai-consent"><input type="checkbox" checked={consent} disabled={busy || !valid || !settings?.enabled} onChange={event => setConsent(event.target.checked)} />I agree to send this passage to OpenAI for this action.</label>
      <p className="passage-ai-hint">Response storage is disabled. OpenAI may retain abuse-monitoring logs under its <a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noopener noreferrer">data controls</a>.</p>
      <button type="button" className="btn-primary" disabled={busy || !valid || !consent || !settings?.enabled} onClick={() => void send()}>{busy && !result ? "Working..." : "Send reviewed passage"}</button>
    </>}
    {result && <section className="passage-ai-result" aria-label="AI result"><h3>AI result · review before use</h3><p>Source: {result.source.title}, revision {result.source.revision}. {result.source.changed ? "The source changed while this result was generated." : "Generated from the passage shown below."}</p><pre>{result.result.text}</pre>
      {result.result.variables.length > 0 && <div className="passage-ai-variables">{result.result.variables.map((item, index) => <article key={index}><strong>{item.name}: {item.value} {item.unit}</strong><blockquote>{item.quote}</blockquote></article>)}</div>}
      {result.result.citations.map((quote, index) => <blockquote key={index}>{quote}</blockquote>)}{result.result.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
      <details><summary>Exact source passage</summary><pre>{result.source.excerpt}</pre></details><div className="passage-ai-actions"><button type="button" className="btn-ghost" disabled={busy} onClick={download}>Download result</button><button type="button" className="btn-primary" disabled={busy || Boolean(saved)} onClick={() => void save()}>{saved ? "Private copy saved" : "Save a private copy"}</button><button type="button" className="btn-ghost" disabled={busy} onClick={() => { if (saved || window.confirm("Open the source and close the unsaved result?")) { onClose(); onOpenNote(result.source.noteId); } }}>Open source document</button>{saved && <button type="button" className="btn-ghost" onClick={() => { onClose(); onOpenNote(saved._id); }}>Open private copy</button>}</div>
    </section>}
  </dialog>;
}
