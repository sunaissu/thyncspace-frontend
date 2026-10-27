import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import DocumentationEditor from "./documentationEditor";
import { useDocumentation } from "../hooks/useDocumentation";
import { parseDocumentation, serializeDocumentation } from "../util/documentation";

export default function OfflineDocumentationEditor({ title, value, readOnly, onChange }: { title: string; value: string; readOnly: boolean; onChange: (value: string) => void }) {
  const document = useMemo(() => new Y.Doc(), []);
  const binding = useDocumentation(document);
  const live = useRef(false);
  const seeded = useRef(false);
  const emitted = useRef(value);
  const replacementTarget = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; queueMicrotask(() => { if (!live.current) document.destroy(); }); };
  }, [document]);
  const replace = binding.replace;
  useEffect(() => {
    if (!seeded.current || (value !== emitted.current && value !== binding.value)) {
      const parsed = parseDocumentation(value);
      if (!parsed) { replacementTarget.current = ""; setReady(false); setError("This offline documentation is invalid. Download its original contents before editing."); return; }
      replacementTarget.current = serializeDocumentation(parsed);
      replace(parsed); emitted.current = value; seeded.current = true; setReady(true); setError("");
    }
  }, [value, binding.value, replace]);
  useEffect(() => {
    if (replacementTarget.current !== null) {
      if (binding.value === replacementTarget.current) replacementTarget.current = null;
      return;
    }
    if (ready && !readOnly && !binding.error && binding.value !== emitted.current) {
      emitted.current = binding.value; onChange(binding.value);
    }
  }, [ready, readOnly, binding.value, binding.error, onChange]);
  const exportFile = async (format: "docx" | "pdf") => {
    if (!binding.content || exporting) return;
    const snapshot = structuredClone(binding.content);
    setExporting(true); setError("");
    try {
      const { exportDocumentation } = await import("../util/documentationExport");
      const blob = await exportDocumentation(snapshot, title, format);
      const url = URL.createObjectURL(blob); const link = window.document.createElement("a");
      link.href = url; link.download = `Documentation.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Export failed."); }
    finally { if (live.current) setExporting(false); }
  };
  if (!ready) return <p role={error ? "alert" : "status"}>{error || "Opening documentation…"}</p>;
  return <DocumentationEditor document={document} title={title} readOnly={readOnly} onExport={exportFile} exporting={exporting} exportError={error} />;
}
