import { useCallback, useEffect, useRef, useState } from "react";
import type { Note } from "../model/note";
import * as NotesApi from "../util/fetch";
import {
  deletePrivateNoteDraftIfContentRevision,
  markPrivateNoteDraftSuperseded,
  type PrivateNoteDraft,
  privateNoteRevisionKey,
  readPrivateNoteDraft,
  writePrivateNoteDraft,
} from "../util/privateNoteDraft";

type SaveStatus = "saving" | "saved" | "idle";

export interface PrivateDraftNotice {
  kind: "conflict" | "recovered";
  message: string;
}

interface PrivateNoteAutosaveOptions {
  enabled: boolean;
  initialRevision: string;
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
  initialRevision,
  noteId,
  onDraftRecovered,
  onSaved,
  onStatusChange,
  revision,
  value,
}: PrivateNoteAutosaveOptions) {
  const [draftNotice, setDraftNotice] = useState<PrivateDraftNotice | null>(
    null,
  );
  const [draftReady, setDraftReady] = useState(false);
  const [draftResumeVersion, setDraftResumeVersion] = useState(0);
  const [draftStored, setDraftStored] = useState(false);
  const [error, setError] = useState("");
  const conflictingDraft = useRef<PrivateNoteDraft | null>(null);
  const draftBaseRevisionKey = useRef("");
  const draftQueue = useRef<Promise<void>>(Promise.resolve());
  const draftReadyRef = useRef(false);
  const draftTimer = useRef<number | null>(null);
  const latest = useRef<SaveSnapshot>({ revision, value });
  const lastSavedRevision = useRef(initialRevision);
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
              noteId,
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
    [noteId],
  );

  const queueDraftDelete = useCallback(
    (contentRevisionKey: string) => {
      const operation = draftQueue.current.then(async () => {
        if (!contentRevisionKey) return false;
        try {
          const deleted = await deletePrivateNoteDraftIfContentRevision(
            noteId,
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
    [noteId],
  );

  const queueDraftSupersededMarker = useCallback(
    (serverRevisionKey: string) => {
      const operation = draftQueue.current.then(async () => {
        if (!serverRevisionKey) return;
        try {
          await markPrivateNoteDraftSuperseded(noteId, serverRevisionKey);
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
    [noteId],
  );

  const applyDraft = useCallback((draft: PrivateNoteDraft) => {
    let recovered = false;
    try {
      recovered = onDraftRecoveredRef.current(draft.value);
    } catch {
      recovered = false;
    }

    if (!recovered) {
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

        const draft = await readPrivateNoteDraft(noteId);
        if (cancelled || !draft) return;
        setDraftStored(true);

        if (draft.contentRevisionKey === serverRevisionKey) {
          await deletePrivateNoteDraftIfContentRevision(
            noteId,
            serverRevisionKey,
          );
          if (!cancelled) setDraftStored(false);
          return;
        }

        const canRecoverAutomatically =
          draft.baseRevisionKey === serverRevisionKey &&
          draft.supersededByRevisionKey !== serverRevisionKey;
        if (canRecoverAutomatically) {
          applyDraft(draft);
          return;
        }

        conflictingDraft.current = draft;
        setDraftNotice({
          kind: "conflict",
          message:
            "The server note changed after this browser draft was created. Review before replacing the current version.",
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
  }, [applyDraft, enabled, initialRevision, noteId]);

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
          });
          lastSavedRevision.current = snapshot.revision;
          draftBaseRevisionKey.current = localDraft.contentRevisionKey;

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
          if (reportResult && mounted.current) {
            setError(errorMessage(saveError));
            onStatusChangeRef.current?.("idle");
          }
        }
      });
    },
    [enabled, noteId, queueDraftDelete, queueDraftWrite],
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
      onStatusChangeRef.current?.("idle");
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
    window.addEventListener("pagehide", persistBeforePageExit);

    return () => {
      window.removeEventListener("pagehide", persistBeforePageExit);
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
    const draft = conflictingDraft.current;
    if (draft && applyDraft(draft)) {
      setDraftResumeVersion((version) => version + 1);
    }
  }, [applyDraft]);

  const dismissDraftNotice = useCallback(() => {
    const draft = conflictingDraft.current;
    if (draft) {
      conflictingDraft.current = null;
      setDraftStored(false);
      void queueDraftDelete(draft.contentRevisionKey);
      setDraftResumeVersion((version) => version + 1);
    }
    setDraftNotice(null);
  }, [queueDraftDelete]);

  return {
    dismissDraftNotice,
    draftNotice,
    draftStored,
    error,
    ready: draftReady,
    restoreConflictingDraft,
    retry,
  };
}
