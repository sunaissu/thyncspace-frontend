import { useEffect, useMemo, useRef, useState } from "react";
import type { Note } from "../model/note";
import * as Api from "../util/fetch";
import { collectNoteTasks } from "../util/noteTasks";
import { enableReminders, notifyDueReminders, remindersEnabled } from "../util/reminderNotifications";

const localTime = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export default function ReminderCenter({ owner, notes, initialNoteId, open, onOpen, onClose, onOpenNote }: { owner: string; notes: Note[]; initialNoteId?: string; open: boolean; onOpen: () => void; onClose: () => void; onOpenNote: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), generation = useRef(0), active = useRef(true);
  const [now, setNow] = useState(() => Date.now());
  const [list, setList] = useState<Api.ReminderList | null>(null), [error, setError] = useState(""), [status, setStatus] = useState(""), [busy, setBusy] = useState(false);
  const [noteId, setNoteId] = useState(initialNoteId ?? notes[0]?._id ?? ""), [taskLine, setTaskLine] = useState(""), [dueAt, setDueAt] = useState(() => localTime(new Date(Date.now() + 3600000))), [repeatDays, setRepeatDays] = useState(0), [filter, setFilter] = useState("active"), [enabled, setEnabled] = useState(false);
  const taskSource = open ? notes.find(note => note._id === noteId) : undefined;
  const tasks = useMemo(() => taskSource ? collectNoteTasks([taskSource]).filter(task => !task.done) : [], [taskSource]);
  const reload = async () => { const current = ++generation.current; setNow(Date.now()); try { const value = await Api.fetchReminders(); if (active.current && current === generation.current) { setList(value); setError(""); } } catch (error) { if (active.current && current === generation.current) setError(error instanceof Error ? error.message : "Could not load reminders."); } };
  useEffect(() => {
    active.current = true; let current = true, pending = false;
    const poll = async () => {
      if (pending) return; setNow(Date.now()); pending = true; const request = ++generation.current;
      try { const value = await Api.fetchReminders(); if (current && request === generation.current) { setList(previous => !previous || value.revision >= previous.revision ? value : previous); await notifyDueReminders(owner, value); } }
      catch (error) { if (current) setError(error instanceof Error ? error.message : "Could not check reminders."); }
      finally { pending = false; }
    };
    try { setEnabled(remindersEnabled(owner)); } catch { setError("Notification preferences could not be read. In-app reminders still work."); }
    void poll(); const timer = setInterval(() => void poll(), 60000);
    return () => { current = false; active.current = false; clearInterval(timer); };
  }, [owner]);
  useEffect(() => { const listener = () => onOpen(); const message = (event: MessageEvent) => { if (event.data?.type === "open-reminders") onOpen(); }; window.addEventListener("thyncspace-open-reminders", listener); navigator.serviceWorker?.addEventListener("message", message); return () => { window.removeEventListener("thyncspace-open-reminders", listener); navigator.serviceWorker?.removeEventListener("message", message); }; }, [onOpen]);
  useEffect(() => { if (open) { setNow(Date.now()); dialog.current?.showModal(); if (!noteId && initialNoteId) setNoteId(initialNoteId); } else dialog.current?.close(); }, [open, initialNoteId, noteId]);
  const change = async (input: Omit<Parameters<typeof Api.updateReminders>[0], "expectedRevision">) => {
    if (!list || busy) return; setBusy(true); setError(""); setStatus(""); generation.current++;
    try { const value = await Api.updateReminders({ ...input, expectedRevision: list.revision }); if (active.current) { setList(previous => !previous || value.revision >= previous.revision ? value : previous); setStatus(input.action === "create" ? "Private reminder saved." : "Reminder updated."); } }
    catch (error) { if (active.current) setError(error instanceof Error ? error.message : "Could not save the reminder. Refresh after a conflict."); }
    finally { if (active.current) setBusy(false); }
  };
  const toggleNotifications = async () => {
    try {
      if (enabled) { enableReminders(owner, false); setEnabled(false); return; }
      if (!("Notification" in window) || !navigator.locks) throw new Error("This browser does not support these notifications. Use the reminder list instead.");
      if (await Notification.requestPermission() !== "granted") throw new Error("Notifications are blocked. You can allow them in your browser’s site settings.");
      enableReminders(owner, true); setEnabled(true); setError(""); await notifyDueReminders(owner, await Api.fetchReminders());
    } catch (error) { setError(error instanceof Error ? error.message : "Could not enable notifications."); }
  };
  const entries = (list?.entries ?? []).filter(entry => filter === "all" || (filter === "completed" ? Boolean(entry.completedAt) : !entry.completedAt)).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  return <dialog ref={dialog} className="reminder-dialog" aria-labelledby="reminders-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><div><h2 id="reminders-title">Reminders</h2><p>Private note reviews and task reminders.</p></div><button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>Close</button></header>
    <p>Notifications are checked about once a minute while the workspace is open and online. Closed or sleeping browsers cannot deliver these reminders. Notifications show a count without note titles or task text.</p>
    <div className="reminder-actions"><button type="button" className="btn-ghost" onClick={() => void toggleNotifications()}>{enabled ? "Turn off browser notifications" : "Enable browser notifications"}</button><button type="button" className="btn-ghost" disabled={busy} onClick={() => void reload()}>Refresh reminders</button></div>
    <details className="reminder-create" open={!list?.entries.length}><summary>Schedule a reminder</summary><form onSubmit={event => {
      event.preventDefault(); const date = new Date(dueAt); if (!Number.isFinite(date.getTime())) { setError("Choose a valid date and time."); return; }
      const source = notes.find(note => note._id === noteId), line = taskLine ? Number(taskLine) : undefined;
      void change({ action: "create", id: crypto.randomUUID(), noteId, dueAt: date.toISOString(), repeatDays, ...(line ? { taskLine: line, sourceText: source?.type === "document" ? source.content.split(/\r?\n/)[line - 1] : undefined } : {}) });
    }}>
      <label>Source note<select aria-label="Source note" value={noteId} disabled={busy} onChange={event => { setNoteId(event.target.value); setTaskLine(""); }}>{!noteId && <option value="">Choose a note</option>}{notes.map(note => <option key={note._id} value={note._id}>{note.title}</option>)}</select></label>
      <label>Review<select aria-label="Review" value={taskLine} disabled={busy} onChange={event => { setTaskLine(event.target.value); const task = tasks.find(task => String(task.line) === event.target.value); if (task?.due) setDueAt(task.due + "T09:00"); }}><option value="">Whole note</option>{tasks.map(task => <option key={task.line} value={task.line}>{task.text.slice(0, 100)} · line {task.line}</option>)}</select></label>
      <label>When (your local time)<input type="datetime-local" required value={dueAt} disabled={busy} onChange={event => setDueAt(event.target.value)} /></label>
      <label>Repeat review every<select aria-label="Repeat review every" value={repeatDays} disabled={busy} onChange={event => setRepeatDays(Number(event.target.value))}><option value={0}>Once</option><option value={1}>Day</option><option value={7}>Week</option><option value={30}>30 days</option><option value={90}>90 days</option></select></label>
      <p>Repeating reviews advance after you mark the reminder reviewed. This does not change a task’s checkbox.</p><button type="submit" className="btn-primary" disabled={busy || !list || !noteId || list.entries.length >= 100}>Save reminder</button>
    </form></details>
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}{!list && !error && <p role="status">Loading reminders…</p>}
    <label>Show reminders<select aria-label="Show reminders" value={filter} onChange={event => setFilter(event.target.value)}><option value="active">Active</option><option value="completed">Completed</option><option value="all">All</option></select></label>
    <p>{list?.entries.length ?? 0} / 100 reminders</p><ul>{entries.map(entry => <li key={entry.id} className="reminder-entry"><h3>{entry.title}</h3>{entry.taskText && <p>{entry.taskText}</p>}<p>{entry.completedAt ? "Completed" : Date.parse(entry.dueAt) <= now ? "Due" : "Upcoming"} · {new Date(entry.dueAt).toLocaleString()}{entry.repeatDays ? ` · Review every ${entry.repeatDays} days` : ""}</p>
      {!entry.available ? <p>Source access is unavailable. Notifications are paused for this reminder.</p> : entry.sourceChanged ? <p>The selected task moved or changed. Open the source and replace this reminder; notifications are paused.</p> : entry.taskDone ? <p>The source task is complete. No notification will be shown.</p> : null}
      <div className="reminder-actions"><button type="button" className="btn-ghost" disabled={busy || !entry.available} onClick={() => { onClose(); onOpenNote(entry.noteId); }}>Open source</button><button type="button" className="btn-ghost" disabled={busy || Boolean(entry.completedAt)} onClick={() => void change({ action: "complete", id: entry.id })}>{entry.repeatDays ? "Reviewed · schedule next" : "Mark reminder done"}</button><button type="button" className="btn-ghost" disabled={busy} onClick={() => void change({ action: "snooze", id: entry.id, dueAt: new Date(Date.now() + 86400000).toISOString() })}>Remind in 24 hours</button><button type="button" className="btn-ghost" disabled={busy} onClick={() => { if (window.confirm("Delete this private reminder?")) void change({ action: "delete", id: entry.id }); }}>Delete reminder</button></div>
    </li>)}</ul>{list && !entries.length && <p>No reminders for this filter.</p>}
  </dialog>;
}
