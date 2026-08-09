import { LinkIcon, XIcon } from "@phosphor-icons/react";
import React, { useEffect, useRef, useState } from "react";

interface LinkEditorDialogProps {
  editorMode: "visual" | "markdown";
  initialText: string;
  open: boolean;
  onApply: (text: string, address: string) => void;
  onClose: () => void;
}

function normalizeAddress(value: string): string | null {
  const address = value.trim();
  if (!address || /^(javascript|data|vbscript):/i.test(address)) return null;
  if (/^(www\.|[\w-]+(?:\.[\w-]+)+(?:\/|$))/i.test(address)) {
    return `https://${address}`;
  }
  return address;
}

const LinkEditorDialog: React.FC<LinkEditorDialogProps> = ({
  editorMode,
  initialText,
  open,
  onApply,
  onClose,
}) => {
  const isMarkdown = editorMode === "markdown";
  const [text, setText] = useState(initialText);
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const addressRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setText(initialText);
    setAddress("");
    setError("");
    const focusTimer = window.setTimeout(() => addressRef.current?.focus(), 0);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [initialText, onClose, open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop link-editor-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className={`modal-panel link-editor-dialog ${isMarkdown ? "is-markdown" : "is-visual"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-editor-title"
        onSubmit={(event) => {
          event.preventDefault();
          const normalizedAddress = normalizeAddress(address);
          if (!normalizedAddress) {
            setError("Enter a valid and safe link address.");
            addressRef.current?.focus();
            return;
          }
          onApply(text.trim(), normalizedAddress);
          onClose();
        }}
      >
        <header className="link-editor-header">
          <div className="link-editor-heading-icon">
            <LinkIcon size={18} weight="bold" />
          </div>
          <div>
            <h2 id="link-editor-title">
              {isMarkdown ? "Insert Markdown link" : "Add visual link"}
            </h2>
            <p>
              {isMarkdown
                ? "Insert link syntax directly into the Markdown source."
                : "Turn selected text into a clickable link."}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close link editor">
            <XIcon size={17} />
          </button>
        </header>

        <div className="link-editor-fields">
          <label>
            <span>{isMarkdown ? "Link label" : "Text to display"}</span>
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Uses the selected text or address"
            />
          </label>
          <label>
            <span>Link address</span>
            <input
              ref={addressRef}
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
                setError("");
              }}
              placeholder="https://example.com"
              inputMode="url"
              autoComplete="url"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "link-editor-error" : undefined}
            />
          </label>
          {error && <p id="link-editor-error" className="link-editor-error" role="alert">{error}</p>}
          {isMarkdown ? (
            <div className="link-editor-preview is-markdown-preview">
              <span>Markdown preview</span>
              <code>[{text || "link text"}]({address || "https://example.com"})</code>
            </div>
          ) : (
            <div className="link-editor-preview is-visual-preview">
              <span>Link preview</span>
              <strong>{text || address || "Linked text"}</strong>
            </div>
          )}
        </div>

        <footer className="link-editor-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="is-primary">
            {isMarkdown ? "Insert link" : "Add link"}
          </button>
        </footer>
      </form>
    </div>
  );
};

export default LinkEditorDialog;
