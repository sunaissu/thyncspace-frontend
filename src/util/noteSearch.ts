import type { Note } from "../model/note";
import { documentationPlainText, parseDocumentation } from "./documentation";
export interface SearchFilters { owner: "all" | "mine" | "shared"; type: "all" | "document" | "whiteboard" | "documentation"; tag: string; from: string; to: string }
export const emptySearchFilters: SearchFilters = { owner: "all", type: "all", tag: "", from: "", to: "" };
export function matchesFilters(note: Note, filters: SearchFilters, userId?: string) {
  if (filters.owner === "mine" && note.owner !== userId) return false;
  if (filters.owner === "shared" && note.owner === userId) return false;
  if (filters.type !== "all" && note.type !== filters.type) return false;
  if (filters.tag.trim() && !note.tags?.includes(filters.tag.trim().toLowerCase())) return false;
  const day = note.updatedAt?.slice(0, 10) ?? "";
  return (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to);
}
export function noteSearchSnippet(note: Note, query: string) {
  let value = "";
  if (note.type === "document") value = note.content;
  else if (note.type === "documentation") { const content = parseDocumentation(note.content); if (content) value = documentationPlainText(content); }
  else {
    try {
      const board = typeof note.content === "string" ? JSON.parse(note.content) : note.content;
      if (Array.isArray(board?.elements)) value = board.elements.filter((item: { isDeleted?: boolean; text?: unknown }) => !item.isDeleted && typeof item.text === "string").map((item: { text: string }) => item.text).join(" · ");
    } catch { /* Invalid legacy board text cannot contribute a snippet. */ }
  }
  value = value.replace(/\s+/g, " ").trim();
  const index = value.toLowerCase().indexOf(query.trim().toLowerCase());
  const start = Math.max(0, index - 50);
  return (start ? "…" : "") + value.slice(start, start + 180) + (value.length > start + 180 ? "…" : "");
}
