import { parsePresence, type PresencePosition } from "../util/presence";
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

export interface CollaborationPeer {
  color?: string;
  id: string;
  sessionId: number;
  cursor?: PresencePosition | null;
  name: string;
}

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
  const publishCursor = useCallback((position: PresencePosition | null) => {
    const previous = pendingCursor.current;
    pendingCursor.current = parsePresence(position);
    if (!position) { if (cursorTimer.current !== null) clearTimeout(cursorTimer.current); cursorTimer.current = null; if (previous) providerRef.current?.setAwarenessField("cursor", null); return; }
    if (cursorTimer.current !== null) return;
    cursorTimer.current = setTimeout(() => { cursorTimer.current = null; providerRef.current?.setAwarenessField("cursor", pendingCursor.current); }, 40);
  }, []);
  useEffect(() => () => { if (cursorTimer.current !== null) clearTimeout(cursorTimer.current); }, []);
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
          // Do not leave an apparently editable note on screen while updates
          // are only queued in memory. Leaving during that state would destroy
          // the provider and could discard those queued document/canvas edits.
          if (!hasSynced.current) setReady(false);
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
        const next = new Map<string, CollaborationPeer>();
        states.forEach((state) => {
          const awarenessUser = state.user as CollaborationPeer | undefined;
          if (awarenessUser?.id && typeof awarenessUser.name === "string" && Number.isSafeInteger(state.clientId)) next.set(String(state.clientId), { id: awarenessUser.id, name: awarenessUser.name.slice(0, 80), color: typeof awarenessUser.color === "string" && /^#[0-9a-f]{6}$/i.test(awarenessUser.color) ? awarenessUser.color : "#2563eb", sessionId: state.clientId, cursor: parsePresence(state.cursor) });
        });
        setPeers(Array.from(next.values()));
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
      window.clearTimeout(connectionTimeout);
      provider.flushPendingUpdates();
      // The provider counts its initial sync handshake as an unsynced change.
      // Before the first successful sync the editor was never writable, so
      // retaining that provider cannot preserve a user edit and only leaks a
      // reconnect loop after authentication or connection failures.
      if (!synchronized) {
        finalizeProvider();
        return;
      }

      // Keep a retired note's provider connected until the server has
      // acknowledged its queued updates. It then tears itself and the Y.Doc
      // down without keeping the editor component mounted.
      waitForSync = ({ number }) => {
        if (number === 0) void persistLiveDraft().then(stored => { if (stored) finalizeProvider(); });
      };
      provider.on("unsyncedChanges", waitForSync);
      // Once a durable browser copy exists, the retired provider can stop.
      void persistLiveDraft().then(stored => { if (stored) finalizeProvider(); });
    };
  }, [connectionAttempt, document, enabled, lifecycle, noteId, userId, handleStateless, liveDraftReady, persistLiveDraft]);

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
