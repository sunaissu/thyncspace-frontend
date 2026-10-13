import type { Note } from "../model/note";

export interface NoteTask { noteId: string; noteTitle: string; line: number; text: string; done: boolean; due?: string }
export function collectNoteTasks(notes: Note[]): NoteTask[] {
  const tasks: NoteTask[] = [];
  for (const note of notes) {
    if (note.type !== "document" || typeof note.content !== "string") continue;
    let fence = "";
    const lines = note.content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const delimiter = /^\s{0,3}(`{3,}|~{3,})/.exec(lines[index]);
      if (delimiter) {
        if (!fence) fence = delimiter[1];
        else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length && !lines[index].slice(delimiter[0].length).trim()) fence = "";
        continue;
      }
      if (fence) continue;
      const match = /^\s*(?:[-+*]|\d+[.)])\s+\[([ xX])\]\s+(.+)$/.exec(lines[index]);
      if (!match) continue;
      const candidate = /(?:\bdue:\s*|📅\s*)(\d{4}-\d{2}-\d{2})(?!\d)/i.exec(match[2])?.[1];
      const timestamp = candidate ? new Date(candidate + "T00:00:00Z") : null;
      const due = timestamp && Number.isFinite(timestamp.getTime()) && timestamp.toISOString().slice(0, 10) === candidate ? candidate : undefined;
      tasks.push({ noteId: note._id, noteTitle: note.title, line: index + 1, text: match[2].slice(0, 500), done: match[1].toLowerCase() === "x", due });
      if (tasks.length >= 5000) return tasks;
    }
  }
  return tasks;
}
