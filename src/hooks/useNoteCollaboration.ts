import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { User } from "../model/user";
import * as NotesApi from "../util/fetch";
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
  name: string;
}

const COLORS = ["#7c3aed", "#0891b2", "#16a34a", "#dc2626", "#ca8a04"];

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
) {
  const document = useMemo(
    () => new Y.Doc({ guid: enabled ? noteId : `${noteId}:private` }),
    [enabled, noteId],
  );
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
  const [status, setStatus] = useState<CollaborationStatus>(
    enabled ? "connecting" : "local",
  );
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

    // A retry replaces an earlier provider for the same live Y.Doc. Its full
    // state is still present in the document, so the replacement can sync it.
    lifecycle.providers.forEach((dispose) => dispose());

    let active = true;
    let synchronized = false;
    let failed = false;
    setReady(false);
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
      onStatus: ({ status: websocketStatus }) => {
        if (!active || failed) return;
        if (websocketStatus === WebSocketStatus.Connected) {
          setStatus("connected");
        } else if (websocketStatus === WebSocketStatus.Connecting) {
          setReady(false);
          setStatus("connecting");
        } else {
          // Do not leave an apparently editable note on screen while updates
          // are only queued in memory. Leaving during that state would destroy
          // the provider and could discard those queued document/canvas edits.
          setReady(false);
          setStatus("disconnected");
        }
      },
      onSynced: ({ state }) => {
        if (active && state) {
          synchronized = true;
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
          if (awarenessUser?.id) next.set(awarenessUser.id, awarenessUser);
        });
        setPeers(Array.from(next.values()));
      },
    });

    if (user) {
      provider.setAwarenessField("user", {
        id: user._id,
        name: user.username,
        color: colorForUser(user._id),
      });
    }

    let finalized = false;
    let waitForSync: ((data: { number: number }) => void) | undefined;
    const finalizeProvider = () => {
      if (finalized) return;
      finalized = true;
      if (waitForSync) provider.off("unsyncedChanges", waitForSync);
      lifecycle.providers.delete(provider);
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
      if (!synchronized || !provider.hasUnsyncedChanges) {
        finalizeProvider();
        return;
      }

      // Keep a retired note's provider connected until the server has
      // acknowledged its queued updates. It then tears itself and the Y.Doc
      // down without keeping the editor component mounted.
      waitForSync = ({ number }) => {
        if (number === 0) finalizeProvider();
      };
      provider.on("unsyncedChanges", waitForSync);
    };
  }, [connectionAttempt, document, enabled, lifecycle, noteId, user]);

  useEffect(() => {
    lifecycle.retired.clear();
    return () => {
      lifecycle.retired.add(true);
      scheduleDocumentDisposal(lifecycle);
    };
  }, [lifecycle]);

  useEffect(() => {
    if (!enabled || unsyncedChanges === 0) return;
    const warnBeforeExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeExit);
    return () => window.removeEventListener("beforeunload", warnBeforeExit);
  }, [enabled, unsyncedChanges]);

  return {
    document,
    errorMessage,
    local: !enabled,
    peers,
    ready,
    retry,
    status,
    unsyncedChanges,
  };
}
