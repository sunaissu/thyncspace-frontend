import { useMemo, useState } from "react";
import type { Note } from "../model/note";
import { collectNoteTasks } from "../util/noteTasks";

export default function TaskOverview({ notes, onOpenNote, onClose }: { notes: Note[]; onOpenNote: (id: string) => void; onClose: () => void }) {
  const tasks = useMemo(() => collectNoteTasks(notes), [notes]);
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const matches = tasks.filter(task => (filter === "all" || (filter === "done" ? task.done : !task.done)) && (filter !== "overdue" || (task.due && task.due < today)) && `${task.text} ${task.noteTitle}`.toLowerCase().includes(search.toLowerCase()));
  const maxPage = Math.max(0, Math.ceil(matches.length / 50) - 1);
  const currentPage = Math.min(page, maxPage);
  return <section className="note-library task-overview" aria-label="Tasks across notes">
    <header><h2>Tasks across notes</h2><button type="button" className="btn-ghost" onClick={onClose}>Close tasks</button></header>
    <p>Use Markdown checkboxes and <code>due:YYYY-MM-DD</code> or <code>📅 YYYY-MM-DD</code>. Edit a task in its source note; completion and dates update here.</p>
    <div className="task-filters"><label>Task status<select value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}><option value="open">Open</option><option value="done">Completed</option><option value="overdue">Overdue</option><option value="all">All</option></select></label><label>Find tasks<input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></label></div>
    <p>{matches.length} matching tasks{tasks.length >= 5000 ? " · showing the first 5,000 tasks in this library" : ""}</p>
    <ul className="task-list">{matches.slice(currentPage * 50, currentPage * 50 + 50).map(task => <li key={`${task.noteId}:${task.line}`}>
      <span aria-label={task.done ? "Completed" : "Open"}>{task.done ? "✓" : "○"}</span><span>{task.text}<small>{task.due ? `${!task.done && task.due < today ? "Overdue · " : ""}${task.due} · ` : ""}{task.noteTitle} · line {task.line}</small></span>
      <button type="button" className="btn-ghost" onClick={() => { onOpenNote(task.noteId); onClose(); }}>Open source</button>
    </li>)}</ul>
    {matches.length === 0 && <p>No matching tasks.</p>}
    {maxPage > 0 && <div><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous tasks</button><span> {currentPage + 1} / {maxPage + 1} </span><button disabled={currentPage === maxPage} onClick={() => setPage(currentPage + 1)}>Next tasks</button></div>}
  </section>;
}
