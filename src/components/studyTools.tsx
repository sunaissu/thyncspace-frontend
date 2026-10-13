import { useEffect, useRef, useState } from "react";
import type { Note } from "../model/note";
import { createStudyDrafts, deleteStudyCard, listStudyCards, writeStudyCard, type StudyCard } from "../util/studyCards";

const download = (cards: StudyCard[]) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ format: "thyncspace-study", version: 1, cards }, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "thyncspace-study-cards.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
};
export default function StudyTools({ owner, notes, initialNoteId, onOpenNote, onClose }: { owner: string; notes: Note[]; initialNoteId?: string; onOpenNote: (id: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), loadGeneration = useRef<symbol | null>(null);
  const documents = notes.filter(note => note.type === "document");
  const [sourceId, setSourceId] = useState(initialNoteId ?? documents[0]?._id ?? ""), [excerpt, setExcerpt] = useState("");
  const [cards, setCards] = useState<StudyCard[]>([]), [drafts, setDrafts] = useState<StudyCard[]>([]), [editing, setEditing] = useState<StudyCard | null>(null);
  const [error, setError] = useState(""), [status, setStatus] = useState(""), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const [practice, setPractice] = useState(false), [questionMode, setQuestionMode] = useState(false), [index, setIndex] = useState(0), [revealed, setRevealed] = useState(false), [answer, setAnswer] = useState(""), [round, setRound] = useState({ reviewed: 0, known: 0 });
  const source = documents.find(note => note._id === sourceId), deck = cards.filter(card => !sourceId || card.noteId === sourceId), current = deck[index % Math.max(1, deck.length)];
  const reload = async () => {
    const generation = Symbol(); loadGeneration.current = generation;
    try { const value = await listStudyCards(owner); if (generation === loadGeneration.current) { setCards(value); setLoaded(true); setError(""); } }
    catch (error) { if (generation === loadGeneration.current) setError(error instanceof Error ? error.message : "Could not load study cards."); }
  };
  useEffect(() => {
    const node = dialog.current; node?.showModal();
    let active = true; const generation = Symbol(); loadGeneration.current = generation;
    listStudyCards(owner).then(value => { if (active && generation === loadGeneration.current) { setCards(value); setLoaded(true); } }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Could not load study cards."); });
    return () => { active = false; loadGeneration.current = null; node?.close(); };
  }, [owner]);
  useEffect(() => {
    if (!drafts.length && !editing) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [drafts.length, editing]);
  const close = () => { if (busy) return; if ((drafts.length || editing) && !window.confirm("Leave unsaved study cards? Download them first if you want to keep a copy.")) return; onClose(); };
  const blank = (question: string, answer: string, quote: string): StudyCard => ({ id: crypto.randomUUID(), owner, revision: 0, noteId: source!._id, noteTitle: source!.title, sourceUpdatedAt: source!.updatedAt, question, answer, source: quote, reviewed: 0, known: 0, updatedAt: new Date().toISOString() });
  const generate = () => {
    if (!source) return;
    setError(""); setStatus("");
    const selected = excerpt.trim();
    if (!selected || !(source.content ?? "").replace(/\r\n/g, "\n").includes(selected.replace(/\r\n/g, "\n"))) { setError("Choose an excerpt that appears in the selected document."); return; }
    try {
      const generated = createStudyDrafts(selected);
      if (!generated.length) { setError("No Q:/A: pairs, Term: definition lines, or headings with paragraphs were found. Write a card manually below."); return; }
      if (drafts.length && !window.confirm("Replace the unsaved draft cards?")) return;
      setDrafts(generated.map(card => blank(card.question, card.answer, card.source)));
      setStatus("Review and edit each draft before saving. The answers quote your selected source.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not create drafts."); }
  };
  const save = async (card: StudyCard, expected: number | null) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const saved = await writeStudyCard(card, expected);
      setCards(value => [saved, ...value.filter(item => item.id !== card.id)]); setLoaded(true);
      setDrafts(value => value.filter(item => item.id !== card.id)); if (editing?.id === card.id) setEditing(null);
      setStatus("Card saved privately in this browser.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save the card. Your edits are still here."); }
    finally { setBusy(false); }
  };
  const rate = async (known: boolean) => {
    if (!current || busy) return;
    setBusy(true); setError("");
    try {
      const saved = await writeStudyCard({ ...current, reviewed: current.reviewed + 1, known: current.known + (known ? 1 : 0) }, current.revision);
      setCards(value => value.map(card => card.id === saved.id ? saved : card)); setRound(value => ({ reviewed: value.reviewed + 1, known: value.known + (known ? 1 : 0) }));
      setIndex(value => value + 1); setRevealed(false); setAnswer("");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save this review."); }
    finally { setBusy(false); }
  };
  const fields = (card: StudyCard, update: (card: StudyCard) => void, expected: number | null) => <article className="study-card" key={card.id}>
    <label>Question<textarea maxLength={500} value={card.question} disabled={busy} onChange={event => update({ ...card, question: event.target.value })} /></label>
    <label>Answer<textarea maxLength={4000} rows={4} value={card.answer} disabled={busy} onChange={event => update({ ...card, answer: event.target.value })} /></label>
    <details><summary>Source excerpt · {card.noteTitle}</summary><blockquote>{card.source}</blockquote></details>
    <div className="study-actions"><button type="button" className="btn-primary" disabled={busy || !card.question.trim() || !card.answer.trim()} onClick={() => void save(card, expected)}>Save card</button>
      <button type="button" className="btn-ghost" disabled={busy} onClick={() => expected === null ? setDrafts(value => value.filter(item => item.id !== card.id)) : setEditing(null)}>Discard edits</button>
      {expected !== null && <button type="button" className="btn-ghost" disabled={busy} onClick={() => { const copy = { ...card, id: crypto.randomUUID(), revision: 0 }; setDrafts(value => [...value, copy]); setEditing(null); }}>Keep edits as a new draft</button>}
    </div>
  </article>;
  return <dialog ref={dialog} className="study-dialog" aria-labelledby="study-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><h2 id="study-title">Study tools</h2><p>Private to this account on this browser.</p></div><button type="button" className="btn-ghost" aria-label="Close study tools" disabled={busy} onClick={close}>Close</button></header>
    <p>Review generated drafts before saving. Cards stay in this browser; downloads include copied source text. You can keep up to 200 cards.</p>
    <div className="study-actions"><label>Study document<select value={sourceId} disabled={busy} onChange={event => { setSourceId(event.target.value); setExcerpt(""); setIndex(0); setPractice(false); setRevealed(false); setAnswer(""); }}><option value="">All saved cards</option>{documents.map(note => <option key={note._id} value={note._id}>{note.title}</option>)}</select></label>
      <button type="button" className="btn-ghost" disabled={busy} onClick={() => void reload()}>Reload deck</button><button type="button" className="btn-ghost" disabled={!cards.length && !drafts.length && !editing} onClick={() => download([...cards.filter(card => card.id !== editing?.id), ...drafts, ...(editing ? [editing] : [])])}>Download cards and drafts</button></div>
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
    {source && !practice && <details className="study-create" open={cards.length === 0}><summary>Create cards from {source.title}</summary>
      <p>Use Q: and A: on consecutive lines, Term: definition lines, or a heading followed by a paragraph. Paste an excerpt from this document, or load its first 20,000 characters.</p>
      <button type="button" className="btn-ghost" onClick={() => setExcerpt((source.content ?? "").slice(0, 20000))}>Load note excerpt</button>
      <label>Source excerpt<textarea rows={6} maxLength={20000} value={excerpt} onChange={event => setExcerpt(event.target.value)} /></label><small>{excerpt.length.toLocaleString()} / 20,000 characters</small>
      <div className="study-actions"><button type="button" className="btn-primary" disabled={busy || !excerpt.trim()} onClick={generate}>Create draft cards</button><button type="button" className="btn-ghost" disabled={busy || drafts.length >= 20} onClick={() => setDrafts(value => [...value, blank("", "", excerpt.slice(0, 8000))])}>Write a card manually</button></div>
    </details>}
    {!practice && <>{drafts.map(card => fields(card, updated => setDrafts(value => value.map(item => item.id === updated.id ? updated : item)), null))}{editing && fields(editing, setEditing, editing.revision)}</>}
    <section><h3>Saved cards ({deck.length})</h3><div className="study-actions"><button type="button" className="btn-primary" disabled={!deck.length || busy || Boolean(editing) || Boolean(drafts.length)} onClick={() => { setPractice(value => !value); setIndex(0); setRevealed(false); setAnswer(""); setRound({ reviewed: 0, known: 0 }); }}>{practice ? "Return to deck" : "Start practice"}</button><label><input type="checkbox" checked={questionMode} onChange={event => { setQuestionMode(event.target.checked); setAnswer(""); }} /> Write answers before revealing</label></div>
      {!loaded && !error && <p role="status">Loading saved cards…</p>}
      {practice && current ? <article className="study-practice"><p>Card {index % deck.length + 1} of {deck.length} · Reviewed this round: {round.reviewed}, known: {round.known}</p><h3>{current.question}</h3>
        <p>Source: {current.noteTitle}{notes.find(note => note._id === current.noteId)?.updatedAt !== current.sourceUpdatedAt ? " · Review the source; it changed or is unavailable" : ""}</p>
        <button type="button" className="btn-ghost" disabled={!notes.some(note => note._id === current.noteId) || busy} onClick={() => { onClose(); onOpenNote(current.noteId); }}>Open source note</button>
        {questionMode && <label>Your answer<textarea rows={4} maxLength={4000} value={answer} onChange={event => setAnswer(event.target.value)} /></label>}
        {!revealed ? <button type="button" className="btn-primary" onClick={() => setRevealed(true)}>Reveal answer</button> : <><p className="study-answer">{current.answer}</p><div className="study-actions"><button type="button" className="btn-ghost" disabled={busy} onClick={() => void rate(false)}>Review again</button><button type="button" className="btn-primary" disabled={busy} onClick={() => void rate(true)}>I knew this</button></div></>}
      </article> : deck.map(card => {
        const accessible = notes.find(note => note._id === card.noteId), changed = accessible && accessible.updatedAt !== card.sourceUpdatedAt;
        return <details className="study-card" key={card.id}><summary>{card.question}</summary><p className="study-answer">{card.answer}</p><p>Source: {card.noteTitle}{!accessible ? " · Currently unavailable" : changed ? " · Source changed; review this card" : ""} · Reviewed {card.reviewed} times</p><blockquote>{card.source}</blockquote><div className="study-actions">
          <button type="button" className="btn-ghost" disabled={!accessible || busy} onClick={() => { if ((drafts.length || editing) && !window.confirm("Open the source and leave unsaved cards? Download them first to keep a copy.")) return; onClose(); onOpenNote(card.noteId); }}>Open source note</button>
          <button type="button" className="btn-ghost" disabled={busy || Boolean(editing)} onClick={() => setEditing({ ...card })}>Edit card</button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={async () => { if (!window.confirm("Delete this saved card from this browser?")) return; setBusy(true); try { await deleteStudyCard(owner, card.id, card.revision); setCards(value => value.filter(item => item.id !== card.id)); } catch (error) { setError(error instanceof Error ? error.message : "Could not delete card."); } finally { setBusy(false); } }}>Delete card</button>
        </div></details>;
      })}
      {loaded && !deck.length && <p>No saved cards for this selection.</p>}
    </section>
  </dialog>;
}
