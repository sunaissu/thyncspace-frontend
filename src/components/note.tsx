import React from "react";
import {
  Note as NoteModel,
  NoteType,
  DocumentNote,
  WhiteboardNote,
  isNoteFavorited,
  sanitizeNoteboardElements,
} from "../model/note";
import { formatDate } from "../util/dateformat";
import { StarIcon } from "@phosphor-icons/react";
import { NoteboardPreview } from "@sunaissu/noteboard";

interface NoteCardProps {
  note: NoteModel;
  loggedInUserId?: string;
  onOpen?: (noteId: string) => void;
  onToggleFavorite?: (noteId: string) => void;
}
const NoteCard: React.FC<NoteCardProps> = ({
  note,
  loggedInUserId,
  onOpen,
  onToggleFavorite,
}: NoteCardProps) => {
  const { title, createdAt, updatedAt } = note;

  const isFav = loggedInUserId ? isNoteFavorited(note, loggedInUserId) : false;

  let createdUpdated: string;
  if (updatedAt > createdAt) {
    createdUpdated = `Updated ${formatDate(updatedAt)}`;
  } else {
    createdUpdated = `Created ${formatDate(createdAt)}`;
  }

  return (
    <>
      <div
        className="note-card"
        onClick={() => onOpen?.(note._id)}
        style={{
          padding: "0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          height: "100%",
        }}
      >
        {/* Title row */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "0.5rem",
            marginBottom: "0.25rem",
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: "15px",
              color: "var(--color-text)",
              lineHeight: 1.3,
              wordBreak: "break-word",
              flex: 1,
            }}
          >
            {title}
          </div>
          {isFav && !onToggleFavorite && (
            <StarIcon
              size={14}
              weight="fill"
              color="var(--color-accent-yellow)"
              style={{ flexShrink: 0, marginTop: "1px" }}
            />
          )}
          {onToggleFavorite && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(note._id);
              }}
              title={isFav ? "Remove from favorites" : "Add to favorites"}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: isFav
                  ? "var(--color-accent-yellow)"
                  : "var(--color-text-muted)",
                transition: "background-color 0.15s ease, color 0.15s ease",
                padding: "2px",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor =
                  "rgba(234, 179, 8, 0.1)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <StarIcon size={16} weight={isFav ? "fill" : "bold"} />
            </button>
          )}
        </div>

        {/* Preview */}
        {note.type === NoteType.Document && (
          <div
            style={
              {
                fontSize: "13px",
                color: "var(--color-text-muted)",
                lineHeight: 1.5,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                wordBreak: "break-word",
                fontStyle: "italic",
                opacity: 0.8,
              } as React.CSSProperties
            }
          >
            {(note as DocumentNote).content || "Empty document..."}
          </div>
        )}

        {note.type === NoteType.Whiteboard && (
          <div
            style={{
              height: "110px",
              width: "100%",
              borderRadius: "6px",
              overflow: "hidden",
              background: "rgba(255, 255, 255, 0.03)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {(() => {
              const wb = note as WhiteboardNote;
              let elements = undefined;
              if (wb.content) {
                if (typeof wb.content === "string") {
                  try {
                    const parsed: unknown = JSON.parse(wb.content);
                    if (
                      typeof parsed === "object" &&
                      parsed !== null &&
                      "elements" in parsed &&
                      Array.isArray(parsed.elements)
                    ) {
                      elements = sanitizeNoteboardElements(parsed.elements);
                    }
                  } catch {}
                } else {
                  elements = sanitizeNoteboardElements(wb.content.elements);
                }
              }
              if (elements && elements.length > 0) {
                return (
                  <NoteboardPreview
                    elements={elements}
                    style={{ background: "transparent" }}
                    height="100%"
                  />
                );
              }
              return (
                <span
                  style={{ fontSize: "11px", color: "var(--color-text-muted)" }}
                >
                  Empty board...
                </span>
              );
            })()}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "auto",
            paddingTop: "0.75rem",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              color: "var(--color-text-muted)",
              fontWeight: 500,
              letterSpacing: "0.02em",
            }}
          >
            {createdUpdated}
          </span>
          <span
            style={{
              fontSize: "9px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "2px 6px",
              borderRadius: "4px",
              background: "var(--color-surface-2)",
              color: "var(--color-text-muted)",
              border: "1px solid var(--color-border)",
            }}
          >
            {note.type === NoteType.Document ? "Doc" : "Board"}
          </span>
        </div>
      </div>
    </>
  );
};

export default NoteCard;
