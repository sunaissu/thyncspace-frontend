import Head from "next/head";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightIcon,
  CaretDownIcon,
  CheckIcon,
  FileTextIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SidebarSimpleIcon,
  ShareNetworkIcon,
  SpinnerBallIcon,
  SquaresFourIcon,
  StarIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  DocumentNote,
  Note,
  NoteType,
  isNoteFavorited,
  noteMatchesSearch,
} from "../model/note";
import { User } from "../model/user";
import AddNoteDialog from "../components/addnotedialog";
import AppLayout from "../components/appLayout";
import NoteContext from "../context/noteContext";
import NoteTitleEditor from "../components/noteTitleEditor";
import ObsidianBridge, {
  ImportedMarkdownNote,
} from "../components/obsidianBridge";
import ShareNoteDialog from "../components/shareNoteDialog";
import * as NotesApi from "../util/fetch";

const ActiveNoteEditor = dynamic(
  () => import("../components/activeNoteEditor"),
  { ssr: false },
);

interface NotesPageProps {
  loggedInUser: User | null;
}

type NoteFilter = "all" | "shared" | "documents" | "boards" | "favorites";

const relativeDate = (date: string) => {
  const timestamp = new Date(date).getTime();
  const difference = Date.now() - timestamp;
  const minutes = Math.max(1, Math.floor(difference / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

const notePreview = (note: Note) => {
  if (note.type === NoteType.Whiteboard) return "Visual canvas";
  const content = (note as DocumentNote).content || "";
  return (
    content
      .replace(/^---[\s\S]*?---/m, "")
      .replace(/```[\s\S]*?```/g, " code ")
      .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
      .replace(/[#>*_`~\[\]()-]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Empty note"
  );
};

const Notes: React.FC<NotesPageProps> = ({ loggedInUser }) => {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitchingNote, setIsSwitchingNote] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [newNoteDialogOpen, setNewNoteDialogOpen] = useState(false);
  const [obsidianOpen, setObsidianOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [noteBrowserOpen, setNoteBrowserOpen] = useState(true);
  const [error, setError] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!router.isReady) return;
    const requestedNoteId =
      typeof router.query.noteId === "string" ? router.query.noteId : null;
    async function loadNotes() {
      try {
        setError("");
        const [ownedNotes, sharedNotes] = await Promise.all([
          NotesApi.fetchNotes(),
          NotesApi.fetchSharedNotes(),
        ]);
        const fetchedNotes = [...ownedNotes, ...sharedNotes];
        let availableNotes = fetchedNotes;
        if (
          requestedNoteId &&
          !fetchedNotes.some((note) => note._id === requestedNoteId)
        ) {
          const requestedNote = await NotesApi.fetchNote(requestedNoteId);
          availableNotes = [requestedNote, ...fetchedNotes];
        }
        const sharedOnly = router.query.filter === "shared";
        setNotes(availableNotes);
        setFilter(sharedOnly ? "shared" : "all");
        setSelectedNoteId(
          requestedNoteId ||
            (sharedOnly ? sharedNotes[0]?._id : availableNotes[0]?._id) ||
            null,
        );
      } catch (error) {
        console.error(error);
        setError(
          error instanceof Error ? error.message : "Could not load notes.",
        );
      } finally {
        setIsLoading(false);
      }
    }
    loadNotes();
  }, [router.isReady, router.query.filter, router.query.noteId]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(target.tagName)) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const closeOrSwitchNote = (newId: string | null) => {
    if (newId === selectedNoteId) return;
    setSelectedNoteId(newId);
    if (newId) {
      setIsSwitchingNote(true);
      window.setTimeout(() => setIsSwitchingNote(false), 180);
    }
  };

  const handleCreateNote = async (type: NoteType) => {
    try {
      const newNote = (await NotesApi.createNotes({
        title: "Untitled Note",
        type,
      })) as Note;
      closeOrSwitchNote(newNote._id);
      setNotes((currentNotes) => [newNote, ...currentNotes]);
      setFilter("all");
      setSearch("");
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const handleImportMarkdown = async (importedNotes: ImportedMarkdownNote[]) => {
    const createdNotes = await NotesApi.importNotes(
      importedNotes.map((importedNote) => ({
        title: importedNote.title,
        text: importedNote.content,
      })),
    );
    setNotes((currentNotes) => [...createdNotes, ...currentNotes]);
    if (createdNotes.length) {
      setSelectedNoteId(createdNotes[0]._id);
      setFilter("all");
      setSearch("");
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm("Permanently delete this note? This cannot be undone.")) {
      return;
    }
    try {
      setError("");
      await NotesApi.deleteNotes(noteId);
      const remainingNotes = notes.filter((note) => note._id !== noteId);
      setNotes(remainingNotes);
      if (selectedNoteId === noteId) {
        setSelectedNoteId(remainingNotes[0]?._id || null);
      }
    } catch (error) {
      console.error(error);
      setError(
        error instanceof Error ? error.message : "Could not delete the note.",
      );
    }
  };

  const handleToggleFavorite = async (noteId: string) => {
    try {
      setError("");
      const updatedNote = await NotesApi.toggleFavoriteNote(noteId);
      setNotes((currentNotes) =>
        currentNotes.map((note) =>
          note._id === noteId
            ? { ...note, favoritedBy: updatedNote.favoritedBy }
            : note,
        ),
      );
    } catch (error) {
      console.error(error);
      setError(
        error instanceof Error ? error.message : "Could not update favorite.",
      );
    }
  };

  const handleUpdateTitle = async (noteId: string, title: string) => {
    try {
      setError("");
      const targetNote = notes.find((note) => note._id === noteId);
      const isPrivateOwner = Boolean(
        targetNote &&
          targetNote.owner === loggedInUser?._id &&
          targetNote.sharedWith.length === 0,
      );
      const updated = isPrivateOwner
        ? await NotesApi.updatePrivateNote(noteId, { title })
        : await NotesApi.updateNotes(noteId, { title });
      setNotes((currentNotes) =>
        currentNotes.map((note) =>
          note._id === noteId
            ? { ...note, title: updated.title, updatedAt: updated.updatedAt }
            : note,
        ),
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not rename the note.",
      );
    }
  };

  const handleCollaboratorsChange = (
    collaborators: NotesApi.CollaboratorDetails[],
  ) => {
    if (!activeNote) return;
    setNotes((currentNotes) =>
      currentNotes.map((note) =>
        note._id === activeNote._id
          ? {
              ...note,
              sharedWith: collaborators.map(({ userId, permission }) => ({
                userId,
                permission,
              })),
            }
          : note,
      ),
    );
  };

  const filteredNotes = useMemo(() => {
    return notes
      .filter((note) => noteMatchesSearch(note, search))
      .filter((note) => {
        if (filter === "shared") return note.owner !== loggedInUser?._id;
        if (filter === "documents") return note.type === NoteType.Document;
        if (filter === "boards") return note.type === NoteType.Whiteboard;
        if (filter === "favorites") {
          return loggedInUser
            ? isNoteFavorited(note, loggedInUser._id)
            : false;
        }
        return true;
      })
      .sort(
        (first, second) =>
          new Date(second.updatedAt).getTime() -
          new Date(first.updatedAt).getTime(),
      );
  }, [filter, loggedInUser, notes, search]);

  const activeNote = notes.find((note) => note._id === selectedNoteId) || null;
  const isFavorite =
    activeNote && loggedInUser
      ? isNoteFavorited(activeNote, loggedInUser._id)
      : false;
  const isOwner = Boolean(
    loggedInUser && activeNote && activeNote.owner === loggedInUser._id,
  );
  const isEditor = Boolean(
    loggedInUser &&
      activeNote?.sharedWith?.some(
        (collaborator) =>
          collaborator.userId === loggedInUser._id &&
          collaborator.permission === "editor",
      ),
  );
  const canEdit = isOwner || isEditor;
  const collaborationEnabled = !isOwner || Boolean(activeNote?.sharedWith.length);

  const filterOptions: Array<{ value: NoteFilter; label: string }> = [
    { value: "all", label: "All notes" },
    { value: "shared", label: "Shared with me" },
    { value: "documents", label: "Documents" },
    { value: "boards", label: "Whiteboards" },
    { value: "favorites", label: "Starred" },
  ];

  return (
    <AppLayout>
      <NoteContext.Provider value={{ notes, setNotes }}>
        <Head>
          <title>Workspace | ThyncSpace</title>
          <meta
            name="description"
            content="Write, connect, and think in your ThyncSpace notes workspace."
          />
        </Head>

        <div className={activeNote ? "notes-page has-active-note" : "notes-page"}>
          <header className="workspace-topbar">
            <div className="workspace-title">
              <span className="eyebrow">Workspace</span>
              <div>
                <h1>Notes</h1>
                <span className="notes-count">{notes.length}</span>
              </div>
            </div>
            <div className="workspace-actions">
              <button
                type="button"
                className={noteBrowserOpen ? "note-list-toggle is-active" : "note-list-toggle"}
                onClick={() => setNoteBrowserOpen((open) => !open)}
                aria-controls="note-browser-panel"
                aria-expanded={noteBrowserOpen}
                title={noteBrowserOpen ? "Hide note list" : "Show note list"}
              >
                <SidebarSimpleIcon size={17} />
                <span>{noteBrowserOpen ? "Hide list" : "Show list"}</span>
              </button>
              <button
                type="button"
                className="new-note-button"
                onClick={() => setNewNoteDialogOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={newNoteDialogOpen}
              >
                <PlusIcon size={17} weight="bold" />
                New note
                <CaretDownIcon size={13} weight="bold" />
              </button>
            </div>
          </header>

          {error && (
            <p className="new-note-dialog-error" role="alert">
              {error}{" "}
              <button type="button" className="btn-ghost" onClick={() => setError("")}>
                Dismiss
              </button>
            </p>
          )}

          <div
            className={`${activeNote ? "notes-workspace has-active-note" : "notes-workspace"}${noteBrowserOpen ? "" : " is-browser-collapsed"}`}
          >
            <aside className="note-browser" id="note-browser-panel">
              <div className="note-browser-tools">
                <label className="note-search">
                  <MagnifyingGlassIcon size={17} />
                  <input
                    ref={searchInputRef}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search everything"
                    aria-label="Search notes"
                  />
                  {!search && <kbd>/</kbd>}
                  {search && (
                    <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
                      <XIcon size={14} />
                    </button>
                  )}
                </label>

                <label className="note-filter-select">
                  <span>Filter notes</span>
                  <select
                    value={filter}
                    onChange={(event) => setFilter(event.target.value as NoteFilter)}
                  >
                    {filterOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="note-list" aria-label="Notes">
                {isLoading ? (
                  <div className="note-list-loading">
                    <SpinnerBallIcon className="spin" size={24} />
                    Loading your notes…
                  </div>
                ) : (
                  filteredNotes.map((note) => {
                    const favorite = loggedInUser
                      ? isNoteFavorited(note, loggedInUser._id)
                      : false;
                    const sharedWithUser = note.owner !== loggedInUser?._id;
                    const permission = note.sharedWith.find(
                      ({ userId }) => userId === loggedInUser?._id,
                    )?.permission;
                    return (
                      <button
                        key={note._id}
                        type="button"
                        className={note._id === selectedNoteId ? "note-list-item is-active" : "note-list-item"}
                        onClick={() => closeOrSwitchNote(note._id)}
                        aria-current={note._id === selectedNoteId ? "true" : undefined}
                      >
                        <span className={note.type === NoteType.Document ? "note-type-icon document" : "note-type-icon board"}>
                          {note.type === NoteType.Document ? (
                            <FileTextIcon size={17} weight="bold" />
                          ) : (
                            <SquaresFourIcon size={17} weight="bold" />
                          )}
                        </span>
                        <span className="note-list-copy">
                          <span className="note-list-title-row">
                            <strong>{note.title || "Untitled"}</strong>
                            <time title={new Date(note.updatedAt).toLocaleString()}>
                              {relativeDate(note.updatedAt)}
                            </time>
                          </span>
                          <span className="note-list-preview">{notePreview(note)}</span>
                          <span className="note-list-meta">
                            {favorite && <StarIcon size={11} weight="fill" />}
                            {note.type === NoteType.Document ? "Document" : "Whiteboard"}
                            {sharedWithUser ? (
                              <span>
                                Shared · {permission === "editor" ? "Can edit" : "View only"}
                              </span>
                            ) : note.sharedWith?.length > 0 ? (
                              <span>{note.sharedWith.length} shared</span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}

                {!isLoading && filteredNotes.length === 0 && (
                  <div className="note-list-empty">
                    <MagnifyingGlassIcon size={24} />
                    <strong>
                      {search
                        ? "No matching notes"
                        : filter === "shared"
                          ? "Nothing shared with you"
                          : "Nothing here yet"}
                    </strong>
                    <span>
                      {search
                        ? "Try a different word or filter."
                        : filter === "shared"
                          ? "Notes others share with you will appear here."
                          : "Create a document or import Markdown."}
                    </span>
                  </div>
                )}
              </div>

              <div className="note-browser-footer">
                <span>Updated automatically</span>
                <button type="button" onClick={() => setObsidianOpen(true)}>
                  Import Markdown
                </button>
              </div>
            </aside>

            <section className="note-stage">
              {activeNote ? (
                <>
                  <header className="active-note-header">
                    <button
                      type="button"
                      className="mobile-back-button"
                      onClick={() => closeOrSwitchNote(null)}
                      aria-label="Back to notes"
                    >
                      <SidebarSimpleIcon size={19} />
                    </button>
                    <div className="active-note-heading">
                      <NoteTitleEditor
                        key={activeNote._id}
                        note={activeNote}
                        readOnly={!canEdit}
                        onUpdateTitle={handleUpdateTitle}
                      />
                      <div className="active-note-context">
                        <span>{activeNote.type === NoteType.Document ? "Note document" : "Whiteboard"}</span>
                        <span className="context-separator">/</span>
                        {saveStatus === "saving" && (
                          <span className="save-status">
                            <SpinnerBallIcon className="spin" size={12} /> Saving
                          </span>
                        )}
                        {saveStatus === "saved" && (
                          <span className="save-status is-saved">
                            <CheckIcon size={12} weight="bold" /> Saved
                          </span>
                        )}
                        {saveStatus === "idle" && <span>Autosaved</span>}
                      </div>
                    </div>

                    <div className="active-note-actions">
                      <button
                        type="button"
                        className={isFavorite ? "icon-button is-favorite" : "icon-button"}
                        onClick={() => handleToggleFavorite(activeNote._id)}
                        title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                      >
                        <StarIcon size={19} weight={isFavorite ? "fill" : "regular"} />
                      </button>
                      {isOwner && (
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => setShareDialogOpen(true)}
                          title="Share note"
                          aria-label="Share note"
                        >
                          <ShareNetworkIcon size={19} />
                        </button>
                      )}
                      {isOwner && (
                        <button
                          type="button"
                          className="icon-button danger-on-hover"
                          onClick={() => handleDeleteNote(activeNote._id)}
                          title="Delete note"
                          aria-label="Delete note"
                        >
                          <TrashIcon size={19} />
                        </button>
                      )}
                    </div>
                  </header>

                  <div className="active-note-editor">
                    {isSwitchingNote ? (
                      <div className="note-switching">
                        <SpinnerBallIcon className="spin" size={30} />
                      </div>
                    ) : (
                      <ActiveNoteEditor
                        key={`${activeNote._id}:${collaborationEnabled ? "live" : "private"}`}
                        collaborationEnabled={collaborationEnabled}
                        note={activeNote}
                        readOnly={!canEdit}
                        user={loggedInUser}
                        onSaveStatusChange={setSaveStatus}
                      />
                    )}
                  </div>
                </>
              ) : (
                <div className="workspace-empty-state">
                  <div className="empty-state-visual">
                    <div className="empty-note-page page-back" />
                    <div className="empty-note-page page-front">
                      <span />
                      <span />
                      <span />
                      <span className="short" />
                    </div>
                  </div>
                  <span className="eyebrow">Your thinking space</span>
                  <h2>Capture the thought.<br />Shape it later.</h2>
                  <p>
                    Open a note from the list, start a fresh document, or bring in the Markdown you already have.
                  </p>
                  <div className="empty-state-actions">
                    <button
                      type="button"
                      className="new-note-button"
                      onClick={() => setNewNoteDialogOpen(true)}
                      aria-haspopup="dialog"
                    >
                      <PlusIcon size={17} weight="bold" /> New note
                      <CaretDownIcon size={13} weight="bold" />
                    </button>
                    <button type="button" className="empty-import-button" onClick={() => setObsidianOpen(true)}>
                      Import from Obsidian <ArrowRightIcon size={15} />
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>

        <AddNoteDialog
          open={newNoteDialogOpen}
          onOpenChange={setNewNoteDialogOpen}
          onSave={handleCreateNote}
        />

        <ObsidianBridge
          open={obsidianOpen}
          notes={notes}
          activeNote={activeNote}
          onClose={() => setObsidianOpen(false)}
          onImport={handleImportMarkdown}
        />

        <ShareNoteDialog
          open={shareDialogOpen}
          note={activeNote}
          onClose={() => setShareDialogOpen(false)}
          onCollaboratorsChange={handleCollaboratorsChange}
        />
      </NoteContext.Provider>
    </AppLayout>
  );
};

export default Notes;
