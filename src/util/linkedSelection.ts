import { sanitizeNoteboardElements, sanitizeNoteboardViewport, type LinkedSelection } from "../model/note";
import type { LinkedPreview } from "./fetch";

export function readBoard(content: string) {
  const raw = JSON.parse(content), elements = sanitizeNoteboardElements(raw?.elements);
  if (!Array.isArray(raw?.elements) || elements.length !== raw.elements.length) throw new Error("This board could not be read. Open the source to inspect it.");
  return { elements, viewport: sanitizeNoteboardViewport(raw.viewport) };
}
export function selectedContent(value: LinkedPreview): string {
  const selection = value.selection;
  if (!selection) return value.content;
  if (selection.needsReview || selection.revision !== value.revision) throw new Error("The source changed. Choose the excerpt or board objects again before previewing or exporting this selection.");
  if (selection.kind === "lines" && value.type === "document") return value.content.split("\n").slice(selection.start - 1, selection.end).join("\n");
  if (selection.kind === "elements" && value.type === "whiteboard") {
    const board = readBoard(value.content), ids = new Set(selection.ids);
    return JSON.stringify({ ...board, elements: board.elements.filter(element => ids.has(element.id) && !element.isDeleted) });
  }
  throw new Error("The source type changed. Choose its content again.");
}
export const selectionDescription = (selection?: LinkedSelection | null) => !selection ? "Whole source" : selection.kind === "lines" ? `Lines ${selection.start}–${selection.end}` : `${selection.ids.length} selected board objects`;
export const escapeExport = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
export function sourceExport(value: LinkedPreview, origin: string, image?: string) {
  const url = new URL("/notes/", origin); url.searchParams.set("noteId", value.noteId);
  const content = selectedContent(value);
  if (value.type === "whiteboard" && (!image || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image))) throw new Error("The board image could not be exported.");
  const text = value.type === "document" ? content : readBoard(content).elements.map(element => `${element.type}${"text" in element ? ": " + element.text : ""}`).join("\n");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeExport(value.title)}</title><style>body{max-width:70rem;margin:2rem auto;padding:1rem;font:16px/1.6 system-ui}pre{white-space:pre-wrap;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style><h1>${escapeExport(value.title)}</h1><p>${escapeExport(selectionDescription(value.selection))} · revision ${value.revision} · static copy</p><p><a href="${escapeExport(url.href)}" rel="noreferrer">Open source in Thyncspace</a></p>${image ? `<img src="${image}" alt="Selected board content"><details><summary>Board text and object types</summary><pre>${escapeExport(text)}</pre></details>` : `<pre>${escapeExport(text)}</pre>`}</html>`;
}
