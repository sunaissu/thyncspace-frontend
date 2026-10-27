import { useCallback, useEffect, useState } from "react";

export interface EditorPreferences {
  mode: "visual" | "markdown" | "split" | "preview";
  fontSize: number;
  lineWidth: "full" | "reading";
  noteType: "document" | "whiteboard" | "documentation";
}
const defaults: EditorPreferences = { mode: "visual", fontSize: 16, lineWidth: "full", noteType: "document" };
export function normalizeEditorPreferences(value: unknown): EditorPreferences {
  const input = value && typeof value === "object" ? value as Partial<EditorPreferences> : {};
  return {
    mode: ["visual", "markdown", "split", "preview"].includes(input.mode ?? "") ? input.mode! : defaults.mode,
    fontSize: Number.isInteger(input.fontSize) && input.fontSize! >= 12 && input.fontSize! <= 28 ? input.fontSize! : defaults.fontSize,
    lineWidth: input.lineWidth === "reading" ? "reading" : "full",
    noteType: input.noteType === "whiteboard" || input.noteType === "documentation" ? input.noteType : "document",
  };
}
export function useEditorPreferences(userId?: string) {
  const key = `thyncspace:editor-preferences:${userId ?? "guest"}:v1`;
  const [preferences, setPreferences] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const load = () => {
      try { setPreferences(normalizeEditorPreferences(JSON.parse(localStorage.getItem(key) ?? "null"))); }
      catch { setPreferences(defaults); }
      setReady(true);
    };
    load();
    const onStorage = (event: StorageEvent) => { if (event.key === key || event.key === null) load(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);
  const update = useCallback((changes: Partial<EditorPreferences>) => {
    const next = normalizeEditorPreferences({ ...preferences, ...changes });
    setPreferences(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setError(""); }
    catch { setError("Preferences apply now, but this browser could not save them for next time."); }
  }, [key, preferences]);
  return { preferences, update, ready, error };
}
