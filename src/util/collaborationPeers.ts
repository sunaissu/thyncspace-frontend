import { parsePresence, parseTextCaret, type PresencePosition, type TextCaretPosition } from "./presence";

export interface CollaborationPeer {
  color?: string;
  id: string;
  sessionId: number;
  cursor?: PresencePosition | null;
  caret?: TextCaretPosition | null;
  name: string;
}

export interface PeerAwarenessState {
  clientId: number;
  user?: unknown;
  cursor?: unknown;
  caret?: unknown;
}

const sameCursor = (a: CollaborationPeer["cursor"], b: CollaborationPeer["cursor"]) =>
  a === b || (!!a && !!b && a.surface === b.surface && a.block === b.block && a.x === b.x && a.y === b.y);
const sameCaret = (a: CollaborationPeer["caret"], b: CollaborationPeer["caret"]) =>
  a === b || (!!a && !!b && a.surface === b.surface && a.block === b.block && a.offset === b.offset && a.empty === b.empty);

/** Preserve React state across heartbeats and local movement; remote endpoints remain exact. */
export function reconcileCollaborationPeers(
  previous: CollaborationPeer[],
  states: readonly PeerAwarenessState[],
  localClientId: number,
): CollaborationPeer[] {
  const existing = new Map(previous.map(peer => [peer.sessionId, peer]));
  const next = new Map<number, CollaborationPeer>();
  for (const state of states) {
    const user = state.user as Partial<CollaborationPeer> | null;
    if (!user || typeof user.id !== "string" || !user.id || typeof user.name !== "string" || !Number.isSafeInteger(state.clientId)) continue;
    const caret = parseTextCaret(state.caret);
    const candidate: CollaborationPeer = {
      id: user.id,
      name: user.name.slice(0, 80),
      color: typeof user.color === "string" && /^#[0-9a-f]{6}$/i.test(user.color) ? user.color : "#2563eb",
      sessionId: state.clientId,
      cursor: state.clientId === localClientId ? null : parsePresence(state.cursor),
      caret: state.clientId === localClientId && caret ? { surface: caret.surface, block: 0, offset: 0 } : caret,
    };
    const old = existing.get(state.clientId);
    next.set(state.clientId, old && old.id === candidate.id && old.name === candidate.name && old.color === candidate.color &&
      sameCursor(old.cursor, candidate.cursor) && sameCaret(old.caret, candidate.caret) ? old : candidate);
  }
  // Awareness Map ordering is incidental; keep the roster steady on updates.
  const result = previous.filter(peer => next.has(peer.sessionId)).map(peer => {
    const value = next.get(peer.sessionId)!;
    next.delete(peer.sessionId);
    return value;
  });
  result.push(...next.values());
  return result.length === previous.length && result.every((peer, index) => peer === previous[index]) ? previous : result;
}
