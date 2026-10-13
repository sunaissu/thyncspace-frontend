import { useMemo } from "react";
import { MarkdownRenderer } from "@sunaissu/document-editor";
import { NoteboardPreview } from "@sunaissu/noteboard";
import { NoteType, sanitizeNoteboardElements, type Note } from "../model/note";

// Linear work and bounded DOM size even for the largest accepted note.
export function changedRange(before: string, after: string) {
  let start = 0, end = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  while (end < before.length - start && end < after.length - start && before[before.length - end - 1] === after[after.length - end - 1]) end++;
  return { prefix: before.slice(0, start), removed: before.slice(start, before.length - end), added: after.slice(start, after.length - end), suffix: end ? before.slice(-end) : "" };
}

export default function VersionComparison({ saved, note }: { saved: string; note: Note }) {
  const current = typeof note.content === "string" ? note.content : JSON.stringify(note.content, null, 2);
  const difference = useMemo(() => changedRange(saved, current), [saved, current]);
  const boards = useMemo(() => {
    if (note.type !== NoteType.Whiteboard) return null;
    try {
      const left = JSON.parse(saved), right = JSON.parse(current);
      if (!Array.isArray(left.elements) || !Array.isArray(right.elements)) return null;
      const before = sanitizeNoteboardElements(left.elements).filter(item => !item.isDeleted);
      const after = sanitizeNoteboardElements(right.elements).filter(item => !item.isDeleted);
      const oldById = new Map(before.map(item => [item.id, item]));
      const newById = new Map(after.map(item => [item.id, item]));
      return { before, after, added: after.filter(item => !oldById.has(item.id)).length,
        removed: before.filter(item => !newById.has(item.id)).length,
        changed: after.filter(item => oldById.has(item.id) && JSON.stringify(item) !== JSON.stringify(oldById.get(item.id))).length };
    } catch { return null; }
  }, [saved, current, note.type]);
  return <>
    {note.type === NoteType.Whiteboard ? boards ? <>
      <p>{boards.added} objects added · {boards.removed} removed · {boards.changed} changed</p>
      <div className="draft-comparison"><figure><figcaption>Saved board</figcaption><NoteboardPreview elements={boards.before} height={280} /></figure><figure><figcaption>Current board</figcaption><NoteboardPreview elements={boards.after} height={280} /></figure></div>
    </> : <p role="alert">The saved board could not be previewed. Its original data is available below.</p> : <>
      <details open><summary>Text changes</summary>{difference.removed || difference.added ? <pre className="version-text-diff">{difference.prefix}<del>{difference.removed}</del><ins>{difference.added}</ins>{difference.suffix}</pre> : <p>No content changes.</p>}</details>
      <details><summary>Rendered documents</summary><div className="draft-comparison"><section aria-label="Saved document preview"><MarkdownRenderer content={saved} /></section><section aria-label="Current document preview"><MarkdownRenderer content={current} /></section></div></details>
    </>}
    <details><summary>Original source</summary><div className="draft-comparison">
      <label>Saved version<textarea aria-label="Saved version" readOnly value={saved} /></label>
      <label>Current note<textarea aria-label="Current note" readOnly value={current} /></label>
    </div></details>
  </>;
}
