import WikiCompletion from "./wikiCompletion";
import { useEditorPreferences } from "../hooks/useEditorPreferences";
import CollaborationPresence from "./collaborationPresence";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as Y from "yjs";
import { CalculatorIcon, CloudSlashIcon, SpinnerBallIcon } from "@phosphor-icons/react";
import {
  Noteboard,
  NoteboardRef,
} from "@sunaissu/noteboard";
import { useYjsNoteboard } from "@sunaissu/noteboard/yjs";
import { Calculator } from "@sunaissu/calculator";
import { DocumentEditor, type DocumentEditorHandle } from "@sunaissu/document-editor";
import {
  useYjsDocument,
} from "@sunaissu/document-editor/yjs";
import {
  DocumentNote,
  Note,
  NoteType,
  type WhiteboardContent,
  WhiteboardNote,
  sanitizeNoteboardElements,
  sanitizeNoteboardViewport,
} from "../model/note";
import { User } from "../model/user";
import NoteContext from "../context/noteContext";
import {
  ACCENT_BRAND_COLORS,
  useTheme,
} from "../context/themeContext";
import { useNoteCollaboration } from "../hooks/useNoteCollaboration";
import { usePrivateNoteAutosave } from "../hooks/usePrivateNoteAutosave";

interface ActiveNoteEditorProps {
  collaborationEnabled?: boolean;
  note: Note;
  readOnly?: boolean;
  user?: User | null;
  onSaveStatusChange?: (status: "saving" | "saved" | "idle" | "error" | "synced") => void;
}

const COLLABORATIVE_TITLE_KEY = "note-title";

const downloadDraft = (value: string, name: string) => {
  const url = URL.createObjectURL(new Blob([value], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const emptyWhiteboard = (): Pick<WhiteboardContent, "elements" | "viewport"> => ({
  elements: [],
  viewport: { panX: 0, panY: 0, zoom: 1 },
});

const parseWhiteboard = (
  note: Note,
): Pick<WhiteboardContent, "elements" | "viewport"> => {
  if (note.type !== NoteType.Whiteboard || !note.content) return emptyWhiteboard();

  let parsed: unknown = note.content;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return emptyWhiteboard();
    }
  }
  if (typeof parsed !== "object" || parsed === null) return emptyWhiteboard();

  const candidate = parsed as Partial<WhiteboardContent>;
  return {
    elements: sanitizeNoteboardElements(candidate.elements),
    viewport: sanitizeNoteboardViewport(candidate.viewport),
  };
};

const ActiveNoteEditor: React.FC<ActiveNoteEditorProps> = ({
  collaborationEnabled = true,
  note,
  readOnly: requestedReadOnly,
  user,
  onSaveStatusChange,
}) => {
  const editorPreferences = useEditorPreferences(user?._id);
  const collaboration = useNoteCollaboration(
    note._id,
    user,
    collaborationEnabled,
    !requestedReadOnly,
    note.type,
  );
  const readOnly = (collaboration.local || collaboration.permission === null ? requestedReadOnly : collaboration.permission !== "editor") || (!collaboration.local && collaboration.status !== "synced");
  const [initialDocumentContent] = useState(() =>
    note.type === NoteType.Document ? note.content : "",
  );
  const [initialWhiteboard] = useState(() => parseWhiteboard(note));
  const documentBinding = useYjsDocument(collaboration.document, {
    initialValue: collaboration.local ? initialDocumentContent : undefined,
  });
  const whiteboardBinding = useYjsNoteboard(collaboration.document, {
    initialViewport: collaboration.local ? initialWhiteboard.viewport : undefined,
  });
  const initializeWhiteboardElements = whiteboardBinding.onElementsChange;
  const whiteboardElements = useMemo(
    () => sanitizeNoteboardElements(whiteboardBinding.elements),
    [whiteboardBinding.elements],
  );
  const titleText = useMemo(
    () => collaboration.document.getText(COLLABORATIVE_TITLE_KEY),
    [collaboration.document],
  );
  const content = documentBinding.value;
  const [admissionError, setAdmissionError] = useState("");
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [localBindingsReady, setLocalBindingsReady] = useState(false);
  const { notes, setNotes } = useContext(NoteContext);
  useEffect(() => {
    const permission = collaboration.permission;
    if (!permission || !user || note.owner === user._id) return;
    setNotes(current => current.map(item => item._id === note._id && item.sharedWith.some(member => member.userId === user._id && member.permission !== permission) ? { ...item, sharedWith: item.sharedWith.map(member => member.userId === user._id ? { ...member, permission } : member) } : item));
  }, [collaboration.permission, note._id, note.owner, user, setNotes]);
  const {
    preference,
    resolvedTheme,
    accentTheme,
    setPreference,
  } = useTheme();
  const noteboardBrandColors = useMemo(
    () => ACCENT_BRAND_COLORS[accentTheme][resolvedTheme],
    [accentTheme, resolvedTheme],
  );

  const boardRef = useRef<NoteboardRef>(null);
  const documentEditorRef = useRef<DocumentEditorHandle>(null);
  const initializedLocalWhiteboardRef = useRef<Y.Doc | null>(null);


  useEffect(() => {
    if (!collaboration.local) return;

    if (initializedLocalWhiteboardRef.current !== collaboration.document) {
      initializedLocalWhiteboardRef.current = collaboration.document;

      // Noteboard 2.0's initialElements path reads detached Y.Map values.
      // Updating through the binding attaches each map before it is read.
      if (
        note.type === NoteType.Whiteboard &&
        initialWhiteboard.elements.length > 0
      ) {
        initializeWhiteboardElements(initialWhiteboard.elements);
      }
    }

    setLocalBindingsReady(true);
  }, [
    collaboration.document,
    collaboration.local,
    initialWhiteboard.elements,
    note.type,
    initializeWhiteboardElements,
  ]);

  const privateWhiteboardSnapshot = useMemo(() => {
    if (!collaboration.local || note.type !== NoteType.Whiteboard) return null;
    const snapshot = {
      elements: whiteboardElements,
      viewport: whiteboardBinding.viewport,
    };
    return {
      revision: JSON.stringify({ elements: whiteboardElements }),
      value: JSON.stringify({
        version: 1,
        ...snapshot,
        savedAt: new Date().toISOString(),
      }),
    };
  }, [
    collaboration.local,
    note.type,
    whiteboardBinding.viewport,
    whiteboardElements,
  ]);
  const initialWhiteboardRevision = useMemo(
    () =>
      JSON.stringify({
        elements: initialWhiteboard.elements,
      }),
    [initialWhiteboard],
  );
  const privateRevision =
    note.type === NoteType.Document
      ? content
      : privateWhiteboardSnapshot?.revision ?? "";
  const initialPrivateRevision =
    note.type === NoteType.Document
      ? initialDocumentContent
      : initialWhiteboardRevision;
  const privateValue =
    note.type === NoteType.Document
      ? content
      : privateWhiteboardSnapshot?.value ?? "";
  const recoverPrivateDraft = useCallback(
    (draftValue: string) => {
      if (readOnly) return false;

      if (note.type === NoteType.Document) {
        documentBinding.onChange(draftValue);
        return true;
      }

      try {
        const parsed = JSON.parse(draftValue) as Partial<WhiteboardContent>;
        if (!Array.isArray(parsed.elements) || !parsed.viewport) return false;
        const { panX, panY, zoom } = parsed.viewport;
        if (
          !Number.isFinite(panX) ||
          !Number.isFinite(panY) ||
          !Number.isFinite(zoom)
        ) {
          return false;
        }
        whiteboardBinding.onElementsChange(
          sanitizeNoteboardElements(parsed.elements),
        );
        const viewport = sanitizeNoteboardViewport({ panX, panY, zoom });
        boardRef.current?.setViewport(viewport);
        whiteboardBinding.onViewportChange(viewport);
        return true;
      } catch {
        return false;
      }
    }, [documentBinding, note.type, readOnly, whiteboardBinding],
  );
  const handlePrivateSaved = useCallback(
    (savedNote: Note) => {
      setNotes((previous) =>
        previous.map((existingNote) =>
          existingNote._id === note._id
            ? { ...existingNote, updatedAt: savedNote.updatedAt, contentRevision: savedNote.contentRevision }
            : existingNote,
        ),
      );
    },
    [note._id, setNotes],
  );
  const privateAutosave = usePrivateNoteAutosave({
    enabled: collaboration.local && localBindingsReady && !readOnly,
    accountId: user?._id ?? note.owner,
    initialRevision: initialPrivateRevision,
    initialServerRevision: note.contentRevision ?? 0,
    noteId: note._id,
    onDraftRecovered: recoverPrivateDraft,
    onSaved: handlePrivateSaved,
    onStatusChange: onSaveStatusChange,
    revision: privateRevision,
    value: privateValue,
  });
  const editorReady =
    editorPreferences.ready && collaboration.ready &&
    (!collaboration.local || (localBindingsReady && privateAutosave.ready));


  useEffect(() => {
    if (!editorReady) return;
    const synchronizeTitle = () => {
      const title = titleText.toString().trim();
      if (!title) return;
      setNotes((previous) =>
        previous.map((existingNote) =>
          existingNote._id === note._id && existingNote.title !== title
            ? { ...existingNote, title, updatedAt: new Date().toISOString() }
            : existingNote,
        ),
      );
    };
    titleText.observe(synchronizeTitle);
    synchronizeTitle();
    return () => titleText.unobserve(synchronizeTitle);
  }, [editorReady, note._id, setNotes, titleText]);

  const changeDocumentContent = useCallback(
    (newContent: string, previous?: string) => {
      if (readOnly) return;
      if (new TextEncoder().encode(newContent).length > 1024 * 1024) { setAdmissionError("This note exceeds the 1 MiB storage limit. Shorten the content before adding more."); return; }
      setAdmissionError("");
      documentBinding.onChange(newContent, previous);
      setNotes((previous) =>
        previous.map((existingNote) =>
          existingNote._id === note._id
            ? ({ ...existingNote, content: newContent } as DocumentNote)
            : existingNote,
        ),
      );
    },
    [documentBinding, note._id, readOnly, setNotes],
  );

  useEffect(() => {
    if (!editorReady || note.type !== NoteType.Document) return;
    setNotes((previous) =>
      previous.map((existingNote) =>
        existingNote._id === note._id &&
        existingNote.type === NoteType.Document &&
        existingNote.content !== content
          ? ({
              ...existingNote,
              content,
              updatedAt: new Date().toISOString(),
            } as DocumentNote)
          : existingNote,
      ),
    );
  }, [content, editorReady, note._id, note.type, setNotes]);

  useEffect(() => {
    if (collaboration.local) return;
    if (collaboration.durability === "error") onSaveStatusChange?.("error");
    else if (collaboration.unsyncedChanges > 0) onSaveStatusChange?.("saving");
    else if (collaboration.durability === "stored") onSaveStatusChange?.("saved");
    else if (collaboration.status === "synced") onSaveStatusChange?.("synced");
    else onSaveStatusChange?.("idle");
  }, [
    collaboration.local,
    collaboration.durability,
    collaboration.status,
    collaboration.unsyncedChanges,
    onSaveStatusChange,
  ]);

  const handleWhiteboardChange = useCallback((elements: Parameters<typeof whiteboardBinding.onElementsChange>[0]) => {
    if (readOnly) return;
    whiteboardBinding.onElementsChange(sanitizeNoteboardElements(elements));
  }, [readOnly, whiteboardBinding]);

  const handleViewportChange = useCallback((viewport: WhiteboardContent["viewport"]) => {
    if (collaboration.local) whiteboardBinding.onViewportChange(sanitizeNoteboardViewport(viewport));
  }, [collaboration.local, whiteboardBinding]);

  useEffect(() => {
    if (!editorReady || note.type !== NoteType.Whiteboard) return;
    setNotes((previous) => previous.map((existingNote) => {
      if (existingNote._id !== note._id || existingNote.type !== NoteType.Whiteboard) {
        return existingNote;
      }
      const current = existingNote as WhiteboardNote;
      const priorContent = typeof current.content === "string"
        ? (() => {
            try {
              const parsed: unknown = JSON.parse(current.content);
              return typeof parsed === "object" && parsed !== null ? parsed : {};
            } catch {
              return {};
            }
          })()
        : current.content ?? {};
      return {
        ...current,
        content: {
          ...priorContent,
          elements: whiteboardElements,
          viewport: whiteboardBinding.viewport,
        },
        updatedAt: JSON.stringify((priorContent as Partial<WhiteboardContent>).elements) === JSON.stringify(whiteboardElements) ? current.updatedAt : new Date().toISOString(),
      } as WhiteboardNote;
    }));
  }, [
    editorReady,
    note._id,
    note.type,
    setNotes,
    whiteboardBinding.viewport,
    whiteboardElements,
  ]);

  const admissionNotice = admissionError ? <div className="editor-save-alert" role="alert">{admissionError}<button type="button" className="btn-ghost" onClick={() => setAdmissionError("")}>Dismiss</button></div> : null;
  const storageNotice = !collaboration.local && (collaboration.durability === "error" || collaboration.draftError) ? <div className="editor-save-alert" role="alert"><span>{collaboration.draftError || "Live changes have not been stored. Keep this page open or download a copy."}</span><button type="button" className="btn-ghost" onClick={() => downloadDraft(note.type === NoteType.Document ? content : JSON.stringify({ elements: whiteboardElements, viewport: whiteboardBinding.viewport }), "unsaved-live-note.txt")}>Download draft</button></div> : null;
  const connectionNotice = !collaboration.local && collaboration.ready && collaboration.status !== "synced" ? (
    <div className="editor-save-alert" role="alert"><CloudSlashIcon size={18} /><span><strong>Connection interrupted. Editing is paused.</strong><small>{collaboration.errorMessage || "Your current work remains here while the connection recovers."}</small></span><button type="button" className="btn-ghost" onClick={collaboration.retry}>Reconnect</button></div>
  ) : null;

  const privateSaveNotice = privateAutosave.error ? (
    <div className="editor-save-alert" role="alert">
      <CloudSlashIcon size={18} weight="bold" />
      <span>
        <strong>
          {privateAutosave.draftStored
            ? "Your latest changes are saved in this browser."
            : "Your latest changes are still on this screen."}
        </strong>
        <small>{privateAutosave.error}</small>
      </span>
      <button type="button" className="btn-ghost" onClick={privateAutosave.retry}>
        Try saving again
      </button>
      <button type="button" className="btn-ghost" onClick={() => downloadDraft(privateValue, note.type === NoteType.Document ? "unsaved-note.md" : "unsaved-board.json")}>
        Download draft
      </button>
    </div>
  ) : privateAutosave.draftNotice?.kind === "recovered" ? (
    <div
      className={`editor-save-alert is-draft-${privateAutosave.draftNotice.kind}`}
      role="status"
    >
      <CloudSlashIcon size={18} weight="bold" />
      <span>
        <strong>Browser draft recovered.</strong>
        <small>{privateAutosave.draftNotice.message}</small>
      </span>
      <div className="editor-save-alert-actions">
        <button
          type="button"
          className="btn-ghost"
          onClick={privateAutosave.dismissDraftNotice}
        >
          Got it
        </button>
      </div>
    </div>
  ) : null;

  const privateDraftLoading = collaboration.local && !privateAutosave.ready;
  if (!collaboration.ready || privateDraftLoading) {
    const hasError = collaboration.status === "error";
    return (
      <div
        className={hasError ? "collaboration-loading is-error" : "collaboration-loading"}
        role={hasError ? "alert" : "status"}
        aria-live="polite"
      >
        <div className="collaboration-loading-card">
          <div className="collaboration-loading-icon" aria-hidden="true">
            {hasError ? (
              <CloudSlashIcon size={26} weight="bold" />
            ) : (
              <SpinnerBallIcon className="spin" size={26} />
            )}
          </div>
          <div className="collaboration-loading-copy">
            <span className="eyebrow">
              {privateDraftLoading ? "Private workspace" : "Live workspace"}
            </span>
            <strong>
              {privateDraftLoading
                ? "Checking this browser for unsaved changes..."
                : hasError
                  ? "Live editing could not start"
                  : "Joining this shared note..."}
            </strong>
            <p>
              {privateDraftLoading
                ? "This should only take a moment."
                : hasError
                ? collaboration.errorMessage
                : "Connecting to the secure editing session. This usually takes a moment."}
            </p>
          </div>
          {hasError && !privateDraftLoading && (
            <button type="button" className="btn-primary" onClick={collaboration.retry}>
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  if (privateAutosave.draftNotice?.kind === "conflict") {
    return (
      <div className="collaboration-loading is-error" role="alert">
        <div className="collaboration-loading-card">
          <div className="collaboration-loading-icon" aria-hidden="true">
            <CloudSlashIcon size={26} weight="bold" />
          </div>
          <div className="collaboration-loading-copy">
            <span className="eyebrow">Private workspace</span>
            <strong>Choose which version of this note to keep</strong>
            <p>
              {privateAutosave.draftNotice.message} Editing is paused until you
              choose, so neither copy can overwrite the other.
            </p>
            {privateAutosave.availableDrafts.length > 1 && <label>Retained browser drafts<select aria-label="Retained browser drafts" onChange={event => privateAutosave.selectDraft(event.target.value)}>{privateAutosave.availableDrafts.map(draft => <option key={draft.noteId} value={draft.noteId}>{new Date(draft.updatedAt).toLocaleString()} — {draft.value.slice(0, 40)}</option>)}</select></label>}
            <div className="draft-comparison">
              <label>Browser draft<textarea aria-label="Browser draft" readOnly value={privateAutosave.conflictValue} /></label>
              <label>Server copy<textarea aria-label="Server copy" readOnly value={privateAutosave.conflictServer
                ? typeof privateAutosave.conflictServer.content === "string" ? privateAutosave.conflictServer.content : JSON.stringify(privateAutosave.conflictServer.content, null, 2)
                : note.type === NoteType.Document ? initialDocumentContent : JSON.stringify(initialWhiteboard, null, 2)} /></label>
            </div>
            <button type="button" className="btn-ghost" onClick={() => downloadDraft(JSON.stringify({ browser: privateAutosave.conflictValue, server: privateAutosave.conflictServer?.content ?? (note.type === NoteType.Document ? initialDocumentContent : initialWhiteboard) }, null, 2), "note-conflict-copies.json")}>
              Download both copies
            </button>
          </div>
          <div className="editor-save-alert-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={privateAutosave.restoreConflictingDraft}
            >
              Restore browser draft
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={privateAutosave.dismissDraftNotice}
            >
              Keep server version
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (note.type === NoteType.Whiteboard) {
    return (
      <div className="whiteboard-editor-shell">
        {admissionNotice}
      {storageNotice}
      {connectionNotice}
      {privateSaveNotice}
        <div className="whiteboard-editor-meta">
          <span>Infinite canvas</span>
          <div className="whiteboard-editor-actions">
            <small>
              {readOnly
                ? "View only · live"
                : collaboration.local
                  ? "Private workspace"
                  : `${collaboration.peers.length || 1} active · ${collaboration.status}`}
            </small>
            <button
              type="button"
              className={calculatorOpen ? "tool-toggle is-active" : "tool-toggle"}
              onClick={() => setCalculatorOpen((open) => !open)}
              title="Calculator"
            >
              <CalculatorIcon size={16} weight="bold" />
              <span>Calculator</span>
            </button>
          </div>
        </div>
        <div className="whiteboard-workspace">
          <CollaborationPresence className="whiteboard-editor-canvas" collaboration={collaboration} boardRef={boardRef} userId={user?._id}>
            <Noteboard
              key={note._id}
              ref={boardRef}
              elements={whiteboardElements}
              initialViewport={initialWhiteboard.viewport}
              acceptElementsChange={elements => {
                const bytes = new TextEncoder().encode(JSON.stringify({ elements, viewport: whiteboardBinding.viewport })).length;
                if (bytes > 1024 * 1024 - 4096) { setAdmissionError("This change exceeds the board storage limit. Remove an image or use a smaller image before trying again."); return false; }
                setAdmissionError(""); return true;
              }}
              maxImageBytes={700 * 1024}
              onElementsChange={handleWhiteboardChange}
              history={whiteboardBinding.history}
              onViewportChange={handleViewportChange}
              onThemeChange={setPreference}
              readOnly={readOnly}
              theme={preference}
              brandColors={noteboardBrandColors}
            />
          </CollaborationPresence>
          {calculatorOpen && (
            <aside className="whiteboard-calculator-panel">
              <p>Private calculator · only visible to you</p>
              <Calculator key={`${user?._id}:${note._id}`} theme={resolvedTheme} brandColors={noteboardBrandColors} />
            </aside>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={calculatorOpen ? "document-workspace has-tool-panel" : "document-workspace"}>
      {admissionNotice}
      {storageNotice}
      {connectionNotice}
      {privateSaveNotice}
      <CollaborationPresence className="document-presence-surface" collaboration={collaboration} userId={user?._id}>
      <WikiCompletion notes={notes} readOnly={Boolean(readOnly)} editorRef={documentEditorRef}>
      <DocumentEditor
        ref={documentEditorRef}
        className={`thyncspace-document-editor ${editorPreferences.preferences.lineWidth === "reading" ? "editor-reading-width" : ""}`}
        defaultMode={editorPreferences.preferences.mode}
        style={{ "--preferred-editor-font-size": `${editorPreferences.preferences.fontSize}px` } as React.CSSProperties}
        value={content}
        onChange={changeDocumentContent}
        history={documentBinding.history}
        readOnly={readOnly}
        theme={resolvedTheme}
        brandColors={noteboardBrandColors}
        renderToolbarEnd={() => (
          <button type="button" className="tool-toggle" aria-pressed={calculatorOpen} onClick={() => setCalculatorOpen(open => !open)}>
            <CalculatorIcon size={17} /> Calculator
          </button>
        )}
      />
      </WikiCompletion>
      </CollaborationPresence>
      {calculatorOpen && <aside className="document-tool-panel" aria-label="Calculator">
        <p>Private calculator · only visible to you</p>
        <Calculator key={`${user?._id}:${note._id}`} theme={resolvedTheme} brandColors={noteboardBrandColors} />
      </aside>}
    </div>
  );
};

export default ActiveNoteEditor;
