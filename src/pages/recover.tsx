import AuthChallenge, { useAuthPolicy } from "../components/authChallenge";
import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import * as Api from "../util/fetch";

export default function Recover() {
  const { policy, error: policyError, retry } = useAuthPolicy();
  const [botToken, setBotToken] = useState(""), [challengeReset, setChallengeReset] = useState(0);
  const blocked = !policy || Boolean(policy.turnstileSiteKey && !botToken);
  const [email, setEmail] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("");
  return <main className="account-action-page"><Head><title>Password recovery | ThyncSpace</title><meta name="referrer" content="no-referrer" /></Head>
    <h1>Reset your password</h1><p>Enter the email for your local account. Google accounts use Google’s recovery process.</p>
    {policyError && <p role="alert">{policyError} <button type="button" onClick={retry}>Retry sign-in options</button></p>}
    <form onSubmit={async event => { event.preventDefault(); if (busy || blocked) return; setBusy(true); setError(""); setStatus(""); try { setStatus(await Api.requestPasswordReset(email, botToken)); } catch (error) { setError(error instanceof Error ? error.message : "Recovery request failed."); } finally { setBusy(false); setBotToken(""); setChallengeReset(value => value + 1); } }}>
      <label>Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
      <AuthChallenge siteKey={policy?.turnstileSiteKey ?? ""} action="recover" reset={challengeReset} onToken={setBotToken} />
      <button type="submit" className="btn-primary" disabled={busy || blocked || !email.trim()}>{busy ? "Requesting…" : "Send recovery link"}</button>
    </form><Link href="/login/">Back to sign-in</Link>
    {status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
  </main>;
}
