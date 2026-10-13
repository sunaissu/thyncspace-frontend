import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { NoteboardRef } from "@sunaissu/noteboard";
import type { useNoteCollaboration } from "../hooks/useNoteCollaboration";
import type { PresencePosition } from "../util/presence";

type Collaboration = ReturnType<typeof useNoteCollaboration>;
const blocks = (root: HTMLElement, surface: PresencePosition["surface"]) => {
  if (surface === "markdown") return Array.from(root.querySelectorAll<HTMLElement>("textarea.sunaissu-markdown-source"));
  const content = surface === "visual" ? root.querySelector('[contenteditable="true"]') : root.querySelector(".sunaissu-markdown-body");
  return content ? Array.from(content.children) as HTMLElement[] : [];
};

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
  useEffect(() => {
    const node = root.current;
    if (!node || collaboration.local) return;
    const observer = new ResizeObserver(refresh);
    observer.observe(node);
    const mutations = new MutationObserver(refresh);
    const content = node.querySelector(".sunaissu-document-editor");
    if (content) mutations.observe(content, { childList: true, subtree: true, characterData: true });
    const clear = () => publish(null);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => { observer.disconnect(); mutations.disconnect(); window.removeEventListener("blur", clear); document.removeEventListener("visibilitychange", clear); if (frame.current !== null) cancelAnimationFrame(frame.current); publish(null); };
  }, [collaboration.local, publish, refresh]);

  const [positions, setPositions] = useState<Array<{ id: number; x: number; y: number; labelX: number; labelY: number }>>([]);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const bounds = node.getBoundingClientRect();
    const next: typeof positions = [];
    collaboration.peers.forEach(peer => {
      if (peer.sessionId === collaboration.clientId || !peer.cursor) return;
      const cursor = peer.cursor;
      let x: number, y: number;
      if (cursor.surface === "board") {
        const viewport = boardRef?.current?.getViewport();
        const canvas = node.querySelector("canvas")?.getBoundingClientRect();
        if (!viewport || !canvas) return;
        x = canvas.left - bounds.left + cursor.x * viewport.zoom + viewport.panX;
        y = canvas.top - bounds.top + cursor.y * viewport.zoom + viewport.panY;
      } else {
        const block = blocks(node, cursor.surface)[cursor.block ?? 0];
        if (!block) return;
        const rect = block.getBoundingClientRect();
        x = rect.left - bounds.left + cursor.x * rect.width - block.scrollLeft;
        y = rect.top - bounds.top + cursor.y - block.scrollTop;
      }
      if (x >= 0 && y >= 0 && x <= bounds.width && y <= bounds.height) next.push({ id: peer.sessionId, x, y, labelX: Math.min(18, Math.max(-x, bounds.width - x - 238)), labelY: y + 60 > bounds.height ? -30 : 15 });
    });
    setPositions(next);
  }, [collaboration.peers, collaboration.clientId, boardRef, layout]);

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
      <div className="collaboration-people" aria-label="People in this note">{collaboration.peers.map(peer => <span key={peer.sessionId} title={`${peer.name} · account ${peer.id} · session ${peer.sessionId}`} style={{ borderColor: peer.color }}><i style={{ background: peer.color }} />{peer.name}{peer.id === userId ? " (you)" : ""} <small>#{peer.sessionId.toString(36)}</small></span>)}</div>
      <div className="remote-cursor-layer" aria-label="Collaborator cursors">{positions.map((position, index) => {
        const peer = collaboration.peers.find(p => p.sessionId === position.id);
        if (!peer) return null;
        const lane = positions.slice(0, index).filter(other => Math.abs(other.x - position.x) < 240 && Math.abs(other.y - position.y) < 60).length;
        return <div key={position.id} className="remote-cursor" role="img" aria-label={`${peer.name}'s cursor, session ${position.id}`} data-owner-id={peer.id} data-session-id={position.id} style={{ left: position.x, top: position.y, color: peer.color }}>
          <svg width="18" height="23" viewBox="0 0 18 23" aria-hidden="true"><path d="M1 1L16 13L9 14L6 21Z" fill="currentColor" stroke="white" strokeWidth="1.5" /></svg>
          <span style={{ background: peer.color, position: "absolute", left: position.labelX, top: position.labelY + (position.labelY < 0 ? -1 : 1) * lane * 26, marginTop: 0 }}>{peer.name} <small>#{position.id.toString(36)}</small></span>
        </div>;
      })}</div>
    </>}
  </div>;
}
