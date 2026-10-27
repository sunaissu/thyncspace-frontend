import { useCallback, useEffect, useRef, useState } from "react";
import type * as Y from "yjs";
import { collaborationSnapshot } from "../util/collaborationSnapshot";

/** A receipt acknowledges the materialized state, including deletions. */
export function useDurableStore(document: Y.Doc, type: string) {
  const [durability, setDurability] = useState<"pending" | "stored" | "error">("pending");
  const fingerprint = useRef("");
  const received = useRef("");
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      const current = ++generation.current;
      fingerprint.current = "";
      setDurability("pending");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        let bytes: Uint8Array<ArrayBuffer>;
        try { bytes = new TextEncoder().encode(collaborationSnapshot(document, type)); }
        catch { if (active && current === generation.current) setDurability("error"); return; }
        void globalThis.crypto.subtle.digest("SHA-256", bytes).then(hash => {
          if (!active || current !== generation.current) return;
          fingerprint.current = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
          if (fingerprint.current === received.current) setDurability("stored");
        }).catch(() => { if (active) setDurability("error"); });
      }, 120);
    };
    refresh();
    document.on("update", refresh);
    return () => { active = false; if (timer) clearTimeout(timer); document.off("update", refresh); };
  }, [document, type]);
  const receiveReceipt = useCallback(({ payload }: { payload: string }) => {
    if (payload.length > 256) return;
    try {
      const receipt = JSON.parse(payload);
      if (receipt?.version !== 1) return;
      if (receipt.type === "store-error") { received.current = ""; setDurability("error"); }
      if (receipt.type === "stored" && typeof receipt.fingerprint === "string" && /^[a-f0-9]{64}$/.test(receipt.fingerprint)) {
        received.current = receipt.fingerprint;
        setDurability(fingerprint.current === receipt.fingerprint ? "stored" : "pending");
      }
    } catch { /* Unrelated or malformed stateless messages cannot acknowledge a save. */ }
  }, []);
  return { durability, receiveReceipt };
}
