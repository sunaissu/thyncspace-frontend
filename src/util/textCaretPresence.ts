import type { TextCaretPosition } from "./presence";

export interface TextCaretRect {
  left: number;
  top: number;
  height: number;
  approximate: boolean;
  element: HTMLElement;
}

type Point = { node: Node; offset: number };
type Segment = { start: number; end: number; before: Point; after: Point; text?: Text; textOffset?: number };
const structural = /^(UL|OL|TABLE|THEAD|TBODY|TFOOT|TR|BLOCKQUOTE)$/;
const blockTags = /^(P|DIV|LI|UL|OL|TABLE|THEAD|TBODY|TFOOT|TR|TD|TH|BLOCKQUOTE|PRE|H[1-6])$/;
const atomicTags = /^(BR|IMG|HR|INPUT)$/;
const visualSelector = '[contenteditable="true"]';
const markdownSelector = "textarea.sunaissu-markdown-source";

function surface<T extends HTMLElement>(root: HTMLElement, selector: string): T | null {
  return (root.matches(selector) ? root : root.querySelector(selector)) as T | null;
}

/**
 * Rendered Markdown inserts indentation between list/table children. Treat those
 * gaps as structural boundaries, not text; browser-created lists omit them.
 */
function project(block: HTMLElement) {
  let length = 0;
  const starts = new Map<Node, number>();
  const textOffsets = new Map<Node, number>();
  const edges = new Map<Node, number[]>();
  const segments: Segment[] = [];
  const add = (size: number, before: Point, after: Point, text?: Text, textOffset?: number) => {
    segments.push({ start: length, end: length + size, before, after, text, textOffset });
    length += size;
  };
  const visit = (node: Node) => {
    starts.set(node, length);
    if (node.nodeType === 3) {
      const text = node as Text;
      const indentation = structural.test(text.parentElement?.tagName || "") && !text.data.trim();
      const afterBreak = (text.previousSibling as Element | null)?.nodeName === "BR" && text.data.startsWith("\n");
      const offset = indentation ? text.length : afterBreak ? 1 : 0;
      textOffsets.set(node, offset);
      if (text.length > offset) add(text.length - offset, { node, offset }, { node, offset: text.length }, text, offset);
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as HTMLElement;
    if (atomicTags.test(element.tagName) || element.contentEditable === "false") {
      const parent = element.parentNode;
      if (parent) {
        const index = Array.prototype.indexOf.call(parent.childNodes, element) as number;
        add(1, { node: parent, offset: index }, { node: parent, offset: index + 1 });
      }
      edges.set(node, [length - 1]);
      return;
    }
    const positions: number[] = [];
    let previous: Node | null = null;
    const children = Array.from(node.childNodes);
    children.forEach((child, index) => {
      positions.push(length);
      const indentation = child.nodeType === 3 && structural.test(element.tagName) && !child.textContent?.trim();
      if (!indentation && previous && (
        (child.nodeType === 1 && blockTags.test((child as Element).tagName)) ||
        (previous.nodeType === 1 && blockTags.test((previous as Element).tagName))
      )) {
        add(1, { node, offset: index }, { node: child, offset: 0 });
      }
      visit(child);
      if (!indentation) previous = child;
    });
    positions.push(length);
    edges.set(node, positions);
  };
  visit(block);
  return {
    length,
    offset(point: Point) {
      const start = starts.get(point.node);
      if (start === undefined) return null;
      if (point.node.nodeType === 3) return start + Math.max(0, Math.min(point.offset, point.node.textContent?.length || 0) - (textOffsets.get(point.node) || 0));
      const positions = edges.get(point.node);
      return positions?.[Math.max(0, Math.min(point.offset, positions.length - 1))] ?? start;
    },
    point(offset: number): Point {
      const bounded = Math.max(0, Math.min(offset, length));
      // Prefer the start of the next text node at an inline formatting boundary.
      const text = segments.find(segment => segment.text && bounded >= segment.start && bounded < segment.end);
      if (text?.text) return { node: text.text, offset: bounded - text.start + (text.textOffset || 0) };
      const segment = segments.find(item => bounded >= item.start && bounded <= item.end);
      if (segment) return bounded === segment.start ? segment.before : segment.after;
      return { node: block, offset: 0 };
    },
  };
}

function isEmpty(block: HTMLElement): boolean {
  return !block.textContent?.replace(/\u200b/g, "").trim() && !block.querySelector("img,hr,input,table,[contenteditable=false]");
}

/** Read the active typing endpoint. This never updates Selection or focus. */
export function captureTextCaret(root: HTMLElement): TextCaretPosition | null {
  const document = root.ownerDocument;
  const active = document.activeElement;
  const textarea = surface<HTMLTextAreaElement>(root, markdownSelector);
  if (textarea && active === textarea && !textarea.readOnly && !textarea.disabled) {
    return { surface: "markdown", block: 0, offset: textarea.selectionDirection === "backward" ? textarea.selectionStart : textarea.selectionEnd };
  }
  const editor = surface<HTMLElement>(root, visualSelector);
  if (!editor || (active !== editor && !editor.contains(active))) return null;
  const selection = document.getSelection();
  const focus = selection?.focusNode;
  if (!selection?.rangeCount || !focus || !editor.contains(focus)) return null;
  const children = Array.from(editor.children) as HTMLElement[];
  if (!children.length) return { surface: "visual", block: 0, offset: 0, empty: true };
  let block = children.findIndex(child => child === focus || child.contains(focus));
  let point = { node: focus, offset: selection.focusOffset };
  if (focus === editor) {
    const before = Array.from(editor.childNodes).slice(0, selection.focusOffset);
    const next = Array.from(editor.childNodes).slice(selection.focusOffset).find(node => node.nodeType === 1);
    const last = before.filter(node => node.nodeType === 1).at(-1);
    const target = (next || last) as HTMLElement | undefined;
    if (!target) return null;
    block = children.indexOf(target);
    point = { node: target, offset: next ? 0 : target.childNodes.length };
  }
  if (block < 0) return null;
  if (isEmpty(children[block])) return { surface: "visual", block, offset: 0, empty: true };
  const offset = project(children[block]).offset(point);
  return offset === null ? null : { surface: "visual", block, offset };
}

function lineHeight(element: HTMLElement): number {
  const styles = element.ownerDocument.defaultView!.getComputedStyle(element);
  return Number.parseFloat(styles.lineHeight) || Number.parseFloat(styles.fontSize) * 1.2 || 20;
}

function boxCaret(element: HTMLElement, approximate: boolean): Omit<TextCaretRect, "element"> {
  const rect = element.getBoundingClientRect();
  const style = element.ownerDocument.defaultView!.getComputedStyle(element);
  return {
    left: rect.left + (Number.parseFloat(style.borderLeftWidth) || 0) + (Number.parseFloat(style.paddingLeft) || 0),
    top: rect.top + (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.paddingTop) || 0),
    height: lineHeight(element), approximate,
  };
}

function pointRect(element: HTMLElement, point: Point): Omit<TextCaretRect, "element"> {
  const range = element.ownerDocument.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  const rect = Array.from(range.getClientRects()).find(item => item.height > 0);
  if (rect) return { left: rect.left, top: rect.top, height: rect.height, approximate: false };
  // Some engines omit collapsed rectangles at a <br> or element boundary.
  // Measure the adjacent character without attaching the Range to Selection.
  if (point.node.nodeType === 3 && point.node.textContent?.length) {
    const text = point.node as Text;
    const before = point.offset > 0;
    range.setStart(text, before ? point.offset - 1 : 0);
    range.setEnd(text, before ? point.offset : 1);
    const measured = Array.from(range.getClientRects()).find(item => item.height > 0);
    if (measured) {
      const rtl = element.ownerDocument.defaultView!.getComputedStyle(text.parentElement || element).direction === "rtl";
      return { left: before !== rtl ? measured.right : measured.left, top: measured.top, height: measured.height, approximate: false };
    }
  }
  if (point.node.nodeType === 1) {
    const container = point.node as HTMLElement;
    const neighbor = container.childNodes[point.offset] || container.childNodes[point.offset - 1];
    if (neighbor?.nodeType === 1 && (neighbor as Element).tagName === "BR") {
      const measured = (neighbor as Element).getBoundingClientRect();
      if (measured.height) return { left: measured.left, top: measured.top, height: measured.height, approximate: false };
    }
    return boxCaret(container, false);
  }
  return boxCaret(element, true);
}

function measureTextarea(textarea: HTMLTextAreaElement) {
  const document = textarea.ownerDocument;
  const styles = document.defaultView!.getComputedStyle(textarea);
  const bounds = textarea.getBoundingClientRect();
  const mirror = document.createElement("div");
  for (const property of [
    "box-sizing", "font-family", "font-size", "font-weight", "font-style", "font-variant", "line-height",
    "letter-spacing", "word-spacing", "text-indent", "text-transform", "text-align", "direction", "tab-size",
    "padding-top", "padding-right", "padding-bottom", "padding-left",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  ]) mirror.style.setProperty(property, styles.getPropertyValue(property));
  Object.assign(mirror.style, {
    position: "fixed", left: `${bounds.left}px`, top: `${bounds.top}px`,
    width: `${bounds.width}px`, height: "auto", minHeight: "0", margin: "0",
    visibility: "hidden", pointerEvents: "none", borderStyle: "solid",
    whiteSpace: textarea.wrap === "off" ? "pre" : "pre-wrap", overflowWrap: "break-word",
  });
  // Match the textarea's usable width even when a vertical scrollbar is present.
  const borderWidth = (Number.parseFloat(styles.borderLeftWidth) || 0) + (Number.parseFloat(styles.borderRightWidth) || 0);
  if (styles.boxSizing === "border-box") mirror.style.width = `${textarea.clientWidth + borderWidth}px`;
  else mirror.style.width = `${textarea.clientWidth - (Number.parseFloat(styles.paddingLeft) || 0) - (Number.parseFloat(styles.paddingRight) || 0)}px`;
  mirror.setAttribute("aria-hidden", "true");
  const text = document.createTextNode(textarea.value + "\u200b");
  mirror.appendChild(text);
  document.body.appendChild(mirror);
  const scrollLeft = textarea.scrollLeft, scrollTop = textarea.scrollTop;
  return {
    rect(offset: number): TextCaretRect {
      const rect = pointRect(mirror, { node: text, offset: Math.max(0, Math.min(offset, textarea.value.length)) });
      return { ...rect, left: rect.left - scrollLeft, top: rect.top - scrollTop, element: textarea };
    },
    dispose: () => mirror.remove(),
  };
}

/** Share DOM projections and a single Markdown mirror within one layout pass. */
export function getTextCaretRects(root: HTMLElement, carets: readonly TextCaretPosition[]): Array<TextCaretRect | null> {
  if (!carets.length) return [];
  const editor = carets.some(caret => caret.surface === "visual")
    ? surface<HTMLElement>(root, ".sunaissu-rich-text-editor") || surface<HTMLElement>(root, visualSelector) : null;
  const textarea = carets.some(caret => caret.surface === "markdown") ? surface<HTMLTextAreaElement>(root, markdownSelector) : null;
  const blocks = editor ? Array.from(editor.children) as HTMLElement[] : [];
  const projections = new Map<HTMLElement, ReturnType<typeof project>>();
  const empty = new Map<HTMLElement, boolean>();
  const measurements = new Map<string, TextCaretRect | null>();
  let markdown: ReturnType<typeof measureTextarea> | null = null;
  const emptyBlock = (block: HTMLElement) => {
    if (!empty.has(block)) empty.set(block, isEmpty(block));
    return empty.get(block)!;
  };
  const measure = (caret: TextCaretPosition): TextCaretRect | null => {
    if (caret.surface === "markdown") {
      if (!textarea) return null;
      markdown ??= measureTextarea(textarea);
      return markdown.rect(caret.offset);
    }
    if (!editor) return null;
    const block = blocks[caret.block];
    if (caret.empty && (!block || !emptyBlock(block))) {
      const previous = blocks[Math.min(caret.block - 1, blocks.length - 1)];
      const rect = boxCaret(previous || editor, true);
      if (previous) rect.top = previous.getBoundingClientRect().bottom + 2;
      return { ...rect, element: editor };
    }
    if (!block) return null;
    if (emptyBlock(block)) return { ...boxCaret(block, false), element: editor };
    if (!projections.has(block)) projections.set(block, project(block));
    return { ...pointRect(block, projections.get(block)!.point(caret.offset)), element: editor };
  };
  try {
    return carets.map(caret => {
      const key = `${caret.surface}:${caret.block}:${caret.offset}:${!!caret.empty}`;
      if (!measurements.has(key)) measurements.set(key, measure(caret));
      return measurements.get(key)!;
    });
  } finally {
    (markdown as ReturnType<typeof measureTextarea> | null)?.dispose();
  }
}

/** Resolve an endpoint using this browser's wrapping and scroll position. */
export function getTextCaretRect(root: HTMLElement, caret: TextCaretPosition): TextCaretRect | null {
  return getTextCaretRects(root, [caret])[0];
}
