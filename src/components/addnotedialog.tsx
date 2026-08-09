import {
  ArrowRightIcon,
  FileTextIcon,
  SpinnerBallIcon,
  SquaresFourIcon,
  XIcon,
} from "@phosphor-icons/react";
import React, { useEffect, useRef, useState } from "react";
import { NoteType } from "../model/note";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (type: NoteType) => Promise<void> | void;
}

const AddNoteDialog: React.FC<Props> = ({ open, onOpenChange, onSave }) => {
  const [loadingType, setLoadingType] = useState<NoteType | null>(null);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstChoiceRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => firstChoiceRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loadingType) {
        setError("");
        onOpenChange(false);
        return;
      }

      if (event.key !== "Tab") return;
      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (!firstElement || !lastElement) return;

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [loadingType, onOpenChange, open]);

  const closeDialog = () => {
    if (!loadingType) {
      setError("");
      onOpenChange(false);
    }
  };

  const addNote = async (type: NoteType) => {
    if (loadingType) return;
    setLoadingType(type);
    setError("");

    try {
      await onSave(type);
      onOpenChange(false);
    } catch (createError) {
      console.error("Failed to create note", createError);
      setError("The note could not be created. Please try again.");
    } finally {
      setLoadingType(null);
    }
  };

  if (!open) return null;

  return (
    <div
      className="modal-backdrop new-note-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <div
        ref={dialogRef}
        className="modal-panel new-note-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-note-dialog-title"
        aria-describedby="new-note-dialog-description"
      >
        <header className="new-note-dialog-header">
          <div>
            <span className="eyebrow">Create</span>
            <h2 id="new-note-dialog-title">Choose your note space</h2>
            <p id="new-note-dialog-description">
              Start with a familiar document or an open visual canvas.
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={closeDialog}
            disabled={Boolean(loadingType)}
            aria-label="Close new note dialog"
          >
            <XIcon size={18} />
          </button>
        </header>

        <div className="new-note-choices">
          <button
            ref={firstChoiceRef}
            type="button"
            className="new-note-choice"
            onClick={() => addNote(NoteType.Document)}
            disabled={Boolean(loadingType)}
          >
            <span className="new-note-choice-icon document">
              <FileTextIcon size={25} weight="bold" />
            </span>
            <span className="new-note-choice-copy">
              <strong>Note document</strong>
              <span>Write visually with headings, lists, links, and rich formatting.</span>
              <small>Markdown source remains available when you need it</small>
            </span>
            {loadingType === NoteType.Document ? (
              <SpinnerBallIcon className="spin" size={19} />
            ) : (
              <ArrowRightIcon className="new-note-choice-arrow" size={18} />
            )}
          </button>

          <button
            type="button"
            className="new-note-choice"
            onClick={() => addNote(NoteType.Whiteboard)}
            disabled={Boolean(loadingType)}
          >
            <span className="new-note-choice-icon board">
              <SquaresFourIcon size={25} weight="bold" />
            </span>
            <span className="new-note-choice-copy">
              <strong>Canvas board</strong>
              <span>Sketch ideas spatially on a flexible infinite whiteboard.</span>
              <small>Best for mapping and visual exploration</small>
            </span>
            {loadingType === NoteType.Whiteboard ? (
              <SpinnerBallIcon className="spin" size={19} />
            ) : (
              <ArrowRightIcon className="new-note-choice-arrow" size={18} />
            )}
          </button>
        </div>

        {error && <p className="new-note-dialog-error" role="alert">{error}</p>}

        <footer className="new-note-dialog-footer">
          <span>The type is fixed after creation.</span>
          <span><kbd>Esc</kbd> to cancel</span>
        </footer>
      </div>
    </div>
  );
};

export default AddNoteDialog;
