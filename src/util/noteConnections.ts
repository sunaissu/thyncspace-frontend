import type { Note } from "../model/note";
import { buildWikiIndex, wikiReferences, type WikiReference } from "./wikiLinks";

type NoteIdentity = Pick<Note, "_id" | "title" | "sourcePath">;
interface CachedLinks {
  content: string;
  references: WikiReference[];
  matches: string[][];
  targets: Set<string>;
}

/** Keep the cache scoped to the open panel and evict notes when access changes. */
export function createNoteConnectionIndex() {
  const cached = new Map<string, CachedLinks>();
  let identities = new Map<string, NoteIdentity>();
  let resolve = buildWikiIndex<NoteIdentity>([]);

  const resolveLinks = (source: Pick<Note, "_id" | "sourcePath">, references: WikiReference[]) => {
    const matches = references.map(link => resolve(link.target, source).map(match => match._id));
    const targets = new Set(matches.filter(ids => ids.length === 1).map(ids => ids[0]));
    return { matches, targets };
  };

  return (notes: Note[], note: Note) => {
    const byId = new Map(notes.map(source => [source._id, source]));
    const changedNames = byId.size !== identities.size || notes.some(source => {
      const prior = identities.get(source._id);
      return !prior || prior.title !== source.title || prior.sourcePath !== source.sourcePath;
    });
    if (changedNames) {
      identities = new Map(notes.map(({ _id, title, sourcePath }) => [_id, { _id, title, sourcePath }]));
      resolve = buildWikiIndex([...identities.values()]);
    }
    for (const id of cached.keys()) if (byId.get(id)?.type !== "document") cached.delete(id);
    for (const source of notes) {
      if (source.type !== "document") continue;
      const prior = cached.get(source._id);
      if (!prior || prior.content !== source.content) {
        const references = wikiReferences(source.content);
        cached.set(source._id, { content: source.content, references, ...resolveLinks(source, references) });
      } else if (changedNames) {
        cached.set(source._id, { ...prior, ...resolveLinks(source, prior.references) });
      }
    }
    let active = cached.get(note._id);
    if (note.type === "document" && (!active || active.content !== note.content || note.sourcePath !== byId.get(note._id)?.sourcePath)) {
      const references = wikiReferences(note.content);
      active = { content: note.content, references, ...resolveLinks(note, references) };
    }
    const outgoing = note.type === "document" && active ? active.references.map((link, index) => ({
      ...link,
      matches: active!.matches[index].map(id => byId.get(id)).filter((match): match is Note => Boolean(match)),
    })) : [];
    const backlinks = notes.filter(source => source._id !== note._id && cached.get(source._id)?.targets.has(note._id));
    const connected = new Map([
      ...outgoing.filter(link => link.matches.length === 1).map(link => link.matches[0]),
      ...backlinks,
    ].filter(peer => peer._id !== note._id).map(peer => [peer._id, peer]));
    return { outgoing, backlinks, neighbors: [...connected.values()] };
  };
}
