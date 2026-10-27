import { parsePresence, parseTextCaret, type PresencePosition, type TextCaretPosition } from "../util/presence";
import { reconcileCollaborationPeers, type CollaborationPeer, type PeerAwarenessState } from "../util/collaborationPeers";
import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { User } from "../model/user";
import * as NotesApi from "../util/fetch";
import { useLiveDraft } from "./useLiveDraft";
import { useDurableStore } from "./useDurableStore";
import env from "../util/config";

export type CollaborationStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"
  | "local"
  | "synced";

export type { CollaborationPeer } from "../util/collaborationPeers";

const COLORS = ["#2563eb", "#0891b2", "#16a34a", "#dc2626", "#ca8a04"];

interface DocumentLifecycle {
  destroyScheduled: boolean;
  destroyed: boolean;
  document: Y.Doc;
  providers: Map<HocuspocusProvider, () => void>;
  retired: Set<true>;
}

const scheduleDocumentDisposal = (lifecycle: DocumentLifecycle) => {
  if (lifecycle.destroyScheduled || lifecycle.destroyed) return;
  lifecycle.destroyScheduled = true;
  queueMicrotask(() => {
    lifecycle.destroyScheduled = false;
    if (
      lifecycle.retired.has(true) &&
      lifecycle.providers.size === 0 &&
      !lifecycle.destroyed
    ) {
      lifecycle.destroyed = true;
      lifecycle.document.destroy();
    }
  });
};

const colorForUser = (userId: string) => {
  const total = Array.from(userId).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return COLORS[total % COLORS.length];
};

const collaborationUrl = () => {
  const base = env.SERVER_URL || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base.replace(/^http/, "ws").replace(/\/$/, "")}/collaboration`;
};

export function useNoteCollaboration(
  noteId: string,
  user?: User | null,
  enabled = true,
  canEdit = true,
  noteType = "document",
) {
  const document = useMemo(
    () => new Y.Doc({ guid: enabled ? noteId : `${noteId}:private` }),
    [enabled, noteId],
  );
  const [permission, setPermission] = useState<"editor" | "viewer" | null>(null);
  const [recoveryEnabled, setRecoveryEnabled] = useState(canEdit);
  const { durability, receiveReceipt } = useDurableStore(document, noteType);
  const liveDraft = useLiveDraft(document, user?._id, noteId, enabled && recoveryEnabled, durability === "stored");
  const persistLiveDraft = liveDraft.persist;
  const liveDraftReady = liveDraft.ready;
  const lifecycle = useMemo<DocumentLifecycle>(
    () => ({
      destroyScheduled: false,
      destroyed: false,
      document,
      providers: new Map(),
      retired: new Set(),
    }),
    [document],
  );
  const userId = user?._id;
  const username = user?.username;
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCursor = useRef<PresencePosition | null>(null);
  const caretTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCaret = useRef<TextCaretPosition | null>(null);
  const publishCursor = useCallback((position: PresencePosition | null) => {
    const previous = pendingCursor.current;
    pendingCursor.current = parsePresence(position);
    if (!position) { if (cursorTimer.current !== null) clearTimeout(cursorTimer.current); cursorTimer.current = null; if (previous) providerRef.current?.setAwarenessField("cursor", null); return; }
    if (cursorTimer.current !== null) return;
    cursorTimer.current = setTimeout(() => { cursorTimer.current = null; providerRef.current?.setAwarenessField("cursor", pendingCursor.current); }, 40);
  }, []);
  const publishCaret = useCallback((position: TextCaretPosition | null) => {
    const previous = pendingCaret.current;
    const next = parseTextCaret(position);
    pendingCaret.current = next;
    if (!next) {
      if (caretTimer.current !== null) clearTimeout(caretTimer.current);
      caretTimer.current = null;
      if (previous) providerRef.current?.setAwarenessField("caret", null);
      return;
    }
    if (caretTimer.current !== null) return;
    caretTimer.current = setTimeout(() => {
      caretTimer.current = null;
      providerRef.current?.setAwarenessField("caret", pendingCaret.current);
    }, 40);
  }, []);
  const clearPresence = useCallback((provider: HocuspocusProvider | null) => {
    if (cursorTimer.current !== null) clearTimeout(cursorTimer.current);
    if (caretTimer.current !== null) clearTimeout(caretTimer.current);
    cursorTimer.current = null;
    caretTimer.current = null;
    pendingCursor.current = null;
    pendingCaret.current = null;
    provider?.setAwarenessField("cursor", null);
    provider?.setAwarenessField("caret", null);
  }, []);
  useEffect(() => () => {
    if (cursorTimer.current !== null) clearTimeout(cursorTimer.current);
    if (caretTimer.current !== null) clearTimeout(caretTimer.current);
  }, []);
  const handleStateless = useCallback((data: { payload: string }) => {
    receiveReceipt(data);
    if (data.payload.length > 512) return;
    try {
      const identity = JSON.parse(data.payload);
      if (identity.type === "note-permission" && ["editor", "viewer"].includes(identity.permission)) { setPermission(identity.permission); if (identity.permission === "editor") setRecoveryEnabled(true); }
      if (identity.type === "presence-identity" && identity.id === userId && identity.clientId === document.clientID && typeof identity.name === "string" && /^#[0-9a-f]{6}$/i.test(identity.color)) {
        providerRef.current?.setAwarenessField("user", { id: userId, name: identity.name.slice(0, 80), color: identity.color });
      }
    } catch { /* Ignore unrelated or malformed ephemeral messages. */ }
  }, [receiveReceipt, userId, document]);
  const usernameRef = useRef(username);
  useEffect(() => {
    usernameRef.current = username;
    if (userId && providerRef.current) providerRef.current.setAwarenessField("user", { id: userId, name: username, color: providerRef.current.awareness?.getLocalState()?.user?.color ?? colorForUser(userId) });
  }, [username, userId]);
  const [status, setStatus] = useState<CollaborationStatus>(
    enabled ? "connecting" : "local",
  );
  const hasSynced = useRef(false);
  const [ready, setReady] = useState(!enabled);
  const [peers, setPeers] = useState<CollaborationPeer[]>([]);
  const [unsyncedChanges, setUnsyncedChanges] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [connectionAttempt, setConnectionAttempt] = useState(0);

  const retry = useCallback(() => {
    setConnectionAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setReady(true);
      setStatus("local");
      setPeers([]);
      setUnsyncedChanges(0);
      setErrorMessage("");
      return;
    }

    if (!liveDraftReady) return;

    // A retry replaces an earlier provider for the same live Y.Doc. Its full
    // state is still present in the document, so the replacement can sync it.
    lifecycle.providers.forEach((dispose) => dispose());

    let active = true;
    let synchronized = false;
    let failed = false;
    let awarenessFrame: number | null = null;
    let awarenessStates: PeerAwarenessState[] = [];
    const updatePeers = () => {
      awarenessFrame = null;
      if (active) setPeers(previous => reconcileCollaborationPeers(previous, awarenessStates, document.clientID));
    };
    setReady(hasSynced.current);
    setStatus("connecting");
    setErrorMessage("");
    const connectionTimeout = window.setTimeout(() => {
      if (active && !synchronized) {
        failed = true;
        setStatus("error");
        setErrorMessage("The live editing service did not respond in time.");
      }
    }, 15_000);
    const provider = new HocuspocusProvider({
      url: collaborationUrl(),
      name: noteId,
      document,
      token: () => NotesApi.getCollaborationToken(noteId),
      flushDelay: 80,
      onStateless: handleStateless,
      onAuthenticated: ({ scope }) => { if (active) { setPermission(scope === "read-write" ? "editor" : "viewer"); if (scope === "read-write") setRecoveryEnabled(true); } },
      onStatus: ({ status: websocketStatus }) => {
        if (!active || failed) return;
        if (websocketStatus === WebSocketStatus.Connected) {
          setStatus("connected");
        } else if (websocketStatus === WebSocketStatus.Connecting) {
          if (!hasSynced.current) setReady(false);
          setStatus("connecting");
        } else {
          if (!hasSynced.current) setReady(false);
          clearPresence(providerRef.current);
          setStatus("disconnected");
        }
      },
      onSynced: ({ state }) => {
        if (active && state) {
          synchronized = true;
          hasSynced.current = true;
          failed = false;
          window.clearTimeout(connectionTimeout);
          setReady(true);
          setStatus("synced");
          setErrorMessage("");
        }
      },
      onAuthenticationFailed: ({ reason }) => {
        if (!active) return;
        failed = true;
        clearPresence(providerRef.current);
        window.clearTimeout(connectionTimeout);
        setStatus("error");
        setErrorMessage(
          reason === "permission-denied"
            ? "Your access could not be verified. Refresh your sign-in and try again."
            : reason || "Your access to this note could not be verified.",
        );
      },
      onUnsyncedChanges: ({ number }) => {
        if (active) setUnsyncedChanges(number);
      },
      onAwarenessChange: ({ states }) => {
        if (!active) return;
        awarenessStates = states;
        if (awarenessFrame === null) awarenessFrame = requestAnimationFrame(updatePeers);
      },
    });

    providerRef.current = provider;
    if (userId) provider.setAwarenessField("user", { id: userId, name: usernameRef.current, color: colorForUser(userId) });

    let finalized = false;
    let waitForSync: ((data: { number: number }) => void) | undefined;
    const finalizeProvider = () => {
      if (finalized) return;
      finalized = true;
      if (waitForSync) provider.off("unsyncedChanges", waitForSync);
      lifecycle.providers.delete(provider);
      if (providerRef.current === provider) providerRef.current = null;
      provider.destroy();
      scheduleDocumentDisposal(lifecycle);
    };
    lifecycle.providers.set(provider, finalizeProvider);

    return () => {
      active = false;
      if (awarenessFrame !== null) cancelAnimationFrame(awarenessFrame);
      window.clearTimeout(connectionTimeout);
      clearPresence(provider);
      provider.flushPendingUpdates();
      // Do not retain a failed provider waiting for its initial sync handshake.
      if (!synchronized) {
        finalizeProvider();
        return;
      }

      // Retiring edits need a durable browser copy before this Y.Doc is released.
      waitForSync = ({ number }) => {
        if (number === 0) void persistLiveDraft().then(stored => { if (stored) finalizeProvider(); });
      };
      provider.on("unsyncedChanges", waitForSync);
      void persistLiveDraft().then(stored => { if (stored) finalizeProvider(); });
    };
  }, [connectionAttempt, document, enabled, lifecycle, noteId, userId, handleStateless, liveDraftReady, persistLiveDraft, clearPresence]);

  useEffect(() => {
    lifecycle.retired.clear();
    return () => {
      lifecycle.retired.add(true);
      scheduleDocumentDisposal(lifecycle);
    };
  }, [lifecycle]);

  useEffect(() => {
    if (!enabled || !recoveryEnabled || (unsyncedChanges === 0 && durability === "stored")) return;
    const warnBeforeExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeExit);
    return () => window.removeEventListener("beforeunload", warnBeforeExit);
  }, [enabled, recoveryEnabled, unsyncedChanges, durability]);

  return {
    document,
    permission,
    clientId: document.clientID,
    publishCursor,
    publishCaret,
    durability,
    draftError: liveDraft.error,
    errorMessage,
    local: !enabled,
    peers,
    ready,
    retry,
    status,
    unsyncedChanges,
  };
}
