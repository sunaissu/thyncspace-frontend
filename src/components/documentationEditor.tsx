import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type * as Y from "yjs";
import {
  ArrowDownIcon, ArrowUpIcon, ArrowCounterClockwiseIcon, ArrowClockwiseIcon,
  ArrowsOutIcon, BookOpenIcon, CopyIcon, FileDocIcon, FilePdfIcon,
  PencilSimpleIcon, PlusIcon, TextTIcon, TrashIcon, XIcon, SquaresFourIcon,
} from "@phosphor-icons/react";
import {
  DocumentEditor, MarkdownRenderer, DOCUMENT_EDITOR_DARK_THEME, DOCUMENT_EDITOR_LIGHT_THEME,
  applyDocumentEditorBrandColors, getDocumentEditorThemeStyle,
} from "@sunaissu/document-editor";
import { useYjsDocument } from "@sunaissu/document-editor/yjs";
import { Noteboard, NoteboardPreview, type NoteboardRef } from "@sunaissu/noteboard";
import { useYjsNoteboard } from "@sunaissu/noteboard/yjs";
import { useTheme } from "../context/themeContext";
import { useDocumentation } from "../hooks/useDocumentation";
import {
  createDocumentation, documentationKeys, MAX_DOCUMENTATION_SECTIONS,
  type DocumentationBoardSection, type DocumentationSection, type DocumentationTextSection,
} from "../util/documentation";

export interface DocumentationEditorProps {
  document: Y.Doc;
  title: string;
  readOnly?: boolean;
  onExport?: (format: "docx" | "pdf") => void;
  exporting?: boolean;
  exportError?: string;
}
type DocumentationBinding = ReturnType<typeof useDocumentation>;

function TextSection({ document, section, reading, binding }: {
  document: Y.Doc; section: DocumentationTextSection; reading: boolean; binding: DocumentationBinding;
}) {
  const text = useYjsDocument(document, { textKey: documentationKeys(section.id).text });
  const { resolvedTheme, packageBrandColors, packageScrollbar } = useTheme();
  const previewStyle = useMemo(() => getDocumentEditorThemeStyle(applyDocumentEditorBrandColors(
    resolvedTheme === "dark" ? DOCUMENT_EDITOR_DARK_THEME : DOCUMENT_EDITOR_LIGHT_THEME, packageBrandColors,
  )), [resolvedTheme, packageBrandColors]);
  if (reading) return <div className="documentation-text-preview" style={previewStyle}><MarkdownRenderer content={text.value} emptyTitle="No text in this section." emptyHint="" /></div>;
  const textHeight = Math.min(640, Math.max(280, 180 + text.value.split("\n").reduce((lines, line) => lines + Math.max(1, Math.ceil(line.length / 90)), 0) * 24));
  return <div className="documentation-text-editor" style={{ "--documentation-text-height": `${textHeight}px` } as CSSProperties}>
    <DocumentEditor
      value={text.value}
      onChange={(next, previous) => {
        const current = text.text.toString();
        if (binding.acceptSection(section.id, { content: next }, previous !== undefined && previous !== current ? current : "")) text.onChange(next, previous);
      }}
      history={text.history}
      theme={resolvedTheme}
      brandColors={packageBrandColors}
      scrollbar={packageScrollbar}
      placeholder="Write your explanation, add a heading, or type / for a block…"
    />
  </div>;
}

function BoardSection({ document, section, reading, active, onActivate, binding }: {
  document: Y.Doc; section: DocumentationBoardSection; reading: boolean; active: boolean;
  onActivate: () => void; binding: DocumentationBinding;
}) {
  const keys = documentationKeys(section.id);
  const board = useYjsNoteboard(document, {
    elementsKey: keys.elements, orderKey: keys.order, viewportKey: keys.viewport,
    initialViewport: section.viewport, shareViewport: false,
  });
  const { resolvedTheme, packageBrandColors, packageScrollbar } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<NoteboardRef>(null);
  const visibleElements = board.elements.filter(element => !element.isDeleted && !element.hidden);
  useEffect(() => {
    if (!expanded) return;
    const node = dialog.current, previousFocus = window.document.activeElement as HTMLElement | null;
    node?.showModal();
    return () => { if (node?.open) node.close(); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [expanded]);

  const renderBoard = () => <Noteboard
    ref={canvas}
    boardId={section.id}
    elements={board.elements}
    initialViewport={board.viewport}
    onViewportChange={board.onViewportChange}
    acceptElementsChange={(next, previous) => {
      if (reading) return false;
      const stale = JSON.stringify(previous) !== JSON.stringify(section.elements);
      return binding.acceptSection(section.id, { elements: next }, stale ? JSON.stringify(section.elements) : "");
    }}
    onElementsChange={(next, previous) => { if (!reading) board.onElementsChange(next, previous); }}
    history={board.history}
    readOnly={reading}
    theme={resolvedTheme}
    brandColors={packageBrandColors}
    scrollbar={packageScrollbar}
  />;

  return <>
    <div className="documentation-board-tools">
      <span><SquaresFourIcon size={15} />{visibleElements.length ? `${visibleElements.length} object${visibleElements.length === 1 ? "" : "s"}` : "A space for your diagram"}</span>
      <div>
        {!reading && <label className="documentation-size">Size<select aria-label={`Diagram size: ${section.title || "Untitled"}`} value={section.height} onChange={event => binding.updateMetadata(section.id, { height: Number(event.target.value) })}>
          <option value={320}>Compact</option><option value={440}>Comfortable</option><option value={640}>Large</option>
          {![320, 440, 640].includes(section.height) && <option value={section.height}>Custom</option>}
        </select></label>}
        <button type="button" onClick={() => setExpanded(true)} aria-label={`Expand diagram: ${section.title || "Untitled"}`}><ArrowsOutIcon size={16} /><span>Expand</span></button>
      </div>
    </div>
    <div className={`documentation-board ${active && !reading ? "is-active" : ""}`} style={{ height: section.height }}>
      {active && !reading && !expanded ? renderBoard() : <>
        <div role="img" aria-label={section.caption || section.title || "Diagram preview"} className="documentation-board-preview">
          {visibleElements.length ? <NoteboardPreview elements={board.elements} width="100%" height="100%" style={{ background: resolvedTheme === "dark" ? "#111318" : "#fbfcfe" }} /> : <div className="documentation-board-empty"><SquaresFourIcon size={36} weight="duotone" /><strong>{reading ? "No diagram yet" : "Bring your ideas into view"}</strong><span>{reading ? "This section has no visible objects." : "Sketch a flow, map a system, or connect a few ideas."}</span></div>}
        </div>
        {!reading && !expanded && <button className="documentation-activate-board" type="button" onClick={onActivate}><PencilSimpleIcon size={17} />Edit diagram</button>}
      </>}
    </div>
    {reading ? section.caption && <p className="documentation-caption">{section.caption}</p> : <label className="documentation-caption-input"><span>Caption</span><textarea aria-label={`Diagram caption: ${section.title || "Untitled"}`} value={section.caption} maxLength={500} rows={2} placeholder="Explain what the diagram shows…" onChange={event => binding.updateMetadata(section.id, { caption: event.target.value })} /></label>}
    {expanded && <dialog className="documentation-board-dialog" ref={dialog} aria-label={section.title || "Expanded diagram"} onClose={() => setExpanded(false)}>
      <header><div><span className="documentation-kicker">Diagram</span><h2>{section.title || "Untitled diagram"}</h2></div><div><button type="button" onClick={() => canvas.current?.focusElements(visibleElements.map(element => element.id))}>Fit diagram</button><button type="button" aria-label="Close expanded diagram" onClick={() => setExpanded(false)}><XIcon size={20} /></button></div></header>
      <div className="documentation-expanded-canvas">{renderBoard()}</div>
      {section.caption && <p className="documentation-caption">{section.caption}</p>}
    </dialog>}
  </>;
}

function InsertSection({ afterId, disabled, onInsert }: { afterId?: string; disabled: boolean; onInsert: (type: "text" | "board", afterId?: string) => void }) {
  return <div className="documentation-insert" role="group" aria-label="Insert section">
    <span />
    <button type="button" disabled={disabled} onClick={() => onInsert("text", afterId)}><PlusIcon size={14} /><TextTIcon size={15} />Text</button>
    <button type="button" disabled={disabled} onClick={() => onInsert("board", afterId)}><PlusIcon size={14} /><SquaresFourIcon size={15} />Diagram</button>
    <span />
  </div>;
}

export default function DocumentationEditor({ document, title, readOnly = false, onExport, exporting = false, exportError }: DocumentationEditorProps) {
  const binding = useDocumentation(document);
  const [preview, setPreview] = useState(false);
  const [activeBoard, setActiveBoard] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const reading = readOnly || preview;
  const sections = binding.content?.sections ?? [];
  const limitReached = sections.length >= MAX_DOCUMENTATION_SECTIONS;
  const jump = (id: string) => {
    setActiveSection(id);
    window.document.getElementById(`documentation-section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const reveal = (id: string | null) => {
    if (!id) return;
    setActiveSection(id);
    requestAnimationFrame(() => { const section = window.document.getElementById(`documentation-section-${id}`); section?.scrollIntoView({ behavior: "smooth", block: "start" }); section?.querySelector<HTMLInputElement>(".documentation-section-title")?.focus({ preventScroll: true }); });
  };
  const insert = (type: "text" | "board", afterId?: string) => {
    if (reading) return;
    const id = binding.insert(type, afterId); reveal(id);
    if (type === "board") setActiveBoard(id);
  };

  return <div className={`documentation-editor ${reading ? "is-reading" : ""}`}>
    <header className="documentation-topbar">
      <div><span className="documentation-kicker">Documentation</span><span className="documentation-section-count">{sections.length} section{sections.length === 1 ? "" : "s"}</span></div>
      <div className="documentation-topbar-actions">
        {!readOnly && <div className="documentation-view-switch" role="group" aria-label="Documentation view"><button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}><PencilSimpleIcon size={16} />Write</button><button type="button" aria-pressed={preview} onClick={() => setPreview(true)}><BookOpenIcon size={16} />Read</button></div>}
        {!reading && <div className="documentation-history" role="group" aria-label="Section history"><button type="button" className="documentation-icon-button" aria-label="Undo section change" title="Undo section change" disabled={!binding.canUndo} onClick={binding.undo}><ArrowCounterClockwiseIcon size={17} /></button><button type="button" className="documentation-icon-button" aria-label="Redo section change" title="Redo section change" disabled={!binding.canRedo} onClick={binding.redo}><ArrowClockwiseIcon size={17} /></button></div>}
        {onExport && <div className="documentation-export" role="group" aria-label="Export documentation"><button type="button" disabled={exporting || Boolean(binding.error)} onClick={() => onExport("docx")}><FileDocIcon size={17} />Word</button><button type="button" disabled={exporting || Boolean(binding.error)} onClick={() => onExport("pdf")}><FilePdfIcon size={17} />PDF</button></div>}
      </div>
    </header>
    {(binding.error || exportError) && <div className="documentation-notice is-error" role="alert">{binding.error || exportError}</div>}
    {binding.notice && <div className="documentation-notice" role="status">{binding.notice}</div>}
    {exporting && <p className="documentation-notice" role="status">Preparing your document…</p>}
    <div className="documentation-layout">
      <aside className="documentation-outline" aria-label="Document outline">
        <span className="documentation-kicker">On this page</span>
        <nav>{sections.map((section, index) => <button type="button" key={section.id} onClick={() => jump(section.id)} aria-current={activeSection === section.id ? "location" : undefined}><span className="documentation-outline-number">{String(index + 1).padStart(2, "0")}</span>{section.type === "text" ? <TextTIcon size={15} /> : <SquaresFourIcon size={15} />}<span>{section.title || "Untitled section"}</span></button>)}</nav>
        {!reading && <p>Build your page with text and diagrams. Each section can move with you.</p>}
      </aside>
      <div className="documentation-page-scroll" tabIndex={0} role="region" aria-label="Documentation page">
        <div className="documentation-page">
          <div className="documentation-page-heading"><span className="documentation-kicker">{reading ? "Reading view" : "Your working document"}</span><h1>{title || "Untitled documentation"}</h1><p>{reading ? "Text and diagrams on one page." : "Write explanations, add diagrams, and arrange the sections."}</p></div>
          {!binding.error && !sections.length && <div className="documentation-empty"><BookOpenIcon size={40} weight="duotone" /><h2>{readOnly ? "This document is empty" : "Start with an idea"}</h2><p>{readOnly ? "There are no sections to read yet." : "Add text to explain it, or a diagram to show it."}</p></div>}
          {!reading && !binding.error && !sections.length && <div className="documentation-starters" role="group" aria-label="Document templates">
            <button type="button" onClick={() => binding.seed(createDocumentation("project"))}><strong>Project brief</strong><span>Overview, a diagram, and next steps</span></button>
            <button type="button" onClick={() => binding.seed(createDocumentation("meeting"))}><strong>Meeting notes</strong><span>Agenda, ideas, and actions</span></button>
            <button type="button" onClick={() => binding.seed(createDocumentation("blank"))}><strong>Blank page</strong><span>One text section to begin</span></button>
          </div>}
          {!reading && !binding.error && !sections.length && <InsertSection disabled={false} onInsert={insert} />}
          {sections.map((section: DocumentationSection, index) => <div key={section.id}>
            <section id={`documentation-section-${section.id}`} className={`documentation-section is-${section.type}`} aria-label={`Section ${index + 1}: ${section.title || "Untitled"}`} onFocus={() => setActiveSection(section.id)}>
              <header className="documentation-section-header">
                <span className="documentation-section-number">{String(index + 1).padStart(2, "0")}</span>
                {reading ? <h2>{section.title || "Untitled section"}</h2> : <input className="documentation-section-title" aria-label={`Section ${index + 1} title`} maxLength={120} value={section.title} placeholder="Section title" onChange={event => binding.updateMetadata(section.id, { title: event.target.value })} />}
                {!reading && <div className="documentation-section-actions" role="group" aria-label={`Section ${index + 1} actions`}>
                  <button type="button" aria-label="Move section up" title="Move up" disabled={index === 0} onClick={() => binding.move(section.id, -1)}><ArrowUpIcon size={16} /></button>
                  <button type="button" aria-label="Move section down" title="Move down" disabled={index === sections.length - 1} onClick={() => binding.move(section.id, 1)}><ArrowDownIcon size={16} /></button>
                  <button type="button" aria-label="Duplicate section" title="Duplicate" disabled={limitReached} onClick={() => reveal(binding.duplicate(section.id))}><CopyIcon size={16} /></button>
                  <button type="button" aria-label="Remove section" title="Remove" onClick={() => binding.remove(section.id)}><TrashIcon size={16} /></button>
                </div>}
              </header>
              {section.type === "text" ? <TextSection document={document} section={section} reading={reading} binding={binding} /> : <BoardSection document={document} section={section} reading={reading} active={activeBoard === section.id} onActivate={() => setActiveBoard(section.id)} binding={binding} />}
            </section>
            {!reading && <InsertSection afterId={section.id} disabled={limitReached} onInsert={insert} />}
          </div>)}
          {!reading && limitReached && <p className="documentation-limit">This document has 40 sections. Remove a section before adding another.</p>}
        </div>
      </div>
    </div>
  </div>;
}
