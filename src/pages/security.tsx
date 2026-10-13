import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import AppLayout from "../components/appLayout";
import * as Api from "../util/fetch";

export default function Security() {
  const [security, setSecurity] = useState<Api.AccountSecurity | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("");
  const [current, setCurrent] = useState(""), [password, setPassword] = useState(""), [repeat, setRepeat] = useState(""), [refresh, setRefresh] = useState(0);
  useEffect(() => { let active = true; Api.fetchAccountSecurity().then(value => { if (active) { setSecurity(value); setError(""); } }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Could not load account security."); }); return () => { active = false; }; }, [refresh]);
  return <AppLayout><Head><title>Account security | ThyncSpace</title></Head><div className="settings-page">
    <header className="settings-header"><h1>Account security</h1><Link href="/settings/">Back to settings</Link></header>
    <section className="settings-section"><h2>Email verification</h2>
      {!security && !error && <p role="status">Loading account security…</p>}
      {security && <><p>{security.verified ? "Your email is verified." : "Your email has not been verified yet."}</p>
        {!security.emailDeliveryAvailable && <p>The service operator has not configured email delivery. Password changes still work; email verification and recovery require delivery configuration.</p>}
        {!security.verified && <button type="button" className="btn-primary" disabled={busy || !security.emailDeliveryAvailable} onClick={async () => { setBusy(true); setError(""); try { setStatus(await Api.requestEmailVerification()); } catch (error) { setError(error instanceof Error ? error.message : "Verification request failed."); } finally { setBusy(false); } }}>Send verification link</button>}
      </>}
      <button type="button" className="btn-ghost" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh verification status</button>
    </section>
    {security?.provider === "local" && <section className="settings-section"><h2>Change password</h2><p>Use at least 12 characters. All sessions, including this one, will be signed out after the change.</p>
      <form className="settings-profile-form" onSubmit={async event => { event.preventDefault(); if (busy) return; if (password !== repeat) { setError("The passwords do not match."); return; } setBusy(true); setError(""); try { await Api.changeAccountPassword(current, password); window.location.assign("/login/"); } catch (error) { setError(error instanceof Error ? error.message : "Password change failed."); setBusy(false); } }}>
        <label className="settings-field">Current password<input className="input-base" type="password" autoComplete="current-password" required maxLength={128} value={current} disabled={busy} onChange={event => setCurrent(event.target.value)} /></label>
        <label className="settings-field">New password<input className="input-base" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
        <label className="settings-field">Repeat new password<input className="input-base" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={repeat} disabled={busy} onChange={event => setRepeat(event.target.value)} /></label>
        <button className="btn-primary" type="submit" disabled={busy}>Change password and sign out</button>
      </form></section>}
    {security?.provider === "google" && <section className="settings-section"><h2>Google sign-in</h2><p>Your password is managed by Google. This account does not have a separate ThyncSpace password.</p></section>}
    {status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
  </div></AppLayout>;
}
