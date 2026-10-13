import type { Note } from "../model/note";
import { buildWikiIndex, normalizeWikiPath, proseOnly, wikiReferences } from "./wikiLinks";

export interface ImportDocument { title: string; content: string; sourcePath: string }
export interface ImportIssue { file: string; detail: string; kind: "duplicate" | "link" | "asset" }
export function reviewVaultImport(imported: ImportDocument[], existing: Note[], selectedPaths: string[]) {
  const candidates = imported.map((note, index) => ({ ...note, _id: `import-${index}`, type: "document" } as Note));
  const resolve = buildWikiIndex([...existing, ...candidates]);
  const paths = new Set(selectedPaths.map(normalizeWikiPath));
  const issues: ImportIssue[] = [];
  const add = (issue: ImportIssue) => { if (issues.length < 500) issues.push(issue); };
  for (const note of candidates) {
    if ([...existing, ...candidates].some(other => other._id !== note._id && other.title.toLowerCase() === note.title.toLowerCase())) add({ file: note.sourcePath!, kind: "duplicate", detail: `Duplicate title: ${note.title}. Import creates a separate note.` });
    const assets = new Set<string>();
    for (const link of wikiReferences(note.content as string)) {
      const matches = resolve(link.target, note);
      if (link.embedded && /\.(?:png|jpe?g|gif|webp|svg|avif|pdf|mp3|mp4|wav)(?:#.*)?$/i.test(link.target)) assets.add(link.target);
      else if (matches.length !== 1) add({ file: note.sourcePath!, kind: "link", detail: `${matches.length ? "Ambiguous" : "Unresolved"} wiki link: ${link.target}` });
    }
    for (const match of proseOnly(note.content as string).matchAll(/!\[[^\]\n]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)/g)) assets.add(match[1] || match[2]);
    for (const asset of assets) {
      if (/^(?:https?:|data:)/i.test(asset)) continue;
      let decoded = asset.split("#")[0]; try { decoded = decodeURIComponent(decoded); } catch { /* Keep invalid escapes visible in the report. */ }
      const direct = normalizeWikiPath(decoded), relative = normalizeWikiPath(note.sourcePath!.split("/").slice(0, -1).concat(decoded).join("/"));
      const present = paths.has(direct) || paths.has(relative);
      add({ file: note.sourcePath!, kind: "asset", detail: `${present ? "Selected asset is not included in Markdown import" : "Missing local asset"}: ${asset}` });
    }
  }
  return issues;
}
