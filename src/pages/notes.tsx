import type { NoteTemplate } from "../util/technicalTemplates";
import { createDocumentation, serializeDocumentation } from "../util/documentation";
import CompanionConnections from "../components/companionConnections";
import WorkspaceArchive from "../components/workspaceArchive";
import PassageAi from "../components/passageAi";
import SharedNotebooks from "../components/sharedNotebooks";
import Discussions from "../components/discussions";
import LinkedSources from "../components/linkedSources";
import { cacheOfflineNote } from "../util/offlineLibrary";
import ReminderCenter from "../components/reminderCenter";
import AttachmentLibrary from "../components/attachmentLibrary";
import StudyTools from "../components/studyTools";
import NoteActivity from "../components/noteActivity";
import NoteSchedules from "../components/noteSchedules";
import NoteConnections from "../components/noteConnections";
import AdvancedSearch from "../components/advancedSearch";
import { useWorkspacePreferences } from "../hooks/useWorkspacePreferences";
import { emptySearchFilters, matchesFilters, noteSearchSnippet } from "../util/noteSearch";
import TaskOverview from "../components/taskOverview";
import CommandPalette from "../components/commandPalette";
import { useEditorPreferences } from "../hooks/useEditorPreferences";
import NoteLibrary from "../components/noteLibrary";
import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  DotsThreeIcon,
  CaretDownIcon,
  CheckIcon,
  FileTextIcon,
  FunnelSimpleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PushPinIcon,
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

type NoteFilter = NotesApi.SavedSearch["view"];

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
    if (note.type === NoteType.Documentation) return noteSearchSnippet(note, "") || "Text and boards in one page";
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
  const workspace = useWorkspacePreferences(loggedInUser?._id);
  const { recordOpen } = workspace;
  const [searchFilters, setSearchFilters] = useState(emptySearchFilters);
  const editorPreferences = useEditorPreferences(loggedInUser?._id);
  const [notes, setNotes] = useState<Note[]>([]);
  const [companionOpen, setCompanionOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [notebooksOpen, setNotebooksOpen] = useState(false);
  const [discussionsOpen, setDiscussionsOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [offlineStatus, setOfflineStatus] = useState("");
  const cacheSelectedOffline = async () => {
    if (!loggedInUser || !selectedNoteId) return;
    if (!window.confirm("Keep a saved copy of this note in this browser’s offline library? It stays available after sign-out to people using this browser profile. Save pending online edits first. Attachment-library files are not included.")) return;
    try { const note = await NotesApi.fetchNote(selectedNoteId); await cacheOfflineNote(loggedInUser._id, loggedInUser.username, note); setOfflineStatus("Offline copy saved. Use Commands → Open offline library if a new tab did not open."); window.open("/offline-library/", "_blank", "noopener,noreferrer"); } catch (error) { setError(error instanceof Error ? error.message : "Could not cache this note."); }
  };
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [schedulesOpen, setSchedulesOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [notebookFilter, setNotebookFilter] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [secondaryNoteId, setSecondaryNoteId] = useState<string | null>(null);
  const [secondaryStatus, setSecondaryStatus] = useState<"idle" | "saving" | "saved" | "error" | "synced">("idle");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitchingNote, setIsSwitchingNote] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error" | "synced">(
    "idle",
  );
  const [newNoteDialogOpen, setNewNoteDialogOpen] = useState(false);
  const [obsidianOpen, setObsidianOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [noteBrowserOpen, setNoteBrowserOpen] = useState(true);
  const [noteMaximized, setNoteMaximized] = useState(false);
  const [compactLayout, setCompactLayout] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarDialog = useRef<HTMLDialogElement>(null);
  const noteStage = useRef<HTMLElement>(null);
  const sidebarSelection = useRef<{ anchor: Range; focus: Range; anchorNode: Node; focusNode: Node } | null>(null);
  const focusSidebarSearch = useRef(false);
  const drawerMode = compactLayout || noteMaximized;
  const rememberSidebarSelection = () => {
    const selection = document.getSelection();
    sidebarSelection.current = null;
    if (!selection?.anchorNode || !selection.focusNode || !noteStage.current?.contains(selection.anchorNode) || !noteStage.current.contains(selection.focusNode)) return;
    const anchor = document.createRange();
    anchor.setStart(selection.anchorNode, selection.anchorOffset);
    anchor.collapse(true);
    const focus = document.createRange();
    focus.setStart(selection.focusNode, selection.focusOffset);
    focus.collapse(true);
    sidebarSelection.current = { anchor, focus, anchorNode: selection.anchorNode, focusNode: selection.focusNode };
  };
  const handleSidebarClose = () => {
    setSidebarOpen(false);
    const saved = sidebarSelection.current;
    sidebarSelection.current = null;
    if (!saved || document.querySelector("dialog[open], [aria-modal=true]")) return;
    const { anchor, focus, anchorNode, focusNode } = saved;
    if (!anchorNode.isConnected || !focusNode.isConnected || !noteStage.current?.contains(anchor.startContainer) || !noteStage.current.contains(focus.startContainer)) return;
    const focused = document.activeElement;
    document.getSelection()?.setBaseAndExtent(anchor.startContainer, anchor.startOffset, focus.startContainer, focus.startOffset);
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
  };
  const closeSidebar = () => {
    sidebarDialog.current?.close();
    setSidebarOpen(false);
  };
  const [error, setError] = useState("");
  const mobileToolsDialog = useRef<HTMLDialogElement>(null);
  const openMobileTool = (action: () => void) => { mobileToolsDialog.current?.close(); action(); };
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (router.isReady && router.query.reminders === "1") setRemindersOpen(true); }, [router.isReady, router.query.reminders]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px), (max-width: 1000px) and (max-height: 500px)");
    const updateLayout = () => setCompactLayout(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    setNotebookFilter(typeof router.query.notebook === "string" ? router.query.notebook.slice(0, 80) : "");
    if (router.query.library === "trash") setLibraryOpen(true);
    let cancelled = false;
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
        if (cancelled) return;
        const sharedOnly = router.query.filter === "shared";
        setNotes(availableNotes);
        setFilter(sharedOnly ? "shared" : "all");
        setSelectedNoteId(
          requestedNoteId ||
            (sharedOnly ? sharedNotes[0]?._id : availableNotes.find(note => !note.isArchived)?._id) ||
            null,
        );
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setError(
          error instanceof Error ? error.message : "Could not load notes.",
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadNotes();
    return () => { cancelled = true; };
  }, [router.isReady, router.query.filter, router.query.noteId, router.query.library, router.query.notebook]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !event.defaultPrevented && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && !target.closest("input, textarea, select, [contenteditable], [role=textbox]")) {
        if (document.querySelector("dialog[open]:not(.note-sidebar-dialog), [aria-modal=true]")) return;
        event.preventDefault();
        if (drawerMode && selectedNoteId && !sidebarDialog.current?.open) {
          rememberSidebarSelection();
          focusSidebarSearch.current = true;
          setSidebarOpen(true);
        } else {
          setNoteBrowserOpen(true);
          window.requestAnimationFrame(() => searchInputRef.current?.focus());
        }
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [drawerMode, selectedNoteId]);

  useEffect(() => { if (selectedNoteId) recordOpen(selectedNoteId); }, [selectedNoteId, recordOpen]);
  useEffect(() => { if (secondaryNoteId) recordOpen(secondaryNoteId); }, [secondaryNoteId, recordOpen]);

  const closeOrSwitchNote = (newId: string | null) => {
    closeSidebar();
    if (newId === selectedNoteId) return;
    if (!newId) setNoteMaximized(false);
    if (newId === secondaryNoteId) setSecondaryNoteId(null);
    setSelectedNoteId(newId);
    if (newId) {
      setIsSwitchingNote(true);
      window.setTimeout(() => setIsSwitchingNote(false), 180);
    }
  };

  const handleCreateNote = async (type: NoteType, template?: NoteTemplate) => {
    try {
      const newNote = (await NotesApi.createNotes({
        title: template ? `${template.title.slice(0, 190)} copy` : type === NoteType.Documentation ? "Untitled Documentation" : "Untitled Note",
        text: template ? typeof template.content === "string" ? template.content : JSON.stringify(template.content) : type === NoteType.Documentation ? serializeDocumentation(createDocumentation()) : undefined,
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
        sourcePath: importedNote.sourcePath,
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
    if (!window.confirm("Move this note to trash? You can restore it from Organize and recover. Sharing will be removed.")) {
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
      .filter(note => filter === "archived" ? note.isArchived : !note.isArchived)
      .filter(note => matchesFilters(note, searchFilters, loggedInUser?._id))
      .filter((note) => noteMatchesSearch(note, search) || (note.tags ?? []).some(tag => tag.includes(search.trim().toLowerCase())) || (note.notebook ?? "").toLowerCase().includes(search.trim().toLowerCase()))
      .filter(note => !notebookFilter || (note.notebook === notebookFilter || note.notebook?.startsWith(notebookFilter + "/")))
      .filter((note) => {
        if (filter === "pinned") return workspace.data.pinned.includes(note._id);
        if (filter === "recent") return workspace.data.recent.some(entry => entry.noteId === note._id);
        if (filter === "shared") return note.owner !== loggedInUser?._id;
        if (filter === "documents") return note.type !== NoteType.Whiteboard;
        if (filter === "boards") return note.type === NoteType.Whiteboard;
        if (filter === "favorites") {
          return loggedInUser
            ? isNoteFavorited(note, loggedInUser._id)
            : false;
        }
        return true;
      })
      .sort(
        (first, second) => {
          if (filter === "recent") return workspace.data.recent.findIndex(entry => entry.noteId === first._id) - workspace.data.recent.findIndex(entry => entry.noteId === second._id);
          return Number(workspace.data.pinned.includes(second._id)) - Number(workspace.data.pinned.includes(first._id)) || new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime();
        },
      );
  }, [filter, loggedInUser, notes, search, notebookFilter, searchFilters, workspace.data]);

  const activeNote = notes.find((note) => note._id === selectedNoteId) || null;
  const hasActiveNote = Boolean(activeNote);
  useEffect(() => {
    const dialog = sidebarDialog.current;
    if (!dialog) return;
    if (sidebarOpen && drawerMode && hasActiveNote) {
      if (!dialog.open) dialog.showModal();
      if (focusSidebarSearch.current) {
        searchInputRef.current?.focus();
        focusSidebarSearch.current = false;
      } else {
        dialog.querySelector<HTMLButtonElement>("[aria-label='Close notes sidebar']")?.focus();
      }
    } else {
      dialog.close();
    }
  }, [sidebarOpen, drawerMode, hasActiveNote]);
  const secondaryNote = notes.find(note => note._id === secondaryNoteId && note._id !== selectedNoteId) ?? null;
  const secondaryOwner = secondaryNote?.owner === loggedInUser?._id;
  const secondaryLive = !secondaryOwner || Boolean(secondaryNote?.sharedWith.length);
  const secondaryEditable = secondaryOwner || Boolean(secondaryNote?.sharedWith.some(peer => peer.userId === loggedInUser?._id && peer.permission === "editor"));
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
    { value: "pinned", label: "Pinned" },
    { value: "recent", label: "Recently opened" },
    { value: "archived", label: "Archived" },
    { value: "shared", label: "Shared with me" },
    { value: "documents", label: "Documents" },
    { value: "boards", label: "Whiteboards" },
    { value: "favorites", label: "Starred" },
  ];

  const activeFilterCount = Number(Boolean(notebookFilter)) + Number(filter !== "all")
    + Object.entries(searchFilters).filter(([key, value]) => value !== emptySearchFilters[key as keyof typeof emptySearchFilters]).length;
  const noteBrowserContent = <>
    <header className="note-browser-header">
      <strong>Notes</strong><span className="notes-count">{notes.length}</span>
      <div className="note-browser-header-actions">
        <button type="button" aria-label="New note" title="New note" onClick={() => { closeSidebar(); setNewNoteDialogOpen(true); }}><PlusIcon size={19} /></button>
        <button type="button" aria-label="Workspace tools" title="Workspace tools" onClick={() => { closeSidebar(); mobileToolsDialog.current?.showModal(); }}><DotsThreeIcon size={22} /></button>
        <button type="button" aria-label="Close notes sidebar" title="Close notes sidebar" onClick={closeSidebar}><XIcon size={19} /></button>
      </div>
    </header>
    <div className="note-browser-tools">
      <label className="note-search">
        <MagnifyingGlassIcon size={17} />
        <input
          ref={searchInputRef}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          maxLength={300}
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


      {workspace.error && <p role="alert">{workspace.error}</p>}
      <details className="note-browser-filters">
        <summary><FunnelSimpleIcon size={15} /><span>Filters</span>{activeFilterCount > 0 && <span className="notes-count">{activeFilterCount}</span>}<CaretDownIcon size={13} /></summary>
        <div className="note-browser-filter-fields">
          <label className="notebook-filter">Notebook<select value={notebookFilter} onChange={event => setNotebookFilter(event.target.value)}><option value="">All notebooks</option>{[...new Set(notes.flatMap(note => (note.notebook ?? "").split("/").map((_, index, parts) => parts.slice(0, index + 1).join("/"))).filter(Boolean))].sort().map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          {filter === "recent" && <button type="button" className="btn-ghost" onClick={() => { void workspace.update({ action: "clear-recent" }); }}>Clear recently opened</button>}
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
          <AdvancedSearch filters={searchFilters} onChange={setSearchFilters} searches={workspace.data.searches}
            onApply={saved => { setSearch(saved.query); setNotebookFilter(saved.notebook); setFilter(saved.view); setSearchFilters({ owner: saved.owner, type: saved.type, tag: saved.tag, from: saved.from, to: saved.to }); }}
            onSave={name => { void workspace.update({ action: "save-search", search: { id: crypto.randomUUID(), name, query: search.trim(), notebook: notebookFilter, view: filter, ...searchFilters } }); }}
            onDelete={id => { void workspace.update({ action: "delete-search", id }); }} />
        </div>
      </details>
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
              <span className={note.type !== NoteType.Whiteboard ? "note-type-icon document" : "note-type-icon board"}>
                {note.type !== NoteType.Whiteboard ? (
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
                <span className="note-list-preview">{search.trim() ? noteSearchSnippet(note, search) || notePreview(note) : notePreview(note)}</span>
                <span className="note-list-meta">
                  {favorite && <StarIcon size={11} weight="fill" />}
                  {note.type === NoteType.Documentation ? "Documentation" : note.type === NoteType.Document ? "Document" : "Whiteboard"}
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
      <button type="button" onClick={() => { closeSidebar(); setObsidianOpen(true); }}>
        Import Markdown
      </button>
    </div>
  </>;

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

        <div className={activeNote ? `notes-page has-active-note${activeNote.type === NoteType.Documentation ? " has-documentation" : ""}${noteMaximized ? " is-maximized" : ""}` : "notes-page"}>
          <header className="workspace-topbar">
            <div className="workspace-title">
              <div>
                <h1>Notes</h1>
                <span className="notes-count">{notes.length}</span>
              </div>
            </div>
            <div className="workspace-actions">
              <button className="btn-ghost workspace-connections-button" type="button" disabled={!activeNote} aria-expanded={connectionsOpen} onClick={() => setConnectionsOpen(value => !value)}>Connections</button>
              <CommandPalette onCompanion={() => setCompanionOpen(true)} onArchive={() => setArchiveOpen(true)} onAi={() => setAiOpen(true)} onNotebooks={() => setNotebooksOpen(true)} onDiscussions={() => setDiscussionsOpen(true)} onSources={() => setSourcesOpen(true)} onOffline={() => void cacheSelectedOffline()} onReminders={() => setRemindersOpen(true)} onAttachments={() => setAttachmentsOpen(true)} onStudy={() => setStudyOpen(true)} notes={notes} onOpenNote={closeOrSwitchNote} onNewNote={() => setNewNoteDialogOpen(true)} onLibrary={() => setLibraryOpen(true)} onImport={() => setObsidianOpen(true)} />
              <button type="button" className="btn-ghost workspace-tools-button" onClick={() => mobileToolsDialog.current?.showModal()} aria-label="Workspace tools" aria-haspopup="dialog"><DotsThreeIcon size={21} /><span>Tools</span></button>
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

          {loggedInUser && <ReminderCenter key={loggedInUser._id} owner={loggedInUser._id} notes={notes} initialNoteId={activeNote?._id} open={remindersOpen} onOpen={() => setRemindersOpen(true)} onClose={() => setRemindersOpen(false)} onOpenNote={closeOrSwitchNote} />}
          {attachmentsOpen && loggedInUser && <AttachmentLibrary key={loggedInUser._id} owner={loggedInUser._id} notes={notes} initialNoteId={activeNote?._id} onOpenNote={closeOrSwitchNote} onClose={() => setAttachmentsOpen(false)} />}
          {companionOpen && loggedInUser && <CompanionConnections key={loggedInUser._id} owner={loggedInUser._id} notes={notes} onClose={() => setCompanionOpen(false)} />}
          {archiveOpen && loggedInUser && <WorkspaceArchive key={loggedInUser._id} owner={loggedInUser._id} canExport={(!activeNote || saveStatus === "saved") && (!secondaryNote || secondaryStatus === "saved")} onClose={() => setArchiveOpen(false)} onRestored={async () => { const owned = await NotesApi.fetchNotes(); setNotes(current => { const existing = new Set(current.map(note => note._id)); return [...current, ...owned.filter(note => !existing.has(note._id))]; }); }} />}
          {aiOpen && loggedInUser && <PassageAi key={loggedInUser._id} notes={notes} initialNoteId={activeNote?.type === "document" ? activeNote._id : undefined} onClose={() => setAiOpen(false)} onOpenNote={closeOrSwitchNote} onCreated={note => setNotes(current => current.some(item => item._id === note._id) ? current : [note, ...current])} />}
          {notebooksOpen && loggedInUser && <SharedNotebooks key={loggedInUser._id} owner={loggedInUser._id} notes={notes} blockedNotes={[...(activeNote && saveStatus !== "saved" ? [activeNote._id] : []), ...(secondaryNote && secondaryStatus !== "saved" ? [secondaryNote._id] : [])]} onUpdated={async () => { const [owned, shared] = await Promise.all([NotesApi.fetchNotes(), NotesApi.fetchSharedNotes()]); setNotes(current => { const byId = new Map(current.map(note => [note._id, note])); return [...owned, ...shared].map(saved => { const prior = byId.get(saved._id); if (!prior) return saved; const wasLive = prior.owner !== loggedInUser._id || prior.sharedWith.length > 0, isLive = saved.owner !== loggedInUser._id || saved.sharedWith.length > 0; return wasLive !== isLive ? saved : { ...prior, sharedWith: saved.sharedWith, sharedNotebookId: saved.sharedNotebookId }; }); }); }} onOpenNote={note => { setNotes(current => current.some(item => item._id === note._id) ? current : [note, ...current]); setSelectedNoteId(note._id); }} onClose={() => setNotebooksOpen(false)} />}
          {discussionsOpen && loggedInUser && <Discussions key={loggedInUser._id} owner={loggedInUser._id} notes={notes} initialNoteId={activeNote?._id} onClose={() => setDiscussionsOpen(false)} onOpenNote={closeOrSwitchNote} />}
          {studyOpen && loggedInUser && <StudyTools key={loggedInUser._id} owner={loggedInUser._id} notes={notes} initialNoteId={activeNote?.type === "document" ? activeNote._id : undefined} onOpenNote={closeOrSwitchNote} onClose={() => setStudyOpen(false)} />}
          {activityOpen && activeNote && isOwner && <NoteActivity noteId={activeNote._id} title={activeNote.title} onClose={() => setActivityOpen(false)} />}
          {tasksOpen && <TaskOverview notes={notes} onOpenNote={closeOrSwitchNote} onClose={() => setTasksOpen(false)} />}
          {libraryOpen && <NoteLibrary key={isOwner ? activeNote?._id : "trash"} note={isOwner ? activeNote : null}
            ownedNotes={notes.filter(note => note.owner === loggedInUser?._id)}
            onBulkUpdated={updated => { const byId = new Map(updated.map(note => [note._id, note])); setNotes(current => current.map(note => { const saved = byId.get(note._id); return saved ? { ...note, notebook: saved.notebook, tags: saved.tags, isTemplate: saved.isTemplate, isArchived: saved.isArchived } : note; })); }}
            onClose={() => setLibraryOpen(false)}
            onRecovered={note => { setNotes(current => [note, ...current]); setSelectedNoteId(note._id); setLibraryOpen(false); setSearch(""); setFilter("all"); setNotebookFilter(""); }}
            onOrganizationChange={saved => { if (saved.isArchived) setFilter("archived"); else if (filter === "archived") setFilter("all"); setNotes(current => current.map(note => note._id === saved._id ? { ...note, notebook: saved.notebook, tags: saved.tags, isTemplate: saved.isTemplate, isArchived: saved.isArchived } : note)); setLibraryOpen(false); }} />}
          {offlineStatus && <p role="status">{offlineStatus}</p>}
          {error && (
            <p className="new-note-dialog-error" role="alert">
              {error}{" "}
              <button type="button" className="btn-ghost" onClick={() => setError("")}>
                Dismiss
              </button>
            </p>
          )}

          <div
            className={`${activeNote ? "notes-workspace has-active-note" : "notes-workspace"}${(drawerMode ? !activeNote : noteBrowserOpen) ? "" : " is-browser-collapsed"}`}
          >
            {(!drawerMode || !activeNote) && <aside className="note-browser" id="note-browser-panel">
              {noteBrowserContent}
            </aside>}

            <section ref={noteStage} className="note-stage">
              {activeNote ? (
                <>
                  <header className="active-note-header">
                    <button
                      type="button"
                      className="mobile-back-button"
                      onPointerDown={rememberSidebarSelection}
                      onKeyDown={event => { if (event.key === "Enter" || event.key === " ") rememberSidebarSelection(); }}
                      onClick={() => {
                        if (!sidebarSelection.current) rememberSidebarSelection();
                        setSidebarOpen(true);
                      }}
                      aria-label="Open notes sidebar"
                      title="Open notes sidebar"
                      aria-haspopup="dialog"
                      aria-controls="mobile-note-browser"
                      aria-expanded={sidebarOpen}
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
                        <span>{activeNote.type === NoteType.Documentation ? "Documentation" : activeNote.type === NoteType.Document ? "Note document" : "Whiteboard"}</span>
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
                        {saveStatus === "idle" && <span>Waiting to sync</span>}
                        {saveStatus === "error" && <span role="status">Unsaved changes</span>}
                        {saveStatus === "synced" && <span title="Received by the live service; database storage is pending confirmation">Synced</span>}
                      </div>
                    </div>

                    <div className="active-note-actions">
                      <button
                        type="button"
                        className="icon-button note-maximize-toggle"
                        aria-label={noteMaximized ? "Restore workspace" : "Maximize note"}
                        aria-pressed={noteMaximized}
                        title={noteMaximized ? "Restore workspace" : "Maximize note"}
                        onPointerDown={event => event.preventDefault()}
                        onClick={() => setNoteMaximized(value => !value)}
                      >
                        {noteMaximized ? <ArrowsInSimpleIcon size={18} /> : <ArrowsOutSimpleIcon size={18} />}
                        <span>{noteMaximized ? "Restore" : "Maximize"}</span>
                      </button>
                      <button type="button" className="icon-button workspace-tools-toggle" aria-label="Workspace tools" onClick={() => mobileToolsDialog.current?.showModal()}><DotsThreeIcon size={22} /></button>
                      <button type="button" className="icon-button split-view-toggle" aria-label="Split view" aria-pressed={Boolean(secondaryNote)} disabled={notes.length < 2} title="Keep two notes open independently" onClick={() => { setSecondaryStatus("idle"); setSecondaryNoteId(secondaryNote ? null : (notes.find(note => note._id !== activeNote._id && note.type !== activeNote.type) ?? notes.find(note => note._id !== activeNote._id))?._id ?? null); }}><SquaresFourIcon size={17} /><span>Split view</span></button>
                      <button type="button" className="icon-button" aria-label={workspace.data.pinned.includes(activeNote._id) ? "Unpin note" : "Pin note"} title={workspace.data.pinned.includes(activeNote._id) ? "Unpin note" : "Pin note"} aria-pressed={workspace.data.pinned.includes(activeNote._id)} onClick={() => { void workspace.update({ action: workspace.data.pinned.includes(activeNote._id) ? "unpin" : "pin", noteId: activeNote._id }); }}><PushPinIcon size={18} weight={workspace.data.pinned.includes(activeNote._id) ? "fill" : "regular"} /></button>
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

                  <div className={secondaryNote ? "note-panes has-secondary" : "note-panes"}>
                  <div className="active-note-editor primary-note-pane">
                    {isSwitchingNote ? (
                      <div className="note-switching">
                        <SpinnerBallIcon className="spin" size={30} />
                      </div>
                    ) : (
                      <><ActiveNoteEditor
                        key={`${activeNote._id}:${collaborationEnabled ? "live" : "private"}`}
                        collaborationEnabled={collaborationEnabled}
                        note={activeNote}
                        readOnly={!canEdit}
                        user={loggedInUser}
                        onSaveStatusChange={setSaveStatus}
                      /><LinkedSources key={activeNote._id} note={activeNote} notes={notes} requestedOpen={sourcesOpen} onClose={() => setSourcesOpen(false)} onOpenNote={id => { setSourcesOpen(false); closeOrSwitchNote(id); }} /></>
                    )}
                  </div>
                  {secondaryNote && <section className="secondary-note-pane" aria-label="Second note pane">
                    <header><label>Second note<select aria-label="Second note" value={secondaryNote._id} onChange={event => { setSecondaryStatus("idle"); setSecondaryNoteId(event.target.value); }}>{notes.filter(note => note._id !== activeNote._id).map(note => <option value={note._id} key={note._id}>{note.title}</option>)}</select></label><span role="status">{secondaryStatus === "error" ? "Unsaved changes" : secondaryStatus === "idle" ? "Waiting to sync" : secondaryStatus === "saved" ? "Saved" : secondaryStatus === "saving" ? "Saving" : "Synced"}</span><button type="button" className="btn-ghost" onClick={() => setSecondaryNoteId(null)} aria-label="Close second pane">×</button></header>
                    <div className="active-note-editor"><ActiveNoteEditor key={secondaryNote._id + (secondaryLive ? ":live" : ":private")} note={secondaryNote} user={loggedInUser} readOnly={!secondaryEditable} collaborationEnabled={secondaryLive} onSaveStatusChange={setSecondaryStatus} /></div>
                  </section>}
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
            {connectionsOpen && activeNote && <aside className="workspace-connections-panel" aria-label="Note connections">
              <NoteConnections notes={notes} note={activeNote} onOpen={closeOrSwitchNote} onClose={() => setConnectionsOpen(false)} />
            </aside>}
          </div>
        </div>

        <dialog ref={sidebarDialog} id="mobile-note-browser" className="note-sidebar-dialog" aria-label="Notes sidebar"
          onClose={handleSidebarClose}
          onClick={event => { if (event.target === event.currentTarget) closeSidebar(); }}>
          {drawerMode && activeNote && <div className="note-browser">{noteBrowserContent}</div>}
        </dialog>

        <dialog ref={mobileToolsDialog} className="workspace-tools-menu" aria-label="Workspace tools">
          <header><h2>Workspace tools</h2><button type="button" className="btn-ghost" onClick={() => mobileToolsDialog.current?.close()}>Close tools</button></header>
          <Link href="/capture/" onClick={() => mobileToolsDialog.current?.close()}>Capture to Inbox</Link>
          <button type="button" onClick={() => openMobileTool(() => setNewNoteDialogOpen(true))}>New note</button>
          <button type="button" onClick={() => openMobileTool(() => setSchedulesOpen(true))}>Daily notes</button>
          <button type="button" disabled={!activeNote || !isOwner} onClick={() => openMobileTool(() => setActivityOpen(true))}>Activity</button>
          <button type="button" onClick={() => openMobileTool(() => setCompanionOpen(true))}>Obsidian companion</button>
          <button type="button" onClick={() => openMobileTool(() => setArchiveOpen(true))}>Workspace archive</button>
          <button type="button" onClick={() => openMobileTool(() => setAiOpen(true))}>Passage AI actions</button>
          <button type="button" onClick={() => openMobileTool(() => setNotebooksOpen(true))}>Shared notebooks</button>
          <button type="button" onClick={() => openMobileTool(() => setDiscussionsOpen(true))}>Discussions and mentions</button>
          <button type="button" disabled={!activeNote} onClick={() => openMobileTool(() => setSourcesOpen(true))}>Linked sources</button>
          <button type="button" disabled={!activeNote} onClick={() => openMobileTool(() => void cacheSelectedOffline())}>Make selected note available offline</button>
          <a href="/offline-library/" target="_blank" rel="noopener noreferrer">Open offline library</a>
          <button type="button" onClick={() => openMobileTool(() => setRemindersOpen(true))}>Reminders</button>
          <button type="button" onClick={() => openMobileTool(() => setAttachmentsOpen(true))}>Attachments</button>
          <button type="button" onClick={() => openMobileTool(() => setStudyOpen(true))}>Study tools</button>
          <button type="button" disabled={!activeNote} onClick={() => openMobileTool(() => setConnectionsOpen(true))}>Connections</button>
          <button type="button" onClick={() => openMobileTool(() => { setTasksOpen(true); setLibraryOpen(false); })}>Tasks</button>
          <button type="button" onClick={() => openMobileTool(() => setLibraryOpen(true))}>Organize and recover</button>
          <button type="button" onClick={() => openMobileTool(() => setObsidianOpen(true))}>Import Markdown</button>
          {activeNote && <>
            <button type="button" onClick={() => openMobileTool(() => { void workspace.update({ action: workspace.data.pinned.includes(activeNote._id) ? "unpin" : "pin", noteId: activeNote._id }); })}>{workspace.data.pinned.includes(activeNote._id) ? "Unpin note" : "Pin note"}</button>
            <button type="button" onClick={() => openMobileTool(() => { void handleToggleFavorite(activeNote._id); })}>{isFavorite ? "Remove from favorites" : "Add to favorites"}</button>
            {isOwner && <><button type="button" onClick={() => openMobileTool(() => setShareDialogOpen(true))}>Share note</button><button type="button" onClick={() => openMobileTool(() => { void handleDeleteNote(activeNote._id); })}>Delete note</button></>}
          </>}
        </dialog>
        <NoteSchedules open={schedulesOpen} templates={notes.filter(note => note.owner === loggedInUser?._id && note.isTemplate)} onOpen={note => { setNotes(current => current.some(item => item._id === note._id) ? current : [note, ...current]); closeOrSwitchNote(note._id); }} onClose={() => setSchedulesOpen(false)} />
        <AddNoteDialog
          defaultType={editorPreferences.preferences.noteType as NoteType}
          templates={notes.filter(note => note.owner === loggedInUser?._id && note.isTemplate)}
          open={newNoteDialogOpen}
          onOpenChange={setNewNoteDialogOpen}
          onSave={handleCreateNote}
        />

        <ObsidianBridge
          open={obsidianOpen}
          notes={notes}
          activeNote={activeNote}
          onClose={() => setObsidianOpen(false)}
          onCompanion={() => { setObsidianOpen(false); setCompanionOpen(true); }}
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
