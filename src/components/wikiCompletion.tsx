import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { DocumentEditorHandle } from "@sunaissu/document-editor";
import type { Note } from "../model/note";
import { wikiMarkup, wikiQueryAt } from "../util/wikiLinks";

type Candidate = { query: string; token: string; source?: HTMLTextAreaElement; start?: number; range?: Range; editor?: HTMLElement };
function candidateIn(root: HTMLElement): Candidate | null {
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement && root.contains(active) && active.getAttribute("aria-label") === "Markdown source") {
    if (active.selectionStart !== active.selectionEnd) return null;
    const match = wikiQueryAt(active.value, active.selectionStart);
    return match ? { ...match, source: active } : null;
  }
  const selection = window.getSelection();
  if (!selection?.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (range.startContainer.nodeType !== Node.TEXT_NODE || !root.contains(range.startContainer)) return null;
  const parent = range.startContainer.parentElement;
  const editor = parent?.closest<HTMLElement>('[contenteditable="true"]');
  if (!editor || parent?.closest("code, pre, [data-wikilink]")) return null;
  const match = /\[\[([^\[\]\n]{0,100})$/.exec((range.startContainer.textContent ?? "").slice(0, range.startOffset));
  if (!match) return null;
  const replacement = range.cloneRange(); replacement.setStart(range.startContainer, range.startOffset - match[0].length);
  return { query: match[1], token: match[0], range: replacement, editor };
}

export default function WikiCompletion({ children, notes, readOnly, editorRef }: { children: ReactNode; notes: Note[]; readOnly: boolean; editorRef: RefObject<DocumentEditorHandle | null> }) {
  const root = useRef<HTMLDivElement>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [selected, setSelected] = useState(0);
  const options = candidate ? notes.filter(note => note.title.toLowerCase().includes(candidate.query.toLowerCase())).slice(0, 8) : [];
  const choose = (note: Note) => {
    if (readOnly || !candidate) return;
    const markup = wikiMarkup(note);
    if (candidate.source?.isConnected && candidate.start !== undefined) {
      const { source, start, token } = candidate;
      if (source.value.slice(start, start + token.length) !== token) { setCandidate(null); return; }
      source.focus(); source.setSelectionRange(start, start + token.length); editorRef.current?.insertText(markup);
    } else if (candidate.range && candidate.editor?.isConnected && candidate.editor.contains(candidate.range.commonAncestorContainer) && candidate.range.toString() === candidate.token) {
      candidate.editor.focus(); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(candidate.range);
      // Plain-text insertion triggers the editor's own input and undo handling.
      document.execCommand("insertText", false, markup);
    }
    setCandidate(null);
  };
  const current = useRef({ choose, options, selected, candidate });
  useEffect(() => { current.current = { choose, options, selected, candidate }; });
  useEffect(() => {
    const container = root.current;
    if (!container || readOnly) return;
    let composing = false;
    const refresh = () => { if (!composing) { setCandidate(candidateIn(container)); setSelected(0); } };
    const key = (event: KeyboardEvent) => {
      if (event.isComposing || composing || !current.current.candidate) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setCandidate(null); }
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && current.current.options.length) {
        event.preventDefault(); event.stopPropagation(); setSelected(index => (index + (event.key === "ArrowDown" ? 1 : -1) + current.current.options.length) % current.current.options.length);
      }
      if (event.key === "Enter" && current.current.options.length) { event.preventDefault(); event.stopPropagation(); current.current.choose(current.current.options[current.current.selected] ?? current.current.options[0]); }
    };
    const start = () => { composing = true; setCandidate(null); };
    const end = () => { composing = false; refresh(); };
    const blur = (event: FocusEvent) => { if (!(event.relatedTarget instanceof Element) || !event.relatedTarget.closest(".wiki-completion")) setCandidate(null); };
    const cursor = (event: Event) => { if (event instanceof KeyboardEvent && ["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(event.key)) return; refresh(); };
    container.addEventListener("input", refresh); container.addEventListener("keydown", key, true);
    container.addEventListener("compositionstart", start); container.addEventListener("compositionend", end);
    container.addEventListener("focusout", blur); container.addEventListener("keyup", cursor); container.addEventListener("pointerup", cursor);
    return () => { container.removeEventListener("input", refresh); container.removeEventListener("keydown", key, true); container.removeEventListener("compositionstart", start); container.removeEventListener("compositionend", end); container.removeEventListener("focusout", blur); container.removeEventListener("keyup", cursor); container.removeEventListener("pointerup", cursor); };
  }, [readOnly]);
  return <div className="wiki-editor-wrapper" ref={root}>{children}
    {candidate && !readOnly && <section className="wiki-completion" aria-label="Wiki-link suggestions">
      <p role="status">{options.length ? "Link a note · ↑ ↓ then Enter · Esc closes" : "No matching accessible notes"}</p>
      {options.map((note, index) => <button type="button" key={note._id} className={index === selected ? "is-selected" : ""} onMouseDown={event => event.preventDefault()} onClick={() => choose(note)}>{note.title}<small>{note.sourcePath || note.type} · {note._id.slice(-6)}</small></button>)}
    </section>}
  </div>;
}
