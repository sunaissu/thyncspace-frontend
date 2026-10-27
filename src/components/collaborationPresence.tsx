import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { NoteboardRef } from "@sunaissu/noteboard";
import type { useNoteCollaboration } from "../hooks/useNoteCollaboration";
import type { PresencePosition } from "../util/presence";
import { captureTextCaret, getTextCaretRect, getTextCaretRects } from "../util/textCaretPresence";

type Collaboration = ReturnType<typeof useNoteCollaboration>;
const blocks = (root: HTMLElement, surface: PresencePosition["surface"]) => {
  if (surface === "markdown") return Array.from(root.querySelectorAll<HTMLElement>("textarea.sunaissu-markdown-source"));
  const content = surface === "visual" ? root.querySelector('[contenteditable="true"]') : root.querySelector(".sunaissu-markdown-body");
  return content ? Array.from(content.children) as HTMLElement[] : [];
};

function visibleBounds(element: HTMLElement, root: HTMLElement, bounds: DOMRect) {
  let left = Math.max(0, bounds.left), top = Math.max(0, bounds.top);
  let right = Math.min(window.innerWidth, bounds.right), bottom = Math.min(window.innerHeight, bounds.bottom);
  for (let node: HTMLElement | null = element; node && node !== root; node = node.parentElement) {
    const style = getComputedStyle(node), rect = node.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, rect.left); right = Math.min(right, rect.right); }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
  }
  return { left, top, right, bottom };
}

function samePositions<T extends object>(previous: T[], next: T[]): boolean {
  return previous.length === next.length && next.every((value, index) =>
    (Object.keys(value) as Array<keyof T>).every(key => value[key] === previous[index][key]));
}

/** Presence is ephemeral. It never changes document content or local selection. */
export default function CollaborationPresence({ children, collaboration, boardRef, userId, className }: {
  children: ReactNode; collaboration: Collaboration; boardRef?: RefObject<NoteboardRef | null>; userId?: string; className: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState(0);
  const frame = useRef<number | null>(null);
  const refresh = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => { frame.current = null; setLayout(v => v + 1); });
  }, []);
  const publish = collaboration.publishCursor;
  const publishCaret = collaboration.publishCaret;
  useEffect(() => {
    const node = root.current;
    if (!node || collaboration.local || collaboration.status !== "synced") return;
    let pending: number | null = null, previous = "", blurred = !document.hasFocus();
    const send = () => {
      pending = null;
      const caret = document.hidden || blurred ? null : captureTextCaret(node);
      const serialized = JSON.stringify(caret);
      if (serialized !== previous) { previous = serialized; publishCaret(caret); }
    };
    const schedule = () => { if (pending === null) pending = requestAnimationFrame(send); };
    const clear = () => {
      if (pending !== null) cancelAnimationFrame(pending);
      pending = null; previous = "null"; publishCaret(null);
    };
    const visibility = () => { if (document.hidden) clear(); else schedule(); };
    const blur = () => { blurred = true; clear(); };
    const focus = () => { blurred = false; schedule(); };
    const observer = new MutationObserver(schedule);
    const editor = node.querySelector(".sunaissu-document-editor");
    if (editor) observer.observe(editor, { childList: true, subtree: true, characterData: true });
    document.addEventListener("selectionchange", schedule);
    for (const event of ["input", "keyup", "pointerup", "focusin", "focusout"]) node.addEventListener(event, schedule);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    schedule();
    return () => {
      observer.disconnect();
      document.removeEventListener("selectionchange", schedule);
      for (const event of ["input", "keyup", "pointerup", "focusin", "focusout"]) node.removeEventListener(event, schedule);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
      clear();
    };
  }, [collaboration.local, collaboration.status, publishCaret]);
  useEffect(() => {
    const node = root.current;
    if (!node || collaboration.local) return;
    const observer = new ResizeObserver(refresh);
    observer.observe(node);
    const mutations = new MutationObserver(refresh);
    const content = node.querySelector(".sunaissu-document-editor");
    if (content) mutations.observe(content, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style"] });
    const clear = () => publish(null);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => { observer.disconnect(); mutations.disconnect(); window.removeEventListener("blur", clear); document.removeEventListener("visibilitychange", clear); if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; publish(null); };
  }, [collaboration.local, publish, refresh]);

  const [positions, setPositions] = useState<Array<{ id: number; x: number; y: number; labelX: number; labelY: number }>>([]);
  const [textPositions, setTextPositions] = useState<Array<{ id: number; x: number; y: number; height: number; visible: boolean; labelX: number; labelY: number; approximate: boolean }>>([]);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const bounds = node.getBoundingClientRect();
    const next: typeof positions = [];
    const carets: typeof textPositions = [];
    const peers = collaboration.peers.filter(peer => peer.sessionId !== collaboration.clientId);
    const caretPeers = peers.filter(peer => peer.caret);
    const caretRects = getTextCaretRects(node, caretPeers.map(peer => peer.caret!));
    const clips = new Map<HTMLElement, ReturnType<typeof visibleBounds>>();
    caretPeers.forEach((peer, index) => {
      const caret = caretRects[index];
      if (!caret) return;
      if (!clips.has(caret.element)) clips.set(caret.element, visibleBounds(caret.element, node, bounds));
      const clip = clips.get(caret.element)!;
      const x = caret.left - bounds.left, y = caret.top - bounds.top;
      const visible = caret.left >= clip.left && caret.left <= clip.right &&
        caret.top >= clip.top && caret.top + caret.height <= clip.bottom;
      carets.push({
        id: peer.sessionId, x, y, height: caret.height, visible, approximate: caret.approximate,
        labelX: Math.max(clip.left - bounds.left - x, Math.min(3, clip.right - bounds.left - x - 190)),
        labelY: caret.top - 24 >= clip.top ? -24 : caret.height + 2,
      });
    });
    const candidates = new Map<PresencePosition["surface"], HTMLElement[]>();
    const rectangles = new Map<HTMLElement, DOMRect>();
    const viewport = boardRef?.current?.getViewport();
    const canvas = viewport ? node.querySelector("canvas")?.getBoundingClientRect() : null;
    peers.forEach(peer => {
      if (!peer.cursor || (peer.caret && peer.cursor.surface !== "board")) return;
      const cursor = peer.cursor;
      let x: number, y: number;
      if (cursor.surface === "board") {
        if (!viewport || !canvas) return;
        x = canvas.left - bounds.left + cursor.x * viewport.zoom + viewport.panX;
        y = canvas.top - bounds.top + cursor.y * viewport.zoom + viewport.panY;
      } else {
        if (!candidates.has(cursor.surface)) candidates.set(cursor.surface, blocks(node, cursor.surface));
        const block = candidates.get(cursor.surface)![cursor.block ?? 0];
        if (!block) return;
        if (!rectangles.has(block)) rectangles.set(block, block.getBoundingClientRect());
        const rect = rectangles.get(block)!;
        x = rect.left - bounds.left + cursor.x * rect.width - block.scrollLeft;
        y = rect.top - bounds.top + cursor.y - block.scrollTop;
      }
      if (x >= 0 && y >= 0 && x <= bounds.width && y <= bounds.height) next.push({ id: peer.sessionId, x, y, labelX: Math.min(18, Math.max(-x, bounds.width - x - 238)), labelY: y + 60 > bounds.height ? -30 : 15 });
    });
    setPositions(previous => samePositions(previous, next) ? previous : next);
    setTextPositions(previous => samePositions(previous, carets) ? previous : carets);
  }, [collaboration.peers, collaboration.clientId, boardRef, layout]);
  const peersById = useMemo(() => new Map(collaboration.peers.map(peer => [peer.sessionId, peer])), [collaboration.peers]);
  const textPositionsById = useMemo(() => new Map(textPositions.map(position => [position.id, position])), [textPositions]);

  const showCaret = (id: number) => {
    const node = root.current, peer = peersById.get(id);
    if (!node || !peer?.caret) return;
    const caret = getTextCaretRect(node, peer.caret);
    if (!caret) return;
    for (let pane: HTMLElement | null = caret.element; pane && pane !== node; pane = pane.parentElement) {
      const style = getComputedStyle(pane);
      if (!/(auto|scroll)/.test(style.overflowY) || pane.scrollHeight <= pane.clientHeight) continue;
      const bounds = pane.getBoundingClientRect();
      pane.scrollBy({ top: caret.top - bounds.top - pane.clientHeight / 2, behavior: "smooth" });
      break;
    }
    refresh();
  };

  return <div ref={root} className={`presence-surface ${className}`} onScrollCapture={refresh} onWheelCapture={refresh} onClickCapture={refresh}
    onPointerLeave={() => publish(null)} onPointerMoveCapture={event => {
      if (collaboration.local || !(event.target instanceof HTMLElement)) return;
      const node = root.current!;
      const target = event.target;
      if (target.tagName === "CANVAS" && boardRef?.current) {
        const rect = target.getBoundingClientRect(), v = boardRef.current.getViewport();
        publish({ surface: "board", x: (event.clientX - rect.left - v.panX) / v.zoom, y: (event.clientY - rect.top - v.panY) / v.zoom });
        refresh(); return;
      }
      const surface = target.closest("textarea.sunaissu-markdown-source") ? "markdown" : target.closest('[contenteditable="true"]') ? "visual" : target.closest(".sunaissu-markdown-body") ? "preview" : null;
      if (!surface) { publish(null); return; }
      const candidates = blocks(node, surface);
      const index = candidates.findIndex(block => block === target || block.contains(target));
      if (index < 0) { publish(null); return; }
      const block = candidates[index], rect = block.getBoundingClientRect();
      if (!rect.width) return;
      publish({ surface, block: index, x: Math.max(0, Math.min(1, (event.clientX - rect.left + block.scrollLeft) / rect.width)), y: event.clientY - rect.top + block.scrollTop });
    }}>
    {children}
    {!collaboration.local && <>
      <div className="collaboration-people" aria-label="People in this note">{collaboration.peers.map(peer => {
        const position = textPositionsById.get(peer.sessionId);
        const label = <><i style={{ background: peer.color }} />{peer.name}{peer.id === userId ? " (you)" : ""} <small>#{peer.sessionId.toString(36)}</small>{peer.caret && <small className="presence-editing">{position ? "Show" : "editing"}</small>}</>;
        return position
          ? <button key={peer.sessionId} type="button" className="collaborator-location" aria-label={`Show ${peer.name}'s typing position`} title={`Show ${peer.name}'s typing position`} style={{ borderColor: peer.color }} onPointerDown={event => event.preventDefault()} onClick={() => showCaret(peer.sessionId)}>{label}</button>
          : <span key={peer.sessionId} title={`${peer.name} · account ${peer.id} · session ${peer.sessionId}${peer.caret ? ` · editing ${peer.caret.surface === "markdown" ? "Markdown" : "document"}` : ""}`} style={{ borderColor: peer.color }}>{label}</span>;
      })}</div>
      <div className="remote-cursor-layer" aria-label="Collaborator cursors">{positions.map((position, index) => {
        const peer = peersById.get(position.id);
        if (!peer) return null;
        const lane = positions.slice(0, index).filter(other => Math.abs(other.x - position.x) < 240 && Math.abs(other.y - position.y) < 60).length;
        return <div key={position.id} className="remote-cursor" role="img" aria-label={`${peer.name}'s cursor, session ${position.id}`} data-owner-id={peer.id} data-session-id={position.id} style={{ left: position.x, top: position.y, color: peer.color }}>
          <svg width="18" height="23" viewBox="0 0 18 23" aria-hidden="true"><path d="M1 1L16 13L9 14L6 21Z" fill="currentColor" stroke="white" strokeWidth="1.5" /></svg>
          <span style={{ background: peer.color, position: "absolute", left: position.labelX, top: position.labelY + (position.labelY < 0 ? -1 : 1) * lane * 26, marginTop: 0 }}>{peer.name} <small>#{position.id.toString(36)}</small></span>
        </div>;
      })}
      {textPositions.filter(position => position.visible).map(position => {
        const peer = peersById.get(position.id);
        if (!peer) return null;
        return <div key={`caret-${position.id}`} className="remote-text-caret" role="img" aria-label={`${peer.name}'s typing caret`} data-owner-id={peer.id} data-session-id={position.id} data-approximate={position.approximate || undefined} style={{ left: position.x, top: position.y, height: position.height, color: peer.color }}>
          <span style={{ background: peer.color, left: position.labelX, top: position.labelY }}>{peer.name}</span>
        </div>;
      })}</div>
    </>}
  </div>;
}
