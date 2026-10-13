import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "../model/user";
import * as Api from "../util/fetch";

export default function Capture({ loggedInUser, onUserUpdate }: { loggedInUser?: User | null; onUserUpdate?: (user: User | null) => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState("");
  const byteLength = useMemo(() => new TextEncoder().encode(text).length, [text]);
  const captureId = useRef("");
  const loaded = useRef(false);
  useEffect(() => {
    if (!router.isReady || loaded.current) return;
    loaded.current = true; captureId.current = crypto.randomUUID();
    const value = (name: string) => typeof router.query[name] === "string" ? router.query[name] as string : "";
    const incomingTitle = value("title"), incomingText = [value("text"), value("url")].filter(Boolean).join("\n\n");
    setTitle(incomingTitle.slice(0, 200)); setText(incomingText);
    if (incomingTitle.length > 200) setError("The shared title was shortened to 200 characters. Review it before saving.");
    // Remove shared text from this tab's current history entry after loading it.
    if (incomingTitle || incomingText) void router.replace("/capture/", undefined, { shallow: true });
  }, [router.isReady, router.query, router]);
  useEffect(() => {
    if ((!title.trim() && !text.trim()) || savedId) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [title, text, savedId]);
  const save = async () => {
    if (!loggedInUser || busy || savedId || byteLength > 1024 * 1024) return;
    setBusy(true); setError("");
    try {
      const note = await Api.saveCapture(captureId.current, title.trim() || "Quick capture", text);
      setSavedId(note._id);
    } catch (error) { if (Api.isUnauthorizedError(error)) onUserUpdate?.(null); setError(error instanceof Error ? error.message : "Capture could not be saved. Your text is still here."); }
    finally { setBusy(false); }
  };
  return <main className="capture-page">
    <Head><title>Quick capture | ThyncSpace</title><meta name="referrer" content="no-referrer" /></Head>
    <header><h1>Quick capture</h1><Link href="/notes/?notebook=Inbox">Open Inbox</Link></header>
    <p>Review the text, then save a private note to Inbox. You can file it into a notebook later using Organize and recover.</p>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <label>Capture title<input maxLength={200} value={title} disabled={busy || Boolean(savedId)} onChange={event => setTitle(event.target.value)} placeholder="Quick capture" /></label>
      <label>Captured text<textarea rows={14} value={text} disabled={busy || Boolean(savedId)} onChange={event => setText(event.target.value)} /></label>
      <p>{byteLength.toLocaleString()} / 1,048,576 bytes{byteLength > 1024 * 1024 ? " · Shorten the capture before saving." : ""}</p>
      {loggedInUser ? <><p>Saving privately as <strong>{loggedInUser.username}</strong>.</p><button type="submit" className="btn-primary" disabled={busy || Boolean(savedId) || byteLength > 1024 * 1024 || (!title.trim() && !text.trim())}>Save to Inbox</button><button type="button" className="btn-ghost" disabled={busy} onClick={async () => { try { onUserUpdate?.(await Api.getLoginUser()); setError(""); } catch (error) { if (Api.isUnauthorizedError(error)) onUserUpdate?.(null); setError(error instanceof Error ? error.message : "Could not refresh sign-in."); } }}>Refresh sign-in</button></> : <>
        <p>Sign in in another tab, return here, then check sign-in. This draft stays in this tab until you save it.</p>
        <Link className="btn-ghost" href="/login/" target="_blank" rel="noopener noreferrer">Sign in in a new tab</Link>
        <button type="button" className="btn-ghost" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { onUserUpdate?.(await Api.getLoginUser()); } catch (error) { setError(error instanceof Error ? error.message : "Sign-in could not be verified."); } finally { setBusy(false); } }}>Check sign-in</button>
      </>}
    </form>
    {savedId && <p role="status">Saved privately to Inbox. <Link href={`/notes/?noteId=${encodeURIComponent(savedId)}`}>Open captured note</Link> <button type="button" className="btn-ghost" onClick={() => { setSavedId(""); setTitle(""); setText(""); captureId.current = crypto.randomUUID(); }}>New capture</button></p>}
    {busy && <p role="status">Working…</p>}{error && <p role="alert">{error}</p>}
  </main>;
}
