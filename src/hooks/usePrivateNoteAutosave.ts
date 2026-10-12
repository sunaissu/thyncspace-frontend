import { useCallback, useEffect, useRef, useState } from "react";
import type { Note } from "../model/note";
import * as NotesApi from "../util/fetch";
import {
  deletePrivateNoteDraftIfContentRevision,
  markPrivateNoteDraftSuperseded,
  type PrivateNoteDraft,
  privateNoteRevisionKey,
  listPrivateNoteDrafts,
  migrateLegacyPrivateNoteDraft,
  privateDraftPrefix,
  writePrivateNoteDraft,
} from "../util/privateNoteDraft";

type SaveStatus = "saving" | "saved" | "idle" | "error" | "synced";

export interface PrivateDraftNotice {
  kind: "conflict" | "recovered";
  message: string;
}

interface PrivateNoteAutosaveOptions {
  enabled: boolean;
  accountId: string;
  initialRevision: string;
  initialServerRevision: number;
  noteId: string;
  onDraftRecovered: (value: string) => boolean;
  onSaved: (note: Note) => void;
  onStatusChange?: (status: SaveStatus) => void;
  revision: string;
  value: string;
}

interface SaveSnapshot {
  revision: string;
  value: string;
}

interface DraftWriteResult {
  contentRevisionKey: string;
  stored: boolean;
}

const AUTOSAVE_DELAY_MS = 2_000;
const LOCAL_DRAFT_INTERVAL_MS = 250;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "This note could not be saved.";

export function usePrivateNoteAutosave({
  enabled,
  accountId,
  initialRevision,
  initialServerRevision,
  noteId,
  onDraftRecovered,
  onSaved,
  onStatusChange,
  revision,
  value,
}: PrivateNoteAutosaveOptions) {
  const [sessionId] = useState(() => globalThis.crypto.randomUUID());
  const storageId = privateDraftPrefix(accountId, noteId) + sessionId;
  const [availableDrafts, setAvailableDrafts] = useState<PrivateNoteDraft[]>([]);
  const [draftNotice, setDraftNotice] = useState<PrivateDraftNotice | null>(
    null,
  );
  const [draftReady, setDraftReady] = useState(false);
  const [draftResumeVersion, setDraftResumeVersion] = useState(0);
  const [draftStored, setDraftStored] = useState(false);
  const [error, setError] = useState("");
  const [conflictServer, setConflictServer] = useState<Note | null>(null);
  const [conflictValue, setConflictValue] = useState("");
  const conflictingDraft = useRef<PrivateNoteDraft | null>(null);
  const draftBaseRevisionKey = useRef("");
  const restoredDraft = useRef<PrivateNoteDraft | null>(null);
  const draftQueue = useRef<Promise<void>>(Promise.resolve());
  const draftReadyRef = useRef(false);
  const draftTimer = useRef<number | null>(null);
  const latest = useRef<SaveSnapshot>({ revision, value });
  const lastSavedRevision = useRef(initialRevision);
  const serverRevision = useRef(initialServerRevision);
  const saveTimer = useRef<number | null>(null);
  const saveQueue = useRef(Promise.resolve());
  const mounted = useRef(true);
  const onDraftRecoveredRef = useRef(onDraftRecovered);
  const onSavedRef = useRef(onSaved);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onDraftRecoveredRef.current = onDraftRecovered;
    onSavedRef.current = onSaved;
    onStatusChangeRef.current = onStatusChange;
  }, [onDraftRecovered, onSaved, onStatusChange]);

  const queueDraftWrite = useCallback(
    (snapshot: SaveSnapshot, baseRevisionKey: string) => {
      const operation = draftQueue.current.then(async (): Promise<DraftWriteResult> => {
        let contentRevisionKey = "";
        let stored = false;
        try {
          contentRevisionKey = await privateNoteRevisionKey(snapshot.revision);
          if (baseRevisionKey) {
            stored = await writePrivateNoteDraft({
              baseRevisionKey,
              contentRevisionKey,
              noteId: storageId,
              updatedAt: new Date().toISOString(),
              value: snapshot.value,
            });
          }
        } catch {
          stored = false;
        }

        if (mounted.current && latest.current.revision === snapshot.revision) {
          setDraftStored(stored);
        }
        return { contentRevisionKey, stored };
      });
      draftQueue.current = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    [storageId],
  );

  const queueDraftDelete = useCallback(
    (contentRevisionKey: string) => {
      const operation = draftQueue.current.then(async () => {
        if (!contentRevisionKey) return false;
        try {
          const deleted = await deletePrivateNoteDraftIfContentRevision(
            storageId,
            contentRevisionKey,
          );
          if (
            deleted &&
            mounted.current &&
            latest.current.revision === lastSavedRevision.current
          ) {
            setDraftStored(false);
          }
          return deleted;
        } catch {
          // A confirmed-saved draft is safe to retain if cleanup fails.
          return false;
        }
      });
      draftQueue.current = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    [storageId],
  );

  const queueDraftSupersededMarker = useCallback(
    (serverRevisionKey: string) => {
      const operation = draftQueue.current.then(async () => {
        if (!serverRevisionKey) return;
        try {
          await markPrivateNoteDraftSuperseded(storageId, serverRevisionKey);
        } catch {
          // Remote autosave remains available if browser storage is unavailable.
        }
      });
      draftQueue.current = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    [storageId],
  );

  const applyDraft = useCallback((draft: PrivateNoteDraft) => {
    let recovered = false;
    try {
      recovered = onDraftRecoveredRef.current(draft.value);
    } catch {
      recovered = false;
    }

    if (!recovered) {
      setConflictValue(draft.value);
      conflictingDraft.current = draft;
      setDraftNotice({
        kind: "conflict",
        message:
          "This browser has a draft that could not be applied automatically. The stored copy has been kept.",
      });
      return false;
    }

    conflictingDraft.current = null;
    setDraftStored(true);
    setDraftNotice({
      kind: "recovered",
      message:
        "Your unsaved changes were restored from this browser and will sync automatically.",
    });
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    draftReadyRef.current = false;
    setDraftReady(false);
    setDraftStored(false);
    setDraftNotice(null);
    conflictingDraft.current = null;
    draftBaseRevisionKey.current = "";

    if (!enabled) return () => undefined;

    void (async () => {
      try {
        const serverRevisionKey = await privateNoteRevisionKey(initialRevision);
        if (cancelled) return;
        draftBaseRevisionKey.current = serverRevisionKey;

        await migrateLegacyPrivateNoteDraft(accountId, noteId).catch(() => undefined);
        const drafts = await listPrivateNoteDrafts(accountId, noteId);
        if (cancelled) return;
        await Promise.all(drafts.filter(item => item.contentRevisionKey === serverRevisionKey).map(item => deletePrivateNoteDraftIfContentRevision(item.noteId, serverRevisionKey).catch(() => false)));
        if (cancelled) return;
        setAvailableDrafts(drafts.filter(item => item.contentRevisionKey !== serverRevisionKey));
        const draft = drafts.find(item => item.contentRevisionKey !== serverRevisionKey);
        if (cancelled || !draft) return;
        setDraftStored(true);

        setConflictValue(draft.value);
        conflictingDraft.current = draft;
        setDraftNotice({
          kind: "conflict",
          message:
            "This browser has a retained draft from another editing session. Compare it with the current server version before restoring.",
        });
      } catch {
        // Remote autosave remains available if IndexedDB is disabled or full.
      } finally {
        if (!cancelled) {
          draftReadyRef.current = true;
          setDraftReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyDraft, enabled, initialRevision, noteId, accountId]);

  const queueLatestSave = useCallback(
    (reportResult = true) => {
      saveQueue.current = saveQueue.current.then(async () => {
        const snapshot = latest.current;
        if (
          !enabled ||
          !draftReadyRef.current ||
          conflictingDraft.current !== null ||
          snapshot.revision === lastSavedRevision.current
        ) {
          return;
        }

        if (reportResult && mounted.current) {
          setError("");
          onStatusChangeRef.current?.("saving");
        }

        const localDraft = await queueDraftWrite(
          snapshot,
          draftBaseRevisionKey.current,
        );

        try {
          const updatedNote = await NotesApi.updatePrivateNote(noteId, {
            text: snapshot.value,
            expectedRevision: serverRevision.current,
          });
          serverRevision.current = updatedNote.contentRevision ?? serverRevision.current;
          lastSavedRevision.current = snapshot.revision;
          draftBaseRevisionKey.current = localDraft.contentRevisionKey;
          const recovered = restoredDraft.current;
          if (recovered) {
            await deletePrivateNoteDraftIfContentRevision(recovered.noteId, recovered.contentRevisionKey).catch(() => false);
            if (restoredDraft.current === recovered) restoredDraft.current = null;
          }

          if (latest.current.revision === snapshot.revision) {
            await queueDraftDelete(localDraft.contentRevisionKey);
            if (mounted.current) setDraftNotice(null);
          } else {
            await queueDraftWrite(
              latest.current,
              localDraft.contentRevisionKey,
            );
            if (mounted.current) {
              setDraftResumeVersion((version) => version + 1);
            }
          }

          if (reportResult && mounted.current) {
            setError("");
            onSavedRef.current(updatedNote);
            onStatusChangeRef.current?.(
              latest.current.revision === lastSavedRevision.current
                ? "saved"
                : "saving",
            );
          }
        } catch (saveError) {
          if (saveError instanceof NotesApi.ApiError && saveError.status === 409 && mounted.current) {
            try {
              const server = await NotesApi.fetchNote(noteId);
              const local = { ...latest.current };
              const revisionKey = await privateNoteRevisionKey(local.revision);
              if (mounted.current) {
                setConflictServer(server);
                setConflictValue(local.value);
                conflictingDraft.current = { noteId: storageId, value: local.value, baseRevisionKey: draftBaseRevisionKey.current, contentRevisionKey: revisionKey, updatedAt: new Date().toISOString() };
                setDraftNotice({ kind: "conflict", message: "Another session saved a newer version. Compare both copies before choosing; either copy can be downloaded." });
              }
            } catch { /* Keep the local draft and allow another recovery attempt. */ }
          }
          if (reportResult && mounted.current) {
            setError(errorMessage(saveError));
            onStatusChangeRef.current?.("error");
          }
        }
      });
    },
    [enabled, noteId, storageId, queueDraftDelete, queueDraftWrite],
  );

  useEffect(() => {
    latest.current = { revision, value };
    if (!enabled || !draftReady) return;

    if (conflictingDraft.current) {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      if (draftTimer.current !== null) {
        window.clearTimeout(draftTimer.current);
        draftTimer.current = null;
      }
      onStatusChangeRef.current?.("error");
      return;
    }

    if (revision === lastSavedRevision.current) {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      if (draftTimer.current !== null) {
        window.clearTimeout(draftTimer.current);
        draftTimer.current = null;
      }
      void queueDraftSupersededMarker(draftBaseRevisionKey.current);
      onStatusChangeRef.current?.("saved");
      return;
    }

    setDraftStored(false);
    setError("");
    onStatusChangeRef.current?.("saving");

    if (draftTimer.current === null) {
      draftTimer.current = window.setTimeout(() => {
        draftTimer.current = null;
        void queueDraftWrite(latest.current, draftBaseRevisionKey.current);
      }, LOCAL_DRAFT_INTERVAL_MS);
    }

    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      queueLatestSave();
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [
    draftReady,
    enabled,
    queueDraftSupersededMarker,
    queueDraftWrite,
    queueLatestSave,
    revision,
    draftResumeVersion,
    value,
  ]);

  useEffect(() => {
    mounted.current = true;
    const persistBeforePageExit = () => {
      if (
        enabled &&
        draftReadyRef.current &&
        conflictingDraft.current === null &&
        latest.current.revision !== lastSavedRevision.current
      ) {
        void queueDraftWrite(latest.current, draftBaseRevisionKey.current);
      }
    };
    const warnBeforeExit = (event: BeforeUnloadEvent) => {
      if (enabled && (conflictingDraft.current || latest.current.revision !== lastSavedRevision.current)) {
        event.preventDefault(); event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warnBeforeExit);
    window.addEventListener("pagehide", persistBeforePageExit);

    return () => {
      window.removeEventListener("pagehide", persistBeforePageExit);
      window.removeEventListener("beforeunload", warnBeforeExit);
      mounted.current = false;
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (draftTimer.current !== null) {
        window.clearTimeout(draftTimer.current);
        draftTimer.current = null;
      }
      if (
        enabled &&
        draftReadyRef.current &&
        conflictingDraft.current === null &&
        latest.current.revision !== lastSavedRevision.current
      ) {
        void queueLatestSave(false);
      }
    };
  }, [enabled, queueDraftWrite, queueLatestSave]);

  const retry = useCallback(() => {
    setError("");
    queueLatestSave();
  }, [queueLatestSave]);

  const restoreConflictingDraft = useCallback(() => {
    setError("");
    const draft = conflictingDraft.current;
    if (conflictServer) serverRevision.current = conflictServer.contentRevision ?? 0;
    if (draft && applyDraft(draft)) {
      restoredDraft.current = draft;
      setDraftResumeVersion((version) => version + 1);
    }
  }, [applyDraft, conflictServer]);

  const dismissDraftNotice = useCallback(() => {
    setError("");
    const draft = conflictingDraft.current;
    if (draft) {
      if (conflictServer) {
        const serverValue = typeof conflictServer.content === "string" ? conflictServer.content : JSON.stringify(conflictServer.content);
        if (!onDraftRecoveredRef.current(serverValue)) return;
        serverRevision.current = conflictServer.contentRevision ?? 0;
        // The resulting editor revision may normalize board JSON; a harmless save confirms it.
        lastSavedRevision.current = serverValue;
        onSavedRef.current(conflictServer);
      }
      conflictingDraft.current = null;
      setDraftStored(false);
      void deletePrivateNoteDraftIfContentRevision(draft.noteId, draft.contentRevisionKey).catch(() => false);
      setDraftResumeVersion((version) => version + 1);
    }
    setDraftNotice(null);
  }, [conflictServer]);

  return {
    dismissDraftNotice,
    availableDrafts,
    selectDraft: (id: string) => {
      const draft = availableDrafts.find(item => item.noteId === id);
      if (draft) { conflictingDraft.current = draft; setConflictValue(draft.value); }
    },
    conflictValue,
    conflictServer,
    draftNotice,
    draftStored,
    error,
    ready: draftReady,
    restoreConflictingDraft,
    retry,
  };
}
