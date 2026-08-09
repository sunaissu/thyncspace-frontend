import React, { useEffect, useRef, useState } from "react";
import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  DownloadSimpleIcon,
  FileMdIcon,
  FolderOpenIcon,
  InfoIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { DocumentNote, Note, NoteType } from "../model/note";

interface ImportedMarkdownNote {
  title: string;
  content: string;
  sourcePath: string;
}

const MAX_IMPORT_NOTES = 100;
const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
const MAX_OBSIDIAN_URI_LENGTH = 8_000;

interface ObsidianBridgeProps {
  open: boolean;
  notes: Note[];
  activeNote: Note | null;
  onClose: () => void;
  onImport: (notes: ImportedMarkdownNote[]) => Promise<void>;
}

const sanitizeFileName = (title: string) =>
  (title || "Untitled")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\.+$/g, "")
    .trim() || "Untitled";

const getDocumentContent = (note: Note) =>
  note.type === NoteType.Document ? (note as DocumentNote).content || "" : "";

function downloadMarkdown(note: Note) {
  if (note.type !== NoteType.Document) return;
  const blob = new Blob([getDocumentContent(note)], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFileName(note.title)}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const ObsidianBridge: React.FC<ObsidianBridgeProps> = ({
  open,
  notes,
  activeNote,
  onClose,
  onImport,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [vaultName, setVaultName] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open) return;
    setVaultName(localStorage.getItem("thyncspace-obsidian-vault") || "");
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
      folderInputRef.current.setAttribute("directory", "");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  const documentNotes = notes.filter((note) => note.type === NoteType.Document);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setStatus("");
    try {
      const markdownFiles = Array.from(files).filter((file) =>
        file.name.toLowerCase().endsWith(".md"),
      );
      if (markdownFiles.length > MAX_IMPORT_NOTES) {
        throw new Error(`Choose at most ${MAX_IMPORT_NOTES} Markdown files at once.`);
      }
      const imported: ImportedMarkdownNote[] = [];
      let totalBytes = 0;
      for (const file of markdownFiles) {
        totalBytes += file.size;
        if (file.size > 1024 * 1024 || totalBytes > MAX_IMPORT_BYTES) {
          throw new Error("The selected Markdown import is too large.");
        }
        imported.push({
          title: file.name.replace(/\.md$/i, ""),
          content: await file.text(),
          sourcePath:
            (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
            file.name,
        });
      }
      if (imported.length === 0) {
        setStatus("No Markdown files were found.");
        return;
      }
      await onImport(imported);
      setStatus(
        `Imported ${imported.length} Markdown ${imported.length === 1 ? "note" : "notes"}.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  };

  const openInObsidian = () => {
    if (!activeNote || activeNote.type !== NoteType.Document) return;
    const parameters = new URLSearchParams({
      name: activeNote.title,
      content: getDocumentContent(activeNote),
      silent: "true",
    });
    if (vaultName.trim()) {
      parameters.set("vault", vaultName.trim());
      localStorage.setItem("thyncspace-obsidian-vault", vaultName.trim());
    }
    const uri = `obsidian://new?${parameters.toString()}`;
    if (uri.length > MAX_OBSIDIAN_URI_LENGTH) {
      downloadMarkdown(activeNote);
      setStatus("This note is too large for an Obsidian URI, so it was downloaded instead.");
      return;
    }
    window.location.href = uri;
  };

  const exportVault = async () => {
    if (!documentNotes.length) return;
    setBusy(true);
    setStatus("");
    try {
      const directoryPicker = (window as typeof window & {
        showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
      }).showDirectoryPicker;
      if (directoryPicker) {
        const directory = await directoryPicker();
        const usedFileNames = new Map<string, number>();
        for (const note of documentNotes) {
          const baseName = sanitizeFileName(note.title);
          const occurrence = (usedFileNames.get(baseName.toLowerCase()) || 0) + 1;
          usedFileNames.set(baseName.toLowerCase(), occurrence);
          const uniqueName = occurrence === 1 ? baseName : `${baseName} (${occurrence})`;
          const fileHandle = await directory.getFileHandle(
            `${uniqueName}.md`,
            { create: true },
          );
          const writable = await fileHandle.createWritable();
          await writable.write(getDocumentContent(note));
          await writable.close();
        }
        setStatus(`Exported ${documentNotes.length} Markdown notes to the selected folder.`);
      } else {
        documentNotes.forEach((note, index) => {
          window.setTimeout(() => downloadMarkdown(note), index * 120);
        });
        setStatus(
          `Downloading ${documentNotes.length} Markdown files. Your browser may ask to allow multiple downloads.`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setStatus("Export cancelled.");
      } else {
        setStatus(error instanceof Error ? error.message : "Export failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="obsidian-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="obsidian-drawer" aria-modal="true" role="dialog" aria-label="Obsidian bridge">
        <header className="obsidian-header">
          <div className="obsidian-mark" aria-hidden="true">
            <span>O</span>
          </div>
          <div>
            <span className="eyebrow">Markdown bridge</span>
            <h2>Obsidian</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close Obsidian panel">
            <XIcon size={20} />
          </button>
        </header>

        <div className="obsidian-content">
          <div className="obsidian-callout">
            <InfoIcon size={18} weight="fill" />
            <p>
              ThyncSpace now speaks plain Markdown. Import a vault folder, export notes back as <code>.md</code>, or hand the open note to Obsidian.
            </p>
          </div>

          <section className="bridge-section">
            <div className="bridge-section-title">
              <span>Bring notes in</span>
              <small>Folders remain local until you choose them.</small>
            </div>
            <div className="bridge-action-grid">
              <button type="button" className="bridge-action" onClick={() => folderInputRef.current?.click()} disabled={busy}>
                <FolderOpenIcon size={22} weight="bold" />
                <strong>Import vault folder</strong>
                <span>Read every Markdown file in a selected folder.</span>
              </button>
              <button type="button" className="bridge-action" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                <UploadSimpleIcon size={22} weight="bold" />
                <strong>Choose .md files</strong>
                <span>Import one note or a hand-picked set.</span>
              </button>
            </div>
            <input
              ref={folderInputRef}
              className="sr-only"
              type="file"
              accept=".md,text/markdown"
              multiple
              onChange={(event) => handleFiles(event.target.files)}
            />
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept=".md,text/markdown"
              multiple
              onChange={(event) => handleFiles(event.target.files)}
            />
          </section>

          <section className="bridge-section">
            <div className="bridge-section-title">
              <span>Send notes out</span>
              <small>{documentNotes.length} Markdown {documentNotes.length === 1 ? "note" : "notes"} ready.</small>
            </div>
            <button type="button" className="bridge-wide-action" onClick={exportVault} disabled={busy || !documentNotes.length}>
              <DownloadSimpleIcon size={20} weight="bold" />
              <span>
                <strong>Export Markdown vault</strong>
                <small>Write each document as its own Obsidian-ready file.</small>
              </span>
            </button>
            <button
              type="button"
              className="bridge-wide-action"
              onClick={() => activeNote && downloadMarkdown(activeNote)}
              disabled={!activeNote || activeNote.type !== NoteType.Document}
            >
              <FileMdIcon size={20} weight="bold" />
              <span>
                <strong>Download current note</strong>
                <small>{activeNote?.type === NoteType.Document ? `${activeNote.title}.md` : "Open a document first."}</small>
              </span>
            </button>
          </section>

          <section className="bridge-section obsidian-open-section">
            <div className="bridge-section-title">
              <span>Open in the desktop app</span>
              <small>Creates or updates a note through Obsidian’s URI.</small>
            </div>
            <label className="vault-name-field">
              <span>Vault name <small>optional</small></span>
              <input
                value={vaultName}
                onChange={(event) => setVaultName(event.target.value)}
                placeholder="e.g. Engineering"
              />
            </label>
            <button
              type="button"
              className="obsidian-open-button"
              onClick={openInObsidian}
              disabled={!activeNote || activeNote.type !== NoteType.Document}
            >
              <ArrowSquareOutIcon size={18} weight="bold" />
              Open current note in Obsidian
            </button>
          </section>

          {status && (
            <div className="bridge-status" role="status">
              <CheckCircleIcon size={17} weight="fill" />
              {status}
            </div>
          )}

          <p className="bridge-footnote">
            For automatic two-way sync, ThyncSpace will need a companion Obsidian plugin. This bridge keeps the first integration private and portable without requiring vault-wide permission.
          </p>
        </div>
      </aside>
    </div>
  );
};

export type { ImportedMarkdownNote };
export default ObsidianBridge;
