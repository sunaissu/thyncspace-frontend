import { useEffect, useRef, useState } from "react";
import type { Note } from "../model/note";
import * as Api from "../util/fetch";

const localDay = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
export default function NoteSchedules({ open, templates, onOpen, onClose }: { open: boolean; templates: Note[]; onOpen: (note: Note) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState<"daily" | "weekly">("daily");
  const [time, setTime] = useState("09:00");
  const [weekday, setWeekday] = useState(1);
  const [schedules, setSchedules] = useState<Api.NoteSchedule[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef({ value: 0 });
  useEffect(() => {
    if (!open) return;
    const lifecycle = generation.current;
    const sequence = ++lifecycle.value;
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current; element?.showModal();
    setDate(localDay()); setError(""); setBusy(true);
    Api.fetchNoteSchedules().then(value => { if (sequence === lifecycle.value) setSchedules(value); }).catch(error => { if (sequence === lifecycle.value) setError(error instanceof Error ? error.message : "Could not load schedules."); }).finally(() => { if (sequence === lifecycle.value) setBusy(false); });
    return () => { lifecycle.value++; element?.close(); previous?.focus(); };
  }, [open]);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    const sequence = generation.current.value;
    setBusy(true); setError("");
    try { await action(); } catch (error) { if (sequence === generation.current.value) setError(error instanceof Error ? error.message : "Could not update scheduled notes."); }
    finally { if (sequence === generation.current.value) setBusy(false); }
  };
  const openNote = (note: Note) => { onOpen(note); onClose(); };
  return <dialog ref={dialog} className="note-schedules-dialog" aria-labelledby="note-schedules-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><h2 id="note-schedules-title">Daily and recurring notes</h2><button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>Close</button></header>
    <p>Use an owned document or board template. Every generated note starts private.</p>
    <label>Template<select value={templateId} disabled={busy} onChange={event => setTemplateId(event.target.value)}><option value="">Blank document (daily note only)</option>{templates.map(note => <option key={note._id} value={note._id}>{note.title} · {note.type}</option>)}</select></label>
    <form onSubmit={event => { event.preventDefault(); void perform(async () => openNote(await Api.openDailyNote(date, templateId || undefined))); }}>
      <h3>Daily note</h3><label>Daily note date<input type="date" required value={date} disabled={busy} onChange={event => setDate(event.target.value)} /></label>
      <p>Opening the same date returns the same note. The template is used only on its first creation.</p>
      <button type="submit" className="btn-primary" disabled={busy || !date}>Open daily note</button>
    </form>
    <form onSubmit={event => { event.preventDefault(); void perform(async () => { const value = await Api.createNoteSchedule({ templateId, title, cadence, time, weekday }); setSchedules(current => [...current, value]); setTitle(""); }); }}>
      <h3>Recurring template</h3><label>Schedule title<input required maxLength={120} value={title} disabled={busy} onChange={event => setTitle(event.target.value)} /></label>
      <label>Repeat<select value={cadence} disabled={busy} onChange={event => setCadence(event.target.value as "daily" | "weekly")}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
      <label>Creation time (UTC)<input type="time" required value={time} disabled={busy} onChange={event => setTime(event.target.value)} /></label>
      {cadence === "weekly" && <label>Weekday (UTC)<select value={weekday} disabled={busy} onChange={event => setWeekday(Number(event.target.value))}>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>}
      <p>The server runs schedules every minute, including while your browser is closed. After downtime it creates one missed note, then schedules the next future run. Maximum 20 schedules.</p>
      <button type="submit" className="btn-primary" disabled={busy || !templateId || !title.trim() || schedules.length >= 20}>Create recurring notes</button>
    </form>
    <h3>Schedules</h3><button type="button" className="btn-ghost" disabled={busy} onClick={() => void perform(async () => setSchedules(await Api.fetchNoteSchedules()))}>Refresh schedules</button>
    {schedules.map(schedule => <article key={schedule.id} className="note-schedule-row"><h4>{schedule.title}</h4><p>{schedule.isActive ? `Next: ${new Date(schedule.nextRunAt).toLocaleString()}` : "Paused"} · {schedule.cadence} at {schedule.time} UTC</p>{schedule.error && <p role="alert">{schedule.error}</p>}
      <div><button type="button" className="btn-ghost" disabled={busy} onClick={() => void perform(async () => { const saved = await Api.changeNoteSchedule(schedule.id, !schedule.isActive); setSchedules(current => current.map(item => item.id === saved.id ? saved : item)); })}>{schedule.isActive ? "Pause" : "Resume"} {schedule.title}</button>
      {schedule.lastNoteId && <button type="button" className="btn-ghost" disabled={busy} onClick={() => void perform(async () => openNote(await Api.fetchNote(schedule.lastNoteId!)))}>Open latest {schedule.title}</button>}
      <button type="button" className="btn-ghost" disabled={busy} onClick={() => { if (window.confirm(`Remove ${schedule.title}? Previously created notes will remain.`)) void perform(async () => { await Api.deleteNoteSchedule(schedule.id); setSchedules(current => current.filter(item => item.id !== schedule.id)); }); }}>Remove {schedule.title}</button></div>
    </article>)}
    {busy && <p role="status">Working…</p>}{error && <p role="alert">{error}</p>}
  </dialog>;
}
