import { useState } from "react";
import type { SearchFilters } from "../util/noteSearch";
import type { SavedSearch } from "../util/fetch";

export default function AdvancedSearch({ filters, onChange, searches, onApply, onSave, onDelete }: {
  filters: SearchFilters; onChange: (value: SearchFilters) => void; searches: SavedSearch[];
  onApply: (search: SavedSearch) => void; onSave: (name: string) => void; onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  return <details className="advanced-note-search"><summary>Advanced search and saved views</summary>
    <label>Note owner<select value={filters.owner} onChange={event => onChange({ ...filters, owner: event.target.value as SearchFilters["owner"] })}><option value="all">Anyone</option><option value="mine">Owned by me</option><option value="shared">Shared with me</option></select></label>
    <label>Note type<select value={filters.type} onChange={event => onChange({ ...filters, type: event.target.value as SearchFilters["type"] })}><option value="all">Any type</option><option value="document">Document</option><option value="whiteboard">Whiteboard</option></select></label>
    <label>Exact tag<input value={filters.tag} maxLength={40} onChange={event => onChange({ ...filters, tag: event.target.value })} /></label>
    <label>Updated from (UTC)<input type="date" value={filters.from} onChange={event => onChange({ ...filters, from: event.target.value })} /></label>
    <label>Updated through (UTC)<input type="date" value={filters.to} min={filters.from || undefined} onChange={event => onChange({ ...filters, to: event.target.value })} /></label>
    <form onSubmit={event => { event.preventDefault(); if (name.trim()) onSave(name.trim()); }}><label>Saved search name<input maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label><button type="submit" className="btn-ghost" disabled={!name.trim() || searches.length >= 20}>Save current search</button></form>
    {searches.map(search => <div key={search.id} className="saved-search-row"><button type="button" onClick={() => onApply(search)}>{search.name}</button><button type="button" aria-label={`Delete saved search ${search.name}`} onClick={() => onDelete(search.id)}>×</button></div>)}
  </details>;
}
