import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CalculatorIcon,
  CloudSlashIcon,
  CodeIcon,
  EyeIcon,
  LinkIcon,
  ListBulletsIcon,
  PencilSimpleIcon,
  QuotesIcon,
  SpinnerBallIcon,
  TextBIcon,
  TextHIcon,
  TextItalicIcon,
} from "@phosphor-icons/react";
import {
  Noteboard,
  NoteboardRef,
  type NoteboardSession,
  createTextElement,
} from "@sunaissu/noteboard";
import { useYjsNoteboard } from "@sunaissu/noteboard/yjs";
import {
  CanvasCalculator,
  DocumentCalculator,
  type CanvasCalculationInsert,
} from "@sunaissu/calculator";
import {
  MarkdownRenderer,
  type RichTextBlockType,
  type RichTextEditorHandle,
} from "@sunaissu/document-editor";
import { useYjsDocument } from "@sunaissu/document-editor/yjs";
import { DocumentNote, Note, NoteType, WhiteboardNote } from "../model/note";
import { User } from "../model/user";
import NoteContext from "../context/noteContext";
import { useNoteCollaboration } from "../hooks/useNoteCollaboration";
import { usePrivateNoteAutosave } from "../hooks/usePrivateNoteAutosave";
import LinkEditorDialog from "./linkEditorDialog";
import RichTextEditor from "./richTextEditor";

interface ActiveNoteEditorProps {
  collaborationEnabled?: boolean;
  note: Note;
  readOnly?: boolean;
  user?: User | null;
  onSaveStatusChange?: (status: "saving" | "saved" | "idle") => void;
}

type EditorMode = "visual" | "markdown" | "preview";
const COLLABORATIVE_TITLE_KEY = "note-title";

const emptyWhiteboard = (): Pick<NoteboardSession, "elements" | "viewport"> => ({
  elements: [],
  viewport: { panX: 0, panY: 0, zoom: 1 },
});

const parseWhiteboard = (
  note: Note,
): Pick<NoteboardSession, "elements" | "viewport"> => {
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

  const candidate = parsed as Partial<NoteboardSession>;
  const viewport = candidate.viewport;
  return {
    elements: Array.isArray(candidate.elements) ? candidate.elements : [],
    viewport: {
      panX: Number.isFinite(viewport?.panX) ? viewport!.panX : 0,
      panY: Number.isFinite(viewport?.panY) ? viewport!.panY : 0,
      zoom: Number.isFinite(viewport?.zoom) ? viewport!.zoom : 1,
    },
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
    initialElements: collaboration.local ? initialWhiteboard.elements : undefined,
    initialViewport: collaboration.local ? initialWhiteboard.viewport : undefined,
  });
  const titleText = useMemo(
    () => collaboration.document.getText(COLLABORATIVE_TITLE_KEY),
    [collaboration.document],
  );
  const content = documentBinding.value;
  const [mode, setMode] = useState<EditorMode>(readOnly ? "preview" : "visual");
  const editorMode: EditorMode = readOnly ? "preview" : mode;
  const [visualBlockType, setVisualBlockType] =
    useState<RichTextBlockType>("p");
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkInitialText, setLinkInitialText] = useState("");
  const [localBindingsReady, setLocalBindingsReady] = useState(false);
  const { setNotes } = useContext(NoteContext);

  const boardRef = useRef<NoteboardRef>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const richEditorRef = useRef<RichTextEditorHandle>(null);

  useEffect(() => {
    if (collaboration.local) setLocalBindingsReady(true);
  }, [collaboration.document, collaboration.local]);

  const whiteboardRevision = useMemo(
    () =>
      JSON.stringify({
        elements: whiteboardBinding.elements,
        viewport: whiteboardBinding.viewport,
      }),
    [whiteboardBinding.elements, whiteboardBinding.viewport],
  );
  const initialWhiteboardRevision = useMemo(
    () =>
      JSON.stringify({
        elements: initialWhiteboard.elements,
        viewport: initialWhiteboard.viewport,
      }),
    [initialWhiteboard],
  );
  const serializedWhiteboard = useMemo(
    () =>
      JSON.stringify({
        version: 1,
        elements: whiteboardBinding.elements,
        viewport: whiteboardBinding.viewport,
        savedAt: new Date().toISOString(),
      }),
    [whiteboardBinding.elements, whiteboardBinding.viewport],
  );
  const privateRevision =
    note.type === NoteType.Document ? content : whiteboardRevision;
  const initialPrivateRevision =
    note.type === NoteType.Document
      ? initialDocumentContent
      : initialWhiteboardRevision;
  const privateValue =
    note.type === NoteType.Document ? content : serializedWhiteboard;
  const recoverPrivateDraft = useCallback(
    (draftValue: string) => {
      if (readOnly) return false;

      if (note.type === NoteType.Document) {
        documentBinding.onChange(draftValue);
        return true;
      }

      try {
        const parsed = JSON.parse(draftValue) as Partial<NoteboardSession>;
        if (!Array.isArray(parsed.elements) || !parsed.viewport) return false;
        const { panX, panY, zoom } = parsed.viewport;
        if (
          !Number.isFinite(panX) ||
          !Number.isFinite(panY) ||
          !Number.isFinite(zoom)
        ) {
          return false;
        }
        whiteboardBinding.onElementsChange(parsed.elements);
        whiteboardBinding.onViewportChange({ panX, panY, zoom });
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

  useEffect(() => {
    const synchronizeLocalTitle = (event: Event) => {
      if (readOnly || !editorReady) return;
      const detail = (event as CustomEvent<{ noteId?: string; title?: string }>).detail;
      if (detail?.noteId !== note._id || !detail.title) return;
      collaboration.document.transact(() => {
        if (titleText.length) titleText.delete(0, titleText.length);
        titleText.insert(0, detail.title!);
      }, "title-editor");
    };
    window.addEventListener("thyncspace:title-update", synchronizeLocalTitle);
    return () =>
      window.removeEventListener("thyncspace:title-update", synchronizeLocalTitle);
  }, [collaboration.document, editorReady, note._id, readOnly, titleText]);

  const changeDocumentContent = useCallback(
    (newContent: string) => {
      if (readOnly) return;
      documentBinding.onChange(newContent);
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
    whiteboardBinding.onElementsChange(elements);
  }, [readOnly, whiteboardBinding]);

  const handleViewportChange = useCallback(
    (viewport: Parameters<typeof whiteboardBinding.onViewportChange>[0]) => {
      if (!readOnly) whiteboardBinding.onViewportChange(viewport);
    },
    [readOnly, whiteboardBinding],
  );

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
          elements: whiteboardBinding.elements,
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
    whiteboardBinding.elements,
    whiteboardBinding.viewport,
  ]);

  const insertMarkdown = useCallback(
    (prefix: string, suffix = "", placeholder = "text") => {
      const textarea = textareaRef.current;
      if (!textarea || readOnly) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selection = content.slice(start, end) || placeholder;
      const nextContent = `${content.slice(0, start)}${prefix}${selection}${suffix}${content.slice(end)}`;
      changeDocumentContent(nextContent);
      requestAnimationFrame(() => {
        textarea.focus();
        const selectionStart = start + prefix.length;
        textarea.setSelectionRange(selectionStart, selectionStart + selection.length);
      });
    },
    [changeDocumentContent, content, readOnly],
  );

  const prefixSelectedLines = useCallback(
    (prefix: string) => {
      const textarea = textareaRef.current;
      if (!textarea || readOnly) return;
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;
      const lineStart = content.lastIndexOf("\n", selectionStart - 1) + 1;
      const nextLineBreak = content.indexOf("\n", selectionEnd);
      const lineEnd = nextLineBreak === -1 ? content.length : nextLineBreak;
      const selectedLines = content.slice(lineStart, lineEnd);
      const replacement = selectedLines
        .split("\n")
        .map((line) => `${prefix}${line}`)
        .join("\n");
      changeDocumentContent(
        `${content.slice(0, lineStart)}${replacement}${content.slice(lineEnd)}`,
      );
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(lineStart, lineStart + replacement.length);
      });
    },
    [changeDocumentContent, content, readOnly],
  );

  const insertCalculatorResult = (value: string) => {
    if (editorMode === "visual" && richEditorRef.current) {
      richEditorRef.current.insertText(value);
      return;
    }
    const textarea = textareaRef.current;
    if (textarea && editorMode === "markdown") {
      insertMarkdown("", "", value);
      return;
    }
    const spacer = content && !content.endsWith("\n") ? "\n\n" : "";
    changeDocumentContent(`${content}${spacer}**Calculation:** ${value}`);
  };

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
        strokeColor: "#38bdf8",
      });
      board.setElements([...board.getElements(), calculationElement]);
    },
    [readOnly],
  );

  const counts = useMemo(() => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    return { words, characters: content.length };
  }, [content]);

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
              elements={whiteboardBinding.elements}
              viewport={whiteboardBinding.viewport}
              onElementsChange={handleWhiteboardChange}
              onViewportChange={handleViewportChange}
              readOnly={readOnly}
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

  const applyVisualOrMarkdown = (
    visualCommand: string,
    markdownAction: () => void,
    value?: string,
  ) => {
    if (editorMode === "visual") {
      richEditorRef.current?.applyCommand(visualCommand, value);
      return;
    }
    markdownAction();
  };

  const openLinkEditor = () => {
    const selectedText =
      editorMode === "visual"
        ? richEditorRef.current?.getSelectedText() || ""
        : textareaRef.current
          ? content.slice(
              textareaRef.current.selectionStart,
              textareaRef.current.selectionEnd,
            )
          : "";
    setLinkInitialText(selectedText);
    setLinkEditorOpen(true);
  };

  const applyLink = (linkText: string, address: string) => {
    if (editorMode === "visual") {
      richEditorRef.current?.insertLink(linkText, address);
      return;
    }

    const textarea = textareaRef.current;
    if (!textarea || readOnly) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.slice(start, end);
    const label = (linkText || selectedText || address).replace(/\]/g, "\\]");
    const safeAddress = address.replace(/\)/g, "%29");
    const markdownLink = `[${label}](${safeAddress})`;
    changeDocumentContent(
      `${content.slice(0, start)}${markdownLink}${content.slice(end)}`,
    );
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + markdownLink.length, start + markdownLink.length);
    });
  };

  const toolbarItems = [
    {
      label: "Heading",
      icon: TextHIcon,
      action: () =>
        applyVisualOrMarkdown("formatBlock", () => prefixSelectedLines("## "), "h2"),
    },
    {
      label: "Bold",
      icon: TextBIcon,
      action: () =>
        applyVisualOrMarkdown("bold", () =>
          insertMarkdown("**", "**", "bold text"),
        ),
    },
    {
      label: "Italic",
      icon: TextItalicIcon,
      action: () =>
        applyVisualOrMarkdown("italic", () =>
          insertMarkdown("_", "_", "italic text"),
        ),
    },
    {
      label: "Bullet list",
      icon: ListBulletsIcon,
      action: () =>
        applyVisualOrMarkdown("insertUnorderedList", () => prefixSelectedLines("- ")),
    },
    {
      label: "Quote",
      icon: QuotesIcon,
      action: () =>
        applyVisualOrMarkdown("formatBlock", () => prefixSelectedLines("> "), "blockquote"),
    },
    {
      label: "Code",
      icon: CodeIcon,
      action: () =>
        applyVisualOrMarkdown(
          "formatBlock",
          () => insertMarkdown("`", "`", "code"),
          "pre",
        ),
    },
    { label: "Link", icon: LinkIcon, action: openLinkEditor },
  ];
  const visibleToolbarItems =
    editorMode === "visual" ? toolbarItems.slice(1) : toolbarItems;

  return (
    <div className={calculatorOpen ? "document-workspace has-tool-panel" : "document-workspace"}>
      {privateSaveNotice}
      <div className="document-editor-area">
        <div className="document-toolbar">
          <div className="formatting-tools" aria-label="Text formatting">
            {editorMode === "visual" && !readOnly && (
              <select
                className="text-style-select"
                value={visualBlockType}
                onChange={(event) => {
                  richEditorRef.current?.applyCommand(
                    "formatBlock",
                    event.target.value,
                  );
                }}
                aria-label="Paragraph style"
                title="Paragraph style"
              >
                <option value="p">Normal text</option>
                <option value="h1">Heading 1</option>
                <option value="h2">Heading 2</option>
                <option value="h3">Heading 3</option>
              </select>
            )}
            {visibleToolbarItems.map(({ label, icon: Icon, action }) => (
              <button
                type="button"
                key={label}
                onClick={action}
                disabled={readOnly || editorMode === "preview"}
                title={label}
                aria-label={label}
              >
                <Icon size={17} weight="bold" />
              </button>
            ))}
          </div>

          <div className="editor-view-controls">
            {!readOnly && (
              <div className="view-segment" aria-label="Editor view">
                <button type="button" className={editorMode === "visual" ? "is-active" : ""} onClick={() => setMode("visual")} title="Visual editor">
                  <PencilSimpleIcon size={16} />
                  <span>Visual</span>
                </button>
                <button type="button" className={editorMode === "markdown" ? "is-active" : ""} onClick={() => setMode("markdown")} title="Markdown source">
                  <CodeIcon size={16} />
                  <span>Markdown</span>
                </button>
                <button type="button" className={editorMode === "preview" ? "is-active" : ""} onClick={() => setMode("preview")} title="Preview">
                  <EyeIcon size={16} />
                  <span>Preview</span>
                </button>
              </div>
            )}
            <button
              type="button"
              className={calculatorOpen ? "tool-toggle is-active" : "tool-toggle"}
              onClick={() => setCalculatorOpen((open) => !open)}
              title="Calculator"
            >
              <CalculatorIcon size={17} weight="bold" />
              <span>Calculator</span>
            </button>
          </div>
        </div>

        <div className={`document-canvas mode-${editorMode}`}>
          {editorMode === "visual" && !readOnly && (
            <div className="document-write-pane visual-write-pane">
              <RichTextEditor
                ref={richEditorRef}
                content={content}
                onChange={changeDocumentContent}
                onBlockTypeChange={setVisualBlockType}
                placeholder="Start writing your note…"
              />
            </div>
          )}

          {editorMode === "markdown" && !readOnly && (
            <div className="document-write-pane">
              <textarea
                ref={textareaRef}
                className="markdown-source"
                value={content}
                onChange={(event) => changeDocumentContent(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
                    event.preventDefault();
                    insertMarkdown("**", "**", "bold text");
                  }
                  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
                    event.preventDefault();
                    insertMarkdown("_", "_", "italic text");
                  }
                  if (event.key === "Tab") {
                    event.preventDefault();
                    insertMarkdown("  ", "", "");
                  }
                }}
                spellCheck
                placeholder={"Write Markdown here…\n\nUse tags, tasks, code, links, and more."}
                aria-label="Markdown source"
              />
            </div>
          )}

          {editorMode === "preview" && (
            <div className="document-preview-pane">
              <MarkdownRenderer content={content} />
            </div>
          )}
        </div>

        <footer className="document-statusbar">
          <div>
            <span>{counts.words} {counts.words === 1 ? "word" : "words"}</span>
            <span>{counts.characters} characters</span>
          </div>
          <div>
            <span className="obsidian-compatible-dot" />
            {collaboration.local
              ? "Stored as portable Markdown · Private"
              : `Stored as portable Markdown · ${collaboration.peers.length || 1} active`}
          </div>
        </footer>
      </div>

      {calculatorOpen && (
        <aside className="document-tool-panel">
          <DocumentCalculator
            onInsert={(payload) => insertCalculatorResult(payload.text)}
            readOnly={readOnly}
          />
        </aside>
      )}

      <LinkEditorDialog
        open={linkEditorOpen}
        editorMode={editorMode === "markdown" ? "markdown" : "visual"}
        initialText={linkInitialText}
        onClose={() => setLinkEditorOpen(false)}
        onApply={applyLink}
      />
    </div>
  );
};

export default ActiveNoteEditor;
