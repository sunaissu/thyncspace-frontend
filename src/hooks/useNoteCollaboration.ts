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

    let synchronized = false;
    let failed = false;
    setReady(false);
    setStatus("connecting");
    setErrorMessage("");
    const connectionTimeout = window.setTimeout(() => {
      if (!synchronized) {
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
        if (failed) return;
        if (websocketStatus === WebSocketStatus.Connected) setStatus("connected");
        else if (websocketStatus === WebSocketStatus.Connecting) setStatus("connecting");
        else setStatus("disconnected");
      },
      onSynced: ({ state }) => {
        if (state) {
          synchronized = true;
          failed = false;
          window.clearTimeout(connectionTimeout);
          setReady(true);
          setStatus("synced");
          setErrorMessage("");
        }
      },
      onAuthenticationFailed: ({ reason }) => {
        failed = true;
        window.clearTimeout(connectionTimeout);
        setStatus("error");
        setErrorMessage(
          reason === "permission-denied"
            ? "Your access could not be verified. Refresh your sign-in and try again."
            : reason || "Your access to this note could not be verified.",
        );
      },
      onUnsyncedChanges: ({ number }) => setUnsyncedChanges(number),
      onAwarenessChange: ({ states }) => {
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

    return () => {
      window.clearTimeout(connectionTimeout);
      provider.destroy();
    };
  }, [connectionAttempt, document, enabled, noteId, user]);

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
