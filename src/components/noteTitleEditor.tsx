import React, { useEffect, useRef, useState } from "react";
import { Note } from "../model/note";

interface NoteTitleEditorProps {
  note: Note;
  readOnly?: boolean;
  onUpdateTitle: (noteId: string, newTitle: string) => Promise<void>;
}

const NoteTitleEditor: React.FC<NoteTitleEditorProps> = ({
  note,
  readOnly,
  onUpdateTitle,
}) => {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(note.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  const commitTitleEdit = async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === note.title) {
      setEditingTitle(false);
      setTitleDraft(note.title);
      return;
    }
    await onUpdateTitle(note._id, trimmed);
    setEditingTitle(false);
  };

  if (editingTitle && !readOnly) {
    return (
      <input
        ref={titleInputRef}
        className="active-note-title-input"
        value={titleDraft}
        maxLength={200}
        onChange={(event) => setTitleDraft(event.target.value)}
        onBlur={commitTitleEdit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setEditingTitle(false);
            setTitleDraft(note.title);
          }
        }}
        aria-label="Note title"
      />
    );
  }

  if (readOnly) {
    return <h2 className="active-note-title is-read-only">{note.title}</h2>;
  }

  return (
    <button
      type="button"
      className="active-note-title"
      title="Click to rename"
      onClick={() => {
        setTitleDraft(note.title);
        setEditingTitle(true);
      }}
    >
      {note.title}
    </button>
  );
};

export default NoteTitleEditor;
