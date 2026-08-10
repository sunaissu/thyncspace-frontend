import {
  SpinnerBallIcon,
  TrashIcon,
  UserPlusIcon,
  XIcon,
} from "@phosphor-icons/react";
import React, { FormEvent, useEffect, useRef, useState } from "react";
import { Note, NoteType } from "../model/note";
import * as NotesApi from "../util/fetch";

interface ShareNoteDialogProps {
  note: Note | null;
  open: boolean;
  onClose: () => void;
  onCollaboratorsChange: (
    collaborators: NotesApi.CollaboratorDetails[],
  ) => void;
}

const ShareNoteDialog: React.FC<ShareNoteDialogProps> = ({
  note,
  open,
  onClose,
  onCollaboratorsChange,
}) => {
  const noteId = note?._id;
  const [collaborators, setCollaborators] = useState<
    NotesApi.CollaboratorDetails[]
  >([]);
  const [identifier, setIdentifier] = useState("");
  const [permission, setPermission] = useState<"viewer" | "editor">("editor");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !noteId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    NotesApi.fetchCollaborators(noteId)
      .then((result) => {
        if (!cancelled) setCollaborators(result);
      })
      .catch((loadError) => {
        console.error(loadError);
        if (!cancelled) setError("Could not load sharing access.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      cancelled = true;
    };
  }, [noteId, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open, saving]);

  if (!open || !note) return null;

  const notifyChange = (next: NotesApi.CollaboratorDetails[]) => {
    setCollaborators(next);
    onCollaboratorsChange(next);
  };

  const currentSnapshot = (): { text: string } => {
    const text = note.type === NoteType.Document
      ? note.content
      : typeof note.content === "string"
        ? note.content
        : JSON.stringify(note.content);
    return { text };
  };

  const addCollaborator = async (event: FormEvent) => {
    event.preventDefault();
    if (!identifier.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const collaborator = await NotesApi.shareNote(
        note._id,
        identifier.trim(),
        permission,
        collaborators.length === 0 ? currentSnapshot() : undefined,
      );
      const next = [
        ...collaborators.filter((item) => item.userId !== collaborator.userId),
        collaborator,
      ];
      notifyChange(next);
      setIdentifier("");
      inputRef.current?.focus();
    } catch (shareError) {
      console.error(shareError);
      setError(
        shareError instanceof Error ? shareError.message : "Could not share note.",
      );
    } finally {
      setSaving(false);
    }
  };

  const changePermission = async (
    collaborator: NotesApi.CollaboratorDetails,
    nextPermission: "viewer" | "editor",
  ) => {
    if (saving || collaborator.permission === nextPermission) return;
    setSaving(true);
    setError("");
    try {
      const updated = await NotesApi.shareNote(
        note._id,
        collaborator.username,
        nextPermission,
      );
      notifyChange(
        collaborators.map((item) =>
          item.userId === updated.userId ? updated : item,
        ),
      );
    } catch (permissionError) {
      console.error(permissionError);
      setError("Could not change that permission.");
    } finally {
      setSaving(false);
    }
  };

  const removeCollaborator = async (
    collaborator: NotesApi.CollaboratorDetails,
  ) => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await NotesApi.unshareNote(note._id, collaborator.userId);
      notifyChange(
        collaborators.filter((item) => item.userId !== collaborator.userId),
      );
    } catch (removeError) {
      console.error(removeError);
      setError("Could not remove that collaborator.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop new-note-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="modal-panel new-note-dialog share-note-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-note-title"
      >
        <header className="new-note-dialog-header">
          <div>
            <span className="eyebrow">Live collaboration</span>
            <h2 id="share-note-title">Share “{note.title || "Untitled"}”</h2>
            <p>Editors can work with you in real time. Viewers always stay read-only.</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close sharing dialog"
          >
            <XIcon size={18} />
          </button>
        </header>

        <form className="share-note-form" onSubmit={addCollaborator}>
          <label>
            <span>Username or email</span>
            <input
              ref={inputRef}
              className="input-base"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="teammate@example.com"
              disabled={saving}
            />
          </label>
          <label>
            <span>Access</span>
            <select
              className="input-base"
              value={permission}
              onChange={(event) =>
                setPermission(event.target.value as "viewer" | "editor")
              }
              disabled={saving}
            >
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
          </label>
          <button
            type="submit"
            className="new-note-button"
            disabled={!identifier.trim() || saving}
          >
            {saving ? (
              <SpinnerBallIcon className="spin" size={17} />
            ) : (
              <UserPlusIcon size={17} weight="bold" />
            )}
            Share
          </button>
        </form>

        {error && <p className="new-note-dialog-error" role="alert">{error}</p>}

        <section className="share-note-access" aria-label="People with access">
          <h3>People with access</h3>
          {loading ? (
            <div className="share-note-loading">
              <SpinnerBallIcon className="spin" size={20} /> Loading access…
            </div>
          ) : collaborators.length === 0 ? (
            <p className="share-note-empty">Only you can open this note.</p>
          ) : (
            <div className="share-note-list">
              {collaborators.map((collaborator) => (
                <div className="share-note-person" key={collaborator.userId}>
                  <span className="share-note-avatar">
                    {collaborator.username.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="share-note-identity">
                    <strong>{collaborator.username}</strong>
                    <small>{collaborator.email}</small>
                  </span>
                  <select
                    className="share-note-permission"
                    value={collaborator.permission}
                    onChange={(event) =>
                      changePermission(
                        collaborator,
                        event.target.value as "viewer" | "editor",
                      )
                    }
                    disabled={saving}
                    aria-label={`Access for ${collaborator.username}`}
                  >
                    <option value="editor">Can edit</option>
                    <option value="viewer">Can view</option>
                  </select>
                  <button
                    type="button"
                    className="icon-button danger-on-hover"
                    onClick={() => removeCollaborator(collaborator)}
                    disabled={saving}
                    title="Remove access"
                    aria-label={`Remove ${collaborator.username}`}
                  >
                    <TrashIcon size={17} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default ShareNoteDialog;
