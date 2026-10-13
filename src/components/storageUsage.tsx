import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchStorageUsage, type StorageUsage } from "../util/fetch";

const bytes = (value: number) => value < 1024 ? `${value} B` : value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KiB` : `${(value / 1024 / 1024).toFixed(1)} MiB`;
export default function StorageUsagePanel() {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    fetchStorageUsage().then(result => { if (active) setUsage(result); }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Could not load storage usage."); });
    return () => { active = false; };
  }, [attempt]);
  return <section className="settings-section" aria-labelledby="storage-heading">
    <h2 id="storage-heading">Account storage</h2>
    <p>Owned note content, inline board images, saved history, and collaboration snapshots. Database indexes and record metadata are not included.</p>
    {error ? <p role="alert">{error} <button className="btn-ghost" onClick={() => setAttempt(value => value + 1)}>Try again</button></p> : !usage ? <p role="status">Loading storage…</p> : <>
      <p><strong>{bytes(usage.totals.totalBytes)}</strong> across {usage.totals.notes} notes · {bytes(usage.totals.trashBytes)} in trash</p>
      <dl className="storage-breakdown"><dt>Current content</dt><dd>{bytes(usage.totals.contentBytes)}</dd><dt>Version history</dt><dd>{bytes(usage.totals.historyBytes)}</dd><dt>Collaboration snapshots</dt><dd>{bytes(usage.totals.collaborationBytes)}</dd></dl>
      <p>Each note can store up to {bytes(usage.noteLimitBytes)} of content. Export a copy before removing content you may need later. Trashed notes continue to use storage until explicitly deleted.</p>
      <Link className="btn-ghost" href="/notes/?library=trash">Review trash for cleanup</Link>
      <h3>Largest notes</h3>
      {usage.largest.length === 0 && <p>No stored notes yet.</p>}
      <ul className="storage-note-list">{usage.largest.map(note => <li key={note._id}><Link href={note.status === "trashed" ? "/notes/?library=trash" : `/notes/?noteId=${encodeURIComponent(note._id)}`}>{note.title}</Link><span>{bytes(note.totalBytes)} · {note.status === "trashed" ? "Trash" : note.type}</span></li>)}</ul>
    </>}
  </section>;
}
