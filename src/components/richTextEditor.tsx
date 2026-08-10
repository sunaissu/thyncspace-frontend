import {
  editorElementToMarkdown,
  markdownToEditorHtml,
  type RichTextBlockType,
  type RichTextEditorHandle,
  type RichTextEditorProps,
} from "@sunaissu/document-editor";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

interface SelectionOffsets {
  end: number;
  start: number;
}

const getSelectionOffsets = (root: HTMLElement): SelectionOffsets | null => {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const beforeStart = range.cloneRange();
  beforeStart.selectNodeContents(root);
  beforeStart.setEnd(range.startContainer, range.startOffset);
  const beforeEnd = range.cloneRange();
  beforeEnd.selectNodeContents(root);
  beforeEnd.setEnd(range.endContainer, range.endOffset);
  return {
    start: beforeStart.toString().length,
    end: beforeEnd.toString().length,
  };
};

const restoreSelectionOffsets = (
  root: HTMLElement,
  offsets: SelectionOffsets,
): Range => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let consumed = 0;
  let startSet = false;
  let endSet = false;
  let node = walker.nextNode();

  while (node) {
    const length = node.textContent?.length ?? 0;
    if (!startSet && offsets.start <= consumed + length) {
      range.setStart(node, Math.max(0, offsets.start - consumed));
      startSet = true;
    }
    if (!endSet && offsets.end <= consumed + length) {
      range.setEnd(node, Math.max(0, offsets.end - consumed));
      endSet = true;
      break;
    }
    consumed += length;
    node = walker.nextNode();
  }

  if (!startSet || !endSet) {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return range;
};

const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  (
    {
      className = "",
      content,
      onBlockTypeChange,
      onChange,
      placeholder = "Start writing…",
      readOnly = false,
    },
    forwardedRef,
  ) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const savedSelection = useRef<Range | null>(null);
    const lastEmittedContent = useRef(content);
    const composing = useRef(false);
    // This object must remain referentially stable. React reapplies innerHTML when
    // a newly allocated dangerouslySetInnerHTML value is passed after each input.
    const [initialMarkup] = useState(() => ({
      __html: markdownToEditorHtml(content),
    }));

    const emitChange = useCallback(() => {
      if (!editorRef.current || readOnly) return;
      const nextContent = editorElementToMarkdown(editorRef.current);
      lastEmittedContent.current = nextContent;
      onChange(nextContent);
    }, [onChange, readOnly]);

    const rememberSelection = useCallback(() => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return;

      savedSelection.current = range.cloneRange();
      const selectionElement =
        range.commonAncestorContainer instanceof HTMLElement
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;
      const blockType = selectionElement
        ?.closest("h1, h2, h3, p")
        ?.tagName.toLowerCase();
      onBlockTypeChange?.(
        blockType === "h1" || blockType === "h2" || blockType === "h3"
          ? (blockType as RichTextBlockType)
          : "p",
      );
    }, [onBlockTypeChange]);

    const restoreSelection = useCallback(() => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection) return;
      editor.focus();
      selection.removeAllRanges();
      if (
        savedSelection.current &&
        editor.contains(savedSelection.current.commonAncestorContainer)
      ) {
        selection.addRange(savedSelection.current);
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.addRange(range);
      savedSelection.current = range.cloneRange();
    }, []);

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor || content === lastEmittedContent.current) return;
      const selectionOffsets = getSelectionOffsets(editor);
      const wasFocused = document.activeElement === editor;
      editor.innerHTML = markdownToEditorHtml(content);
      lastEmittedContent.current = content;
      savedSelection.current = null;
      if (selectionOffsets && wasFocused) {
        savedSelection.current = restoreSelectionOffsets(
          editor,
          selectionOffsets,
        ).cloneRange();
      }
    }, [content]);

    useImperativeHandle(
      forwardedRef,
      () => ({
        applyCommand(command, value) {
          if (readOnly) return;
          restoreSelection();
          document.execCommand(command, false, value);
          rememberSelection();
          emitChange();
        },
        focus() {
          editorRef.current?.focus();
        },
        getSelectedText() {
          return savedSelection.current?.toString() ?? "";
        },
        insertLink(text, address) {
          if (readOnly || /^(javascript|data|vbscript):/i.test(address.trim())) {
            return;
          }
          restoreSelection();
          const selection = window.getSelection();
          if (!selection?.rangeCount) return;
          const range = selection.getRangeAt(0);
          const anchor = document.createElement("a");
          anchor.setAttribute("href", address);
          anchor.textContent = text.trim() || range.toString() || address;
          range.deleteContents();
          range.insertNode(anchor);
          range.setStartAfter(anchor);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          savedSelection.current = range.cloneRange();
          emitChange();
        },
        insertText(value) {
          if (readOnly) return;
          restoreSelection();
          document.execCommand("insertText", false, value);
          rememberSelection();
          emitChange();
        },
      }),
      [emitChange, readOnly, rememberSelection, restoreSelection],
    );

    return (
      <div
        ref={editorRef}
        className={`rich-text-editor sunaissu-rich-text-editor ${className}`.trim()}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        dangerouslySetInnerHTML={initialMarkup}
        onInput={() => {
          if (!composing.current) emitChange();
        }}
        onBlur={rememberSelection}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onFocus={rememberSelection}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          emitChange();
          rememberSelection();
        }}
        onClick={(event) => {
          const target = event.target;
          if (
            !(target instanceof HTMLElement) ||
            !target.classList.contains("rich-task-box") ||
            readOnly
          ) {
            return;
          }
          const item = target.closest<HTMLLIElement>("li[data-task]");
          if (!item) return;
          const checked = item.dataset.task === "checked";
          item.dataset.task = checked ? "open" : "checked";
          target.textContent = checked ? "" : "✓";
          emitChange();
        }}
        onPaste={(event) => {
          if (readOnly) return;
          event.preventDefault();
          document.execCommand(
            "insertText",
            false,
            event.clipboardData.getData("text/plain"),
          );
          emitChange();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          event.preventDefault();
          document.execCommand("insertText", false, "  ");
          emitChange();
        }}
        role="textbox"
        aria-label="Visual document editor"
        aria-multiline="true"
        aria-readonly={readOnly}
        spellCheck
      />
    );
  },
);

RichTextEditor.displayName = "RichTextEditor";

export default RichTextEditor;
