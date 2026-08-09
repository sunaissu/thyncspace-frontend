import { NoteboardSession } from "@sunaissu/noteboard";

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
export interface WhiteboardNote extends BaseNote {
  type: NoteType.Whiteboard;
  content: NoteboardSession | string;
}

export type Note = DocumentNote | WhiteboardNote;

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
    let elements: unknown[] = [];
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
            elements = parsed.elements;
          }
        } catch {
          // ignore
        }
      } else {
        elements = note.content.elements || [];
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
