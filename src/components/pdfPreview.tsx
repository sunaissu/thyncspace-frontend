import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

export default function PdfPreview({ blob }: { blob: Blob }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null), [page, setPage] = useState(1), [error, setError] = useState("");
  useEffect(() => {
    let active = true, task: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    void (async () => {
      try {
        const pdf = await import("pdfjs-dist");
        if (!active) return;
        pdf.GlobalWorkerOptions.workerSrc = `/pdf-worker-${pdf.version}.mjs`;
        const data = new Uint8Array(await blob.arrayBuffer());
        if (!active) return;
        task = pdf.getDocument({ data, useWasm: false, enableXfa: false, useSystemFonts: true, stopAtErrors: true, maxImageSize: 12_000_000, canvasMaxAreaInBytes: 16_000_000 });
        const value = await task.promise;
        if (active) { setDocument(value); setPage(1); }
      } catch { if (active) setError("This PDF could not be previewed. You can still download it."); }
    })();
    return () => { active = false; void task?.destroy(); };
  }, [blob]);
  useEffect(() => {
    if (!document) return;
    let active = true, render: RenderTask | undefined;
    void (async () => {
      try {
        const value = await document.getPage(page);
        if (!active || !canvas.current) return;
        const initial = value.getViewport({ scale: 1 });
        const viewport = value.getViewport({ scale: Math.min(1.5, 1000 / initial.width, 1400 / initial.height) });
        const node = canvas.current; node.width = Math.ceil(viewport.width); node.height = Math.ceil(viewport.height);
        render = value.render({ canvas: node, viewport }); await render.promise;
      } catch { if (active) setError("This page could not be previewed. Download the file to view it elsewhere."); }
    })();
    return () => { active = false; render?.cancel(); };
  }, [document, page]);
  return <div className="attachment-pdf">
    {error && <p role="alert">{error}</p>}
    {!document && !error && <p role="status">Preparing PDF preview…</p>}
    {document && <div className="attachment-actions"><button type="button" className="btn-ghost" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous page</button><span>Page {page} of {document.numPages}</span><button type="button" className="btn-ghost" disabled={page >= document.numPages} onClick={() => setPage(value => value + 1)}>Next page</button></div>}
    <canvas ref={canvas} aria-label={`PDF page ${page}`} role="img" />
    <small>Visual preview only. Download the PDF for selectable text and accessibility tools.</small>
  </div>;
}
