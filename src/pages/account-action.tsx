import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as Api from "../util/fetch";

export default function AccountAction() {
  const [action, setAction] = useState<{ purpose: "reset" | "verify"; token: string } | null>(null);
  const [password, setPassword] = useState(""), [repeat, setRepeat] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("");
  const loaded = useRef(false), generation = useRef(0);
  useEffect(() => {
    const readLink = () => {
    if (!window.location.hash && loaded.current) return;
    loaded.current = true; generation.current++;
    setPassword(""); setRepeat(""); setStatus(""); setError(""); setBusy(false); setAction(null);
    const params = new URLSearchParams(window.location.hash.slice(1)), purpose = params.get("purpose"), token = params.get("token");
    window.history.replaceState(window.history.state, "", window.location.pathname);
    if ((purpose === "reset" || purpose === "verify") && token && /^[a-f0-9]{64}$/.test(token)) setAction({ purpose, token });
    else setError("This link is missing or invalid. Open the link from your email or request a new one.");
    };
    readLink(); window.addEventListener("hashchange", readLink);
    return () => window.removeEventListener("hashchange", readLink);
  }, []);
  const confirm = async () => {
    if (!action || busy || status) return;
    if (action.purpose === "reset" && password !== repeat) { setError("The passwords do not match."); return; }
    const epoch = generation.current;
    setBusy(true); setError("");
    try { const message = await Api.confirmAccountAction(action.purpose, action.token, password); if (epoch === generation.current) { setStatus(message); setPassword(""); setRepeat(""); setAction(null); } }
    catch (error) { if (epoch === generation.current) setError(error instanceof Error ? error.message : "The link could not be confirmed."); }
    finally { if (epoch === generation.current) setBusy(false); }
  };
  return <main className="account-action-page"><Head><title>Confirm account action | ThyncSpace</title><meta name="referrer" content="no-referrer" /></Head>
    <h1>{action?.purpose === "verify" ? "Verify your email" : "Account recovery"}</h1>
    {action && <form onSubmit={event => { event.preventDefault(); void confirm(); }}>
      {action.purpose === "reset" ? <><p>Choose a password of at least 12 characters. All existing sessions will be signed out.</p>
        <label>New password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
        <label>Repeat new password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={repeat} disabled={busy} onChange={event => setRepeat(event.target.value)} /></label>
      </> : <p>Confirm that you control the email address that received this link. Opening the link alone makes no change.</p>}
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Confirming…" : action.purpose === "reset" ? "Set new password" : "Verify email"}</button>
    </form>}
    {status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
    <a href="/login/">Sign in</a><Link href="/recover/">Request a new recovery link</Link>
  </main>;
}
