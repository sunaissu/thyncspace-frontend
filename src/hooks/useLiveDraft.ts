import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { deletePrivateNoteDraftIfContentRevision, listPrivateNoteDrafts, privateDraftPrefix, privateNoteRevisionKey, writePrivateNoteDraft } from "../util/privateNoteDraft";

const encode = (bytes: Uint8Array) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
};
const decode = (value: string) => {
  if (value.length > 12 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error("Invalid retained live draft");
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
};

/** Cache CRDT state per account and session. The server reauthorizes every replay. */
export function useLiveDraft(document: Y.Doc, accountId: string | undefined, noteId: string, enabled: boolean, stored: boolean) {
  const [sessionId] = useState(() => globalThis.crypto.randomUUID());
  const [ready, setReady] = useState(!enabled);
  const [error, setError] = useState("");
  const scope = noteId + ":live:v1";
  const key = privateDraftPrefix(accountId ?? "", scope) + sessionId;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const retained = useRef<Array<{ noteId: string; contentRevisionKey: string }>>([]);
  const current = useRef<{ contentRevisionKey: string; value: string } | null>(null);
  const readyRef = useRef(!enabled);
  const mounted = useRef(true);
  const loading = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    mounted.current = true;
    let active = true;
    readyRef.current = !enabled;
    setReady(!enabled);
    if (!enabled || !accountId) return;
    loading.current = (async () => {
      try {
        const drafts = await listPrivateNoteDrafts(accountId, scope);
        if (!active) return;
        // Validate in a temporary document before touching the visible one.
        const candidate = new Y.Doc();
        try {
          for (const draft of drafts) Y.applyUpdate(candidate, decode(draft.value));
          const merged = Y.encodeStateAsUpdate(candidate);
          if (merged.length > 8 * 1024 * 1024) throw new Error("Retained live changes exceed the synchronization limit");
          Y.applyUpdate(document, merged);
          retained.current = drafts;
        } finally { candidate.destroy(); }
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : "Browser recovery is unavailable");
      } finally { if (active) { readyRef.current = true; setReady(true); } }
    })();
    return () => { active = false; mounted.current = false; };
  }, [accountId, document, enabled, scope]);
  const persist = useCallback(async () => {
    await loading.current;
    if (!enabled || !accountId || !readyRef.current) return !enabled;
    const bytes = Y.encodeStateAsUpdate(document);
    if (bytes.length > 8 * 1024 * 1024) return false;
    const value = encode(bytes);
    const operation = queue.current.then(async () => {
      try {
        const contentRevisionKey = await privateNoteRevisionKey(value);
        const success = await writePrivateNoteDraft({ noteId: key, value, contentRevisionKey, baseRevisionKey: "yjs-v1", updatedAt: new Date().toISOString() });
        if (success) current.current = { contentRevisionKey, value };
        if (mounted.current) setError(success ? "" : "Live changes could not be saved in this browser. Download a copy before closing.");
        return success;
      } catch { if (mounted.current) setError("Live changes could not be saved in this browser. Download a copy before closing."); return false; }
    });
    queue.current = operation;
    return operation;
  }, [accountId, document, enabled, key]);
  useEffect(() => {
    if (!enabled || !ready) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const change = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { void persist(); }, 150); };
    document.on("update", change);
    return () => { if (timer) clearTimeout(timer); document.off("update", change); };
  }, [document, enabled, persist, ready]);
  useEffect(() => {
    if (!enabled || !stored || !ready) return;
    const drafts = [...retained.current];
    if (current.current?.value === encode(Y.encodeStateAsUpdate(document))) drafts.push({ noteId: key, contentRevisionKey: current.current.contentRevisionKey });
    const operation = queue.current.then(async () => {
      for (const draft of drafts) await deletePrivateNoteDraftIfContentRevision(draft.noteId, draft.contentRevisionKey);
      retained.current = []; current.current = null;
    }).catch(() => { /* Retaining a saved recovery copy is safe. */ });
    queue.current = operation;
  }, [document, enabled, key, ready, stored]);
  return { ready, persist, error };
}
