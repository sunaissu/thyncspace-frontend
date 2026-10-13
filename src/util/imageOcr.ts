import type { Worker } from "tesseract.js";

let activeJob: symbol | null = null;
export async function recognizeImage(blob: Blob, signal: AbortSignal, progress: (value: string) => void): Promise<string> {
  if (activeJob) throw new Error("Another image is being processed. Wait for it to finish before trying again.");
  if (signal.aborted) throw new Error("Text recognition cancelled.");
  const job = Symbol(); activeJob = job;
  let worker: Worker | undefined, cancelled = false;
  let rejectCancellation: (error: Error) => void = () => {};
  const cancellation = new Promise<never>((_, reject) => { rejectCancellation = reject; });
  const cancel = () => { cancelled = true; void worker?.terminate(); if (worker && activeJob === job) activeJob = null; rejectCancellation(new Error(signal.aborted ? "Text recognition cancelled." : "Text recognition timed out. Try a smaller image.")); };
  signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 90000);
  const work = (async () => {
    try {
      const engine = await import("tesseract.js");
      if (cancelled) throw new Error("Cancelled");
      worker = await engine.createWorker("eng", engine.OEM.LSTM_ONLY, { workerPath: "/ocr/worker.min.js", corePath: "/ocr", langPath: "/ocr", workerBlobURL: false, cacheMethod: "none", logger: value => { if (!cancelled) progress(`${value.status} · ${Math.round(value.progress * 100)}%`); }, errorHandler: () => {} });
      if (cancelled) throw new Error("Cancelled");
      const result = await worker.recognize(blob);
      return result.data.text.slice(0, 50000);
    } finally { await worker?.terminate(); if (activeJob === job) activeJob = null; }
  })();
  try { return await Promise.race([work, cancellation]); }
  finally { clearTimeout(timer); signal.removeEventListener("abort", cancel); }
}
