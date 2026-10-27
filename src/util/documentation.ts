import * as Y from "yjs";
import type { NoteboardElement, NoteboardViewport } from "@sunaissu/noteboard";
import { sanitizeNoteboardElements } from "../model/note";

export const DOCUMENTATION_FORMAT = "thyncspace-documentation" as const;
export const MAX_DOCUMENTATION_SECTIONS = 40;
export const MAX_DOCUMENTATION_BYTES = 1024 * 1024;
export const DOCUMENTATION_SECTIONS_KEY = "documentation-sections";
export const DOCUMENTATION_ORDER_KEY = "documentation-order";
export interface DocumentationTextSection { id: string; type: "text"; title: string; content: string }
export interface DocumentationBoardSection {
  id: string; type: "board"; title: string; caption: string; height: number;
  elements: NoteboardElement[]; viewport: NoteboardViewport;
}
export type DocumentationSection = DocumentationTextSection | DocumentationBoardSection;
export interface DocumentationContent { format: typeof DOCUMENTATION_FORMAT; version: 1; sections: DocumentationSection[] }
export type DocumentationTemplate = "blank" | "project" | "meeting";
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const safeId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;

export const documentationKeys = (id: string) => ({
  text: `documentation-text:${id}`, elements: `documentation-elements:${id}`,
  order: `documentation-order:${id}`, viewport: `documentation-viewport:${id}`,
});

/** Validate at the host boundary without inventing missing board properties. */
export function parseDocumentation(value: unknown): DocumentationContent | null {
  try {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    if (!serialized || bytes(serialized) > MAX_DOCUMENTATION_BYTES) return null;
    const input: unknown = JSON.parse(serialized);
    if (!isRecord(input) || input.format !== DOCUMENTATION_FORMAT || input.version !== 1 || !Array.isArray(input.sections) || input.sections.length > MAX_DOCUMENTATION_SECTIONS) return null;
    const ids = new Set<string>();
    const sections: DocumentationSection[] = [];
    for (const section of input.sections) {
      if (!isRecord(section) || !safeId(section.id) || ids.has(section.id) || typeof section.title !== "string" || section.title.length > 120) return null;
      ids.add(section.id);
      if (section.type === "text") {
        if (typeof section.content !== "string") return null;
        sections.push({ id: section.id, type: "text", title: section.title, content: section.content });
      } else if (section.type === "board") {
        if (typeof section.caption !== "string" || section.caption.length > 500 || typeof section.height !== "number" || !Number.isFinite(section.height) || section.height < 280 || section.height > 900 || !Array.isArray(section.elements) || !isRecord(section.viewport)) return null;
        const { panX, panY, zoom } = section.viewport;
        if (typeof panX !== "number" || !Number.isFinite(panX) || Math.abs(panX) > 1e9 || typeof panY !== "number" || !Number.isFinite(panY) || Math.abs(panY) > 1e9 || typeof zoom !== "number" || !Number.isFinite(zoom) || zoom < 0.1 || zoom > 5) return null;
        const rawElements = section.elements;
        const sanitized = sanitizeNoteboardElements(rawElements);
        if (sanitized.length !== rawElements.length) return null;
        const elements = sanitized.map((element, index) => {
          const original = rawElements[index] as Record<string, unknown>;
          return Object.fromEntries(Object.entries(element).filter(([key]) => Object.hasOwn(original, key))) as unknown as NoteboardElement;
        });
        sections.push({ id: section.id, type: "board", title: section.title, caption: section.caption, height: section.height, elements, viewport: { panX, panY, zoom } });
      } else return null;
    }
    return { format: DOCUMENTATION_FORMAT, version: 1, sections };
  } catch { return null; }
}

export function serializeDocumentation(content: DocumentationContent): string {
  const parsed = parseDocumentation(content);
  if (!parsed) throw new Error("Documentation must have at most 40 valid sections and fit within 1 MiB.");
  return JSON.stringify(parsed);
}

export function documentationSectionId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replaceAll("-", "")
    : `section_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function createDocumentationSection(type: "text" | "board", title = ""): DocumentationSection {
  const id = documentationSectionId();
  return type === "text"
    ? { id, type, title, content: "" }
    : { id, type, title, caption: "", height: 440, elements: [], viewport: { panX: 0, panY: 0, zoom: 1 } };
}

export function createDocumentation(template: DocumentationTemplate = "project"): DocumentationContent {
  if (template === "blank") return { format: DOCUMENTATION_FORMAT, version: 1, sections: [createDocumentationSection("text", "Introduction")] };
  const meeting = template === "meeting";
  return {
    format: DOCUMENTATION_FORMAT, version: 1,
    sections: [
      { ...createDocumentationSection("text", meeting ? "Meeting notes" : "Overview"), type: "text", content: meeting ? "## Agenda\n\n- \n\n## Decisions\n\n" : "Describe the purpose of this document and the problem it addresses.\n\n" } as DocumentationTextSection,
      createDocumentationSection("board", meeting ? "Ideas & sketches" : "Diagram"),
      { ...createDocumentationSection("text", "Next steps"), type: "text", content: "- [ ] Add your next action\n" } as DocumentationTextSection,
    ],
  };
}

export function documentationPlainText(value: unknown): string {
  const content = parseDocumentation(value);
  if (!content) return "";
  return content.sections.map(section => [section.title, section.type === "text" ? section.content : [section.caption, ...section.elements.filter(element => !element.isDeleted && !element.hidden).map(element => "text" in element ? element.text : "label" in element ? element.label : "")].filter(Boolean).join("\n")].filter(Boolean).join("\n")).join("\n\n");
}

/** Concurrent moves may repeat an ID; every live section remains visible once. */
export function documentationOrder(order: unknown[], ids: Iterable<string>): string[] {
  const remaining = new Set(ids), result: string[] = [];
  for (const id of order) if (typeof id === "string" && remaining.delete(id)) result.push(id);
  return [...result, ...Array.from(remaining).sort()];
}

export function readDocumentation(document: Y.Doc): DocumentationContent {
  const metadata = document.getMap<Y.Map<unknown>>(DOCUMENTATION_SECTIONS_KEY);
  const order = document.getArray<string>(DOCUMENTATION_ORDER_KEY);
  if (metadata.size > MAX_DOCUMENTATION_SECTIONS) throw new Error("This document has more than 40 sections. Its content has not been replaced.");
  const sections = documentationOrder(order.toArray(), metadata.keys()).map(id => {
    const fields = metadata.get(id);
    if (!safeId(id) || !(fields instanceof Y.Map)) throw new Error("A section could not be read. Its content has not been replaced.");
    const keys = documentationKeys(id), type = fields.get("type"), title = fields.get("title");
    if (type === "text") return { id, type, title, content: document.getText(keys.text).toString() };
    if (type !== "board") throw new Error("This document contains an unsupported section.");
    const elements = document.getMap<Y.Map<unknown>>(keys.elements);
    const boardOrder = document.getArray<string>(keys.order);
    const viewport = document.getMap<number>(keys.viewport);
    return {
      id, type, title, caption: fields.get("caption"), height: fields.get("height"),
      elements: documentationOrder(boardOrder.toArray(), elements.keys()).map(elementId => {
        const element = elements.get(elementId);
        if (!(element instanceof Y.Map) || element.get("id") !== elementId) throw new Error("A diagram object could not be read.");
        return element.toJSON();
      }),
      viewport: { panX: viewport.get("panX") ?? 0, panY: viewport.get("panY") ?? 0, zoom: viewport.get("zoom") ?? 1 },
    };
  });
  const parsed = parseDocumentation({ format: DOCUMENTATION_FORMAT, version: 1, sections });
  if (!parsed) throw new Error("This documentation contains invalid content or exceeds 1 MiB. The original content has been kept.");
  return parsed;
}

/** Preview against current peer edits without mutating or broadcasting the live document. */
export function previewDocumentationHistory(document: Y.Doc, history: Y.UndoManager, action: "undo" | "redo"): DocumentationContent {
  const preview = new Y.Doc({ gc: false });
  let manager: Y.UndoManager | undefined;
  try {
    Y.applyUpdate(preview, Y.encodeStateAsUpdate(document));
    // The disposable copy must allocate the same IDs as the imminent live step.
    preview.clientID = document.clientID;
    // Redone links are local history bookkeeping and are not part of Yjs updates.
    // Preserve them so repeated undo/redo follows the same retained items.
    preview.transact(transaction => {
      for (const structs of document.store.clients.values()) for (const item of structs) {
        if (!(item instanceof Y.Item) || !item.redone) continue;
        const target = Y.getItemCleanStart(transaction, item.id);
        Y.getItemCleanEnd(transaction, preview.store, Y.createID(item.id.client, item.id.clock + item.length - 1));
        target.redone = Y.createID(item.redone.client, item.redone.clock);
      }
    });
    manager = new Y.UndoManager([
      preview.getMap(DOCUMENTATION_SECTIONS_KEY), preview.getArray(DOCUMENTATION_ORDER_KEY),
    ], { captureTimeout: 0, ignoreRemoteMapChanges: history.ignoreRemoteMapChanges });
    const copyStack = (stack: Y.UndoManager["undoStack"]) => stack.map(item => ({
      insertions: structuredClone(item.insertions), deletions: structuredClone(item.deletions), meta: new Map(),
    }));
    manager.undoStack = copyStack(history.undoStack);
    manager.redoStack = copyStack(history.redoStack);
    manager[action]();
    return readDocumentation(preview);
  } finally { manager?.destroy(); preview.destroy(); }
}

/** Used only by host initialization/recovery and new sections, never ordinary typing. */
export function writeDocumentationSection(document: Y.Doc, section: DocumentationSection): void {
  const metadata = document.getMap<Y.Map<unknown>>(DOCUMENTATION_SECTIONS_KEY);
  let fields = metadata.get(section.id);
  if (!(fields instanceof Y.Map)) { fields = new Y.Map(); metadata.set(section.id, fields); }
  fields.set("type", section.type); fields.set("title", section.title);
  const keys = documentationKeys(section.id);
  if (section.type === "text") {
    fields.delete("caption"); fields.delete("height");
    const text = document.getText(keys.text);
    if (text.toString() !== section.content) { text.delete(0, text.length); if (section.content) text.insert(0, section.content); }
  } else {
    fields.set("caption", section.caption); fields.set("height", section.height);
    const elements = document.getMap<Y.Map<unknown>>(keys.elements), order = document.getArray<string>(keys.order), viewport = document.getMap<number>(keys.viewport);
    elements.clear();
    for (const element of section.elements) {
      const record = new Y.Map<unknown>(); elements.set(element.id, record);
      for (const [key, value] of Object.entries(element)) record.set(key, key === "text" && typeof value === "string" ? new Y.Text(value) : value);
    }
    order.delete(0, order.length); if (section.elements.length) order.insert(0, section.elements.map(element => element.id));
    for (const [key, value] of Object.entries(section.viewport)) viewport.set(key, value);
  }
}
