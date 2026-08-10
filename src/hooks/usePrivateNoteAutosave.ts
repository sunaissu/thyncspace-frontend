import { useCallback, useEffect, useRef, useState } from "react";
import type { Note } from "../model/note";
import * as NotesApi from "../util/fetch";

type SaveStatus = "saving" | "saved" | "idle";

interface PrivateNoteAutosaveOptions {
  enabled: boolean;
  initialRevision: string;
  noteId: string;
  onSaved: (note: Note) => void;
  onStatusChange?: (status: SaveStatus) => void;
  revision: string;
  value: string;
}

interface SaveSnapshot {
  revision: string;
  value: string;
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "This note could not be saved.";

export function usePrivateNoteAutosave({
  enabled,
  initialRevision,
  noteId,
  onSaved,
  onStatusChange,
  revision,
  value,
}: PrivateNoteAutosaveOptions) {
  const [error, setError] = useState("");
  const latest = useRef<SaveSnapshot>({ revision, value });
  const lastSavedRevision = useRef(initialRevision);
  const saveTimer = useRef<number | null>(null);
  const saveQueue = useRef(Promise.resolve());
  const mounted = useRef(true);
  const onSavedRef = useRef(onSaved);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onSavedRef.current = onSaved;
    onStatusChangeRef.current = onStatusChange;
  }, [onSaved, onStatusChange]);

  const queueLatestSave = useCallback(
    (reportResult = true) => {
      saveQueue.current = saveQueue.current.then(async () => {
        const snapshot = latest.current;
        if (!enabled || snapshot.revision === lastSavedRevision.current) return;

        if (reportResult && mounted.current) {
          setError("");
          onStatusChangeRef.current?.("saving");
        }

        try {
          const updatedNote = await NotesApi.updatePrivateNote(noteId, {
            text: snapshot.value,
          });
          lastSavedRevision.current = snapshot.revision;
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
    [enabled, noteId],
  );

  useEffect(() => {
    latest.current = { revision, value };
    if (!enabled) return;

    if (revision === lastSavedRevision.current) {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      onStatusChangeRef.current?.("saved");
      return;
    }

    setError("");
    onStatusChangeRef.current?.("saving");
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      queueLatestSave();
    }, 600);

    return () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [enabled, queueLatestSave, revision, value]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (enabled && latest.current.revision !== lastSavedRevision.current) {
        queueLatestSave(false);
      }
    };
  }, [enabled, queueLatestSave]);

  const retry = useCallback(() => {
    setError("");
    queueLatestSave();
  }, [queueLatestSave]);

  return { error, retry };
}
