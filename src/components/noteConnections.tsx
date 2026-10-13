import { useMemo } from "react";
import type { Note } from "../model/note";
import { buildWikiIndex, wikiReferences } from "../util/wikiLinks";

export default function NoteConnections({ notes, note, onOpen, onClose }: { notes: Note[]; note: Note; onOpen: (id: string) => void; onClose: () => void }) {
  const { outgoing, backlinks, neighbors } = useMemo(() => {
    const resolve = buildWikiIndex(notes);
    const outgoing = note.type === "document" ? wikiReferences(note.content).map(link => ({ ...link, matches: resolve(link.target, note) })) : [];
    const backlinks = notes.filter(source => source._id !== note._id && source.type === "document" && wikiReferences(source.content).some(link => { const matches = resolve(link.target, source); return matches.length === 1 && matches[0]._id === note._id; }));
    const connected = new Map([...outgoing.filter(link => link.matches.length === 1).map(link => link.matches[0]), ...backlinks].filter(peer => peer._id !== note._id).map(peer => [peer._id, peer]));
    return { outgoing, backlinks, neighbors: [...connected.values()] };
  }, [notes, note]);
  const visible = neighbors.slice(0, 24);
  const points = visible.map((peer, index) => ({ peer, x: 250 + Math.cos(index * Math.PI * 2 / Math.max(1, visible.length)) * 180, y: 130 + Math.sin(index * Math.PI * 2 / Math.max(1, visible.length)) * 100 }));
  return <section className="note-connections" aria-label="Note connections">
    <header><h2>Connections · {note.title}</h2><button type="button" className="btn-ghost" onClick={onClose}>Close connections</button></header>
    <p>Only notes you can access appear here. New suggestions use stable note IDs so renaming a note keeps its links working.</p>
    <div className="connections-columns">
      <section><h3>Outgoing links</h3>{!outgoing.length && <p>No wiki links yet. Type [[ in a document to choose a note.</p>}
        <ul>{outgoing.slice(0, 100).map((link, index) => <li key={index}>{link.matches.length === 1 ? <button type="button" onClick={() => onOpen(link.matches[0]._id)}>{link.label}</button> : <><span>{link.label} · {link.matches.length ? "Ambiguous name" : "Unavailable or unresolved"}</span>{link.matches.map(match => <button type="button" key={match._id} onClick={() => onOpen(match._id)}>{match.title} · {match.sourcePath || match._id.slice(-6)}</button>)}</>}</li>)}</ul>
        {outgoing.length > 100 && <p>Showing the first 100 links.</p>}
      </section>
      <section><h3>Backlinks</h3>{!backlinks.length && <p>No accessible notes link here yet.</p>}<ul>{backlinks.map(source => <li key={source._id}><button type="button" onClick={() => onOpen(source._id)}>{source.title}</button></li>)}</ul></section>
      <section><h3>Local graph</h3><svg viewBox="0 0 500 260" role="img" aria-label={`Graph of ${note.title} and ${visible.length} connected notes`}>
        {points.map(({ peer, x, y }) => <line key={peer._id} x1="250" y1="130" x2={x} y2={y} stroke="var(--color-border-strong)" />)}
        <circle cx="250" cy="130" r="8" fill="var(--color-accent)" />
        {points.map(({ peer, x, y }, index) => <g key={peer._id}><circle cx={x} cy={y} r="6" fill="var(--color-text-muted)" /><text x={x + 9} y={y + 4} fill="var(--color-text)" fontSize="12">{index + 1}</text></g>)}
      </svg><ol>{visible.map(peer => <li key={peer._id}><button type="button" onClick={() => onOpen(peer._id)}>{peer.title}</button></li>)}</ol>{neighbors.length > 24 && <p>Showing 24 of {neighbors.length} connected notes. All links remain in the lists.</p>}</section>
    </div>
  </section>;
}
