import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { User } from "../model/user";
import * as NotesApi from "../util/fetch";
import env from "../util/config";

export type CollaborationStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"
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

export function useNoteCollaboration(noteId: string, user?: User | null) {
  const document = useMemo(() => new Y.Doc({ guid: noteId }), [noteId]);
  const [status, setStatus] = useState<CollaborationStatus>("connecting");
  const [ready, setReady] = useState(false);
  const [peers, setPeers] = useState<CollaborationPeer[]>([]);
  const [unsyncedChanges, setUnsyncedChanges] = useState(0);

  useEffect(() => {
    let synchronized = false;
    const connectionTimeout = window.setTimeout(() => {
      if (!synchronized) setStatus("error");
    }, 15_000);
    const provider = new HocuspocusProvider({
      url: collaborationUrl(),
      name: noteId,
      document,
      token: () => NotesApi.getCollaborationToken(noteId),
      flushDelay: 80,
      onStatus: ({ status: websocketStatus }) => {
        if (websocketStatus === WebSocketStatus.Connected) setStatus("connected");
        else if (websocketStatus === WebSocketStatus.Connecting) setStatus("connecting");
        else setStatus("disconnected");
      },
      onSynced: ({ state }) => {
        if (state) {
          synchronized = true;
          window.clearTimeout(connectionTimeout);
          setReady(true);
          setStatus("synced");
        }
      },
      onAuthenticationFailed: () => setStatus("error"),
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
  }, [document, noteId, user]);

  return { document, peers, ready, status, unsyncedChanges };
}
