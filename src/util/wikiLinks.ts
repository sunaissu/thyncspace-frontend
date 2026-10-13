import type { Note } from "../model/note";

export interface WikiReference { target: string; label: string; embedded: boolean }
export function proseOnly(source: string) {
  let fence = "", width = 0;
  return source.split("\n").map(line => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) { fence = marker[1][0]; width = marker[1].length; }
      else if (marker[1][0] === fence && marker[1].length >= width && !line.slice(marker[0].length).trim()) fence = "";
      return "";
    }
    return fence ? "" : line.replace(/(`+)[\s\S]*?\1/g, "");
  }).join("\n").replace(/<!--[\s\S]*?-->/g, "");
}
export function wikiReferences(source: string): WikiReference[] {
  const result: WikiReference[] = [];
  const prose = proseOnly(source);
  for (const match of prose.matchAll(/(!?)\[\[([^\]\n]{1,500})\]\]/g)) {
    if (match.index && prose[match.index - 1] === "\\") continue;
    const [target, ...label] = match[2].split("|");
    if (target.trim()) result.push({ target: target.trim(), label: label.join("|").trim() || target.trim(), embedded: Boolean(match[1]) });
    if (result.length >= 2000) break;
  }
  return result;
}
export function normalizeWikiPath(value: string) {
  const parts: string[] = [];
  for (const part of value.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) return ""; parts.pop(); }
    else parts.push(part);
  }
  return parts.join("/").replace(/\.md$/i, "").toLowerCase();
}
export function buildWikiIndex(notes: Note[]) {
  const ids = new Map(notes.map(note => [note._id, note]));
  const names = new Map<string, Note[]>();
  for (const note of notes) {
    for (const name of new Set([normalizeWikiPath(note.title), normalizeWikiPath(note.sourcePath ?? "")].filter(Boolean))) names.set(name, [...(names.get(name) ?? []), note]);
  }
  return (target: string, source?: Pick<Note, "sourcePath" | "_id">): Note[] => {
    const address = target.split("#")[0].trim();
    if (!address && source) return ids.has(source._id) ? [ids.get(source._id)!] : [];
    if (ids.has(address)) return [ids.get(address)!];
    const path = normalizeWikiPath(address);
    if (!path) return [];
    if (source?.sourcePath) {
      const relative = normalizeWikiPath(source.sourcePath.split("/").slice(0, -1).concat(address).join("/"));
      const matches = names.get(relative);
      if (matches?.length) return matches;
    }
    return names.get(path) ?? [];
  };
}
export function wikiMarkup(note: Pick<Note, "_id" | "title">) {
  return `[[${note._id}|${note.title.replace(/[\[\]|\r\n]/g, " ").trim() || "Untitled note"}]]`;
}

export function wikiQueryAt(source: string, offset: number) {
  const prefix = source.slice(0, offset);
  const match = /\[\[([^\[\]\n]{0,100})$/.exec(prefix);
  if (!match || !proseOnly(prefix).endsWith(match[0])) return null;
  const escapes = /\\+$/.exec(prefix.slice(0, match.index))?.[0].length ?? 0;
  return escapes % 2 ? null : { query: match[1], token: match[0], start: offset - match[0].length };
}
