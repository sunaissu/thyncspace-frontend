import SavedCalculations from "./savedCalculations";
import { calculationMarkdown } from "../util/savedCalculations";
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
  createTextElement,
} from "@sunaissu/noteboard";
import { useYjsNoteboard } from "@sunaissu/noteboard/yjs";
import {
  CanvasCalculator,
  DocumentCalculator,
  type CanvasCalculationInsert,
} from "@sunaissu/calculator";
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
  onSaveStatusChange?: (status: "saving" | "saved" | "idle") => void;
}

const COLLABORATIVE_TITLE_KEY = "note-title";

const emptyWhiteboard = (): Pick<WhiteboardContent, "elements" | "viewport"> => ({
  elements: [],
  viewport: { panX: 0, panY: 0, zoom: 1 },
});

const viewportsEqual = (
  left: WhiteboardContent["viewport"],
  right: WhiteboardContent["viewport"],
) =>
  left.panX === right.panX &&
  left.panY === right.panY &&
  left.zoom === right.zoom;

interface PendingViewportWrite {
  next: WhiteboardContent["viewport"];
  previous: WhiteboardContent["viewport"];
}

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
  readOnly,
  user,
  onSaveStatusChange,
}) => {
  const collaboration = useNoteCollaboration(
    note._id,
    user,
    collaborationEnabled,
  );
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
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [localBindingsReady, setLocalBindingsReady] = useState(false);
  const { setNotes } = useContext(NoteContext);
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
  const pendingViewportWriteRef = useRef<PendingViewportWrite | null>(null);

  useEffect(() => {
    pendingViewportWriteRef.current = null;
  }, [collaboration.document]);

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
      revision: JSON.stringify(snapshot),
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
        viewport: initialWhiteboard.viewport,
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
            ? { ...existingNote, updatedAt: savedNote.updatedAt }
            : existingNote,
        ),
      );
    },
    [note._id, setNotes],
  );
  const privateAutosave = usePrivateNoteAutosave({
    enabled: collaboration.local && localBindingsReady && !readOnly,
    initialRevision: initialPrivateRevision,
    noteId: note._id,
    onDraftRecovered: recoverPrivateDraft,
    onSaved: handlePrivateSaved,
    onStatusChange: onSaveStatusChange,
    revision: privateRevision,
    value: privateValue,
  });
  const editorReady =
    collaboration.ready &&
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
    if (collaboration.unsyncedChanges > 0) onSaveStatusChange?.("saving");
    else if (collaboration.status === "synced") onSaveStatusChange?.("saved");
    else onSaveStatusChange?.("idle");
  }, [
    collaboration.local,
    collaboration.status,
    collaboration.unsyncedChanges,
    onSaveStatusChange,
  ]);

  const handleWhiteboardChange = useCallback((elements: Parameters<typeof whiteboardBinding.onElementsChange>[0]) => {
    if (readOnly) return;
    whiteboardBinding.onElementsChange(sanitizeNoteboardElements(elements));
  }, [readOnly, whiteboardBinding]);

  const handleViewportChange = useCallback(
    (viewport: Parameters<typeof whiteboardBinding.onViewportChange>[0]) => {
      const nextViewport = sanitizeNoteboardViewport(viewport);
      if (
        viewportsEqual(nextViewport, whiteboardBinding.viewport) ||
        (pendingViewportWriteRef.current !== null &&
          viewportsEqual(nextViewport, pendingViewportWriteRef.current.next))
      ) {
        return;
      }

      // Noteboard 2.0 can report a controlled viewport after applying it.
      // Suppress both that external echo and duplicate events emitted before
      // the Yjs binding has rendered its updated snapshot.
      pendingViewportWriteRef.current = {
        next: nextViewport,
        previous: whiteboardBinding.viewport,
      };
      whiteboardBinding.onViewportChange(nextViewport);
    },
    [whiteboardBinding],
  );

  useEffect(() => {
    const pending = pendingViewportWriteRef.current;
    if (
      pending !== null &&
      !viewportsEqual(pending.previous, whiteboardBinding.viewport)
    ) {
      // The binding either acknowledged this write or a remote transaction
      // superseded it. In both cases a future gesture may legitimately revisit
      // the same viewport and must no longer be treated as a duplicate.
      pendingViewportWriteRef.current = null;
    }
  }, [whiteboardBinding.viewport]);

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
        updatedAt: new Date().toISOString(),
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

  const insertCanvasCalculatorResult = useCallback(
    (payload: CanvasCalculationInsert) => {
      if (readOnly) return;
      const board = boardRef.current;
      if (!board) return;

      const session = board.getSession();
      const zoom = session.viewport.zoom || 1;
      const calculationElement = createTextElement({
        text: payload.text,
        x: (payload.x - session.viewport.panX) / zoom,
        y: (payload.y - session.viewport.panY) / zoom,
        width: payload.width,
        height: payload.height,
        fontSize: 20,
        fontWeight: "bold",
        strokeColor: noteboardBrandColors.primary,
      });
      board.setElements([...board.getElements(), calculationElement]);
    },
    [noteboardBrandColors.primary, readOnly],
  );

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
          <div className="whiteboard-editor-canvas">
            <Noteboard
              key={note._id}
              ref={boardRef}
              elements={whiteboardElements}
              initialViewport={
                readOnly || collaboration.local
                  ? whiteboardBinding.viewport
                  : undefined
              }
              viewport={
                !readOnly && !collaboration.local
                  ? whiteboardBinding.viewport
                  : undefined
              }
              onElementsChange={handleWhiteboardChange}
              history={whiteboardBinding.history}
              onViewportChange={readOnly ? undefined : handleViewportChange}
              onThemeChange={setPreference}
              readOnly={readOnly}
              theme={preference}
              brandColors={noteboardBrandColors}
            />
          </div>
          {calculatorOpen && (
            <aside className="whiteboard-calculator-panel">
              <CanvasCalculator
                onInsert={insertCanvasCalculatorResult}
                readOnly={readOnly}
              />
            </aside>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={calculatorOpen ? "document-workspace has-tool-panel" : "document-workspace"}>
      {privateSaveNotice}
      <DocumentEditor
        ref={documentEditorRef}
        className="thyncspace-document-editor"
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
      {calculatorOpen && <aside className="document-tool-panel" aria-label="Calculator">
        <SavedCalculations content={content} readOnly={readOnly} onChange={changeDocumentContent} />
        <DocumentCalculator onInsert={payload => documentEditorRef.current?.appendBlock(calculationMarkdown(payload))} readOnly={readOnly} />
      </aside>}
    </div>
  );
};

export default ActiveNoteEditor;
