import type {
  NoteboardElement,
  NoteboardViewport,
} from "@sunaissu/noteboard";

export type PermissionLevel = "viewer" | "editor";

export enum NoteType {
  Document = "document",
  Whiteboard = "whiteboard",
}

export interface Collaborator {
  userId: string;
  permission: PermissionLevel;
}

export interface BaseNote {
  _id: string;
  title: string;
  owner: string;
  sharedWith: Collaborator[];
  favoritedBy: string[];
  createdAt: string;
  updatedAt: string;
}
export interface DocumentNote extends BaseNote {
  type: NoteType.Document;
  content: string;
}

export interface WhiteboardContent {
  boardId?: string;
  elements: NoteboardElement[];
  savedAt?: string;
  threadId?: string;
  updatedAt?: string;
  version?: number;
  viewport: NoteboardViewport;
}

export interface WhiteboardNote extends BaseNote {
  type: NoteType.Whiteboard;
  content: WhiteboardContent | string;
}

export type Note = DocumentNote | WhiteboardNote;

const NOTEBOARD_ELEMENT_TYPES = new Set<NoteboardElement["type"]>([
  "rectangle",
  "ellipse",
  "diamond",
  "triangle",
  "line",
  "arrow",
  "text",
  "draw",
  "pen",
  "image",
  "frame",
  "star",
  "sticky-note",
  "callout",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isFinitePoint = (value: unknown) =>
  isRecord(value) && Number.isFinite(value.x) && Number.isFinite(value.y);

const isSafeNoteboardElement = (
  value: unknown,
): value is NoteboardElement => {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.type !== "string" ||
    !NOTEBOARD_ELEMENT_TYPES.has(value.type as NoteboardElement["type"]) ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.width) ||
    !Number.isFinite(value.height)
  ) {
    return false;
  }

  if (["line", "arrow", "draw", "pen"].includes(value.type)) {
    if (!Array.isArray(value.points) || !value.points.every(isFinitePoint)) {
      return false;
    }
  }
  if (value.type === "text" && typeof value.text !== "string") return false;
  if (value.type === "image" && typeof value.dataUrl !== "string") return false;

  return true;
};

export function sanitizeNoteboardElements(value: unknown): NoteboardElement[] {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set<string>();
  return value.filter((element): element is NoteboardElement => {
    if (!isSafeNoteboardElement(element) || seenIds.has(element.id)) return false;
    seenIds.add(element.id);
    return true;
  });
}

export function sanitizeNoteboardViewport(value: unknown): NoteboardViewport {
  const viewport = isRecord(value) ? value : {};
  return {
    panX: Number.isFinite(viewport.panX) ? (viewport.panX as number) : 0,
    panY: Number.isFinite(viewport.panY) ? (viewport.panY as number) : 0,
    zoom:
      Number.isFinite(viewport.zoom) && (viewport.zoom as number) > 0
        ? (viewport.zoom as number)
        : 1,
  };
}

export function isNoteFavorited(note: BaseNote, userId: string): boolean {
  return note.favoritedBy?.includes(userId) ?? false;
}

export function noteMatchesSearch(note: Note, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();

  if ((note.title || "").toLowerCase().includes(term)) return true;

  if (note.type === NoteType.Document) {
    const content = note.content || "";
    if (typeof content === "string" && content.toLowerCase().includes(term))
      return true;
  } else if (note.type === NoteType.Whiteboard) {
    let elements: NoteboardElement[] = [];
    if (note.content) {
      if (typeof note.content === "string") {
        try {
          const parsed: unknown = JSON.parse(note.content);
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            "elements" in parsed &&
            Array.isArray(parsed.elements)
          ) {
            elements = sanitizeNoteboardElements(parsed.elements);
          }
        } catch {
          // ignore
        }
      } else {
        elements = sanitizeNoteboardElements(note.content.elements);
      }
    }

    for (const el of elements) {
      if (
        typeof el === "object" &&
        el !== null &&
        "text" in el &&
        typeof el.text === "string" &&
        el.text.toLowerCase().includes(term)
      ) {
        return true;
      }
    }
  }

  return false;
}
