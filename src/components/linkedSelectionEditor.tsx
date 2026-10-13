import { useState } from "react";
import type { LinkedSelection } from "../model/note";
import type { LinkedPreview } from "../util/fetch";
import { readBoard } from "../util/linkedSelection";

export default function LinkedSelectionEditor({ value, busy, onSave }: { value: LinkedPreview; busy: boolean; onSave: (selection: LinkedSelection | null) => Promise<void> }) {
  const [start, setStart] = useState(value.selection?.kind === "lines" ? value.selection.start : 1);
  const [end, setEnd] = useState(value.selection?.kind === "lines" ? value.selection.end : 1);
  const [ids, setIds] = useState<string[]>(value.selection?.kind === "elements" ? value.selection.ids : []);
  const [query, setQuery] = useState("");
  if (value.type === "document") {
    const lines = value.content.split("\n"), valid = Number.isSafeInteger(start) && Number.isSafeInteger(end) && start > 0 && end >= start && end <= lines.length && end - start < 1000;
    return <details className="linked-selection-editor"><summary>Choose document excerpt</summary><p>Select up to 1,000 source lines. Line numbers refer to the saved Markdown.</p><div className="linked-selection-fields"><label>First line<input type="number" min={1} max={lines.length} value={start} onChange={event => setStart(Number(event.target.value))} /></label><label>Last line<input type="number" min={start} max={lines.length} value={end} onChange={event => setEnd(Number(event.target.value))} /></label></div><pre aria-label="Numbered source lines">{lines.map((line, index) => `${index + 1}  ${line}`).join("\n")}</pre><div className="linked-selection-actions"><button type="button" className="btn-primary" disabled={busy || !valid} onClick={() => void onSave({ kind: "lines", start, end, revision: value.revision })}>Use selected lines</button><button type="button" className="btn-ghost" disabled={busy} onClick={() => void onSave(null)}>Use whole source</button></div></details>;
  }
  let board; try { board = readBoard(value.content); } catch { return <p role="alert">Open the source to repair this board before selecting objects.</p>; }
  const elements = board.elements.filter(element => !element.isDeleted);
  const label = (element: typeof elements[number]) => `${element.type}${"text" in element ? ": " + (element.text ?? "").slice(0, 100) : ""} (${Math.round(element.x)}, ${Math.round(element.y)})`;
  const visible = elements.filter(element => label(element).toLowerCase().includes(query.toLowerCase()));
  return <details className="linked-selection-editor"><summary>Choose board objects</summary><p>Select up to 200 objects. The preview and export fit their combined region.</p><label>Find board objects<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label><div className="linked-object-options">{visible.slice(0, 300).map(element => <label key={element.id}><input type="checkbox" checked={ids.includes(element.id)} disabled={busy || !ids.includes(element.id) && ids.length >= 200} onChange={event => setIds(previous => event.target.checked ? [...previous, element.id] : previous.filter(id => id !== element.id))} />{label(element)}</label>)}</div>{visible.length > 300 && <p>Showing 300 objects. Search to find others.</p>}<div className="linked-selection-actions"><button type="button" className="btn-primary" disabled={busy || !ids.length || ids.some(id => !elements.some(element => element.id === id))} onClick={() => void onSave({ kind: "elements", ids, revision: value.revision })}>Use {ids.length} selected objects</button><button type="button" className="btn-ghost" disabled={busy} onClick={() => void onSave(null)}>Use whole source</button></div></details>;
}
