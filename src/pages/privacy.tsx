import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import AppLayout from "../components/appLayout";
import type { User } from "../model/user";
import * as Api from "../util/fetch";

export default function Privacy({ loggedInUser }: { loggedInUser?: User | null }) {
  const [request, setRequest] = useState<Api.DeletionRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    Api.fetchDeletionRequest().then(value => { if (active) setRequest(value); }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Could not load your request."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loggedInUser?._id, refresh]);
  const download = async () => {
    if (busy) return;
    setBusy(true); setError(""); setStatus("");
    try {
      const blob = await Api.downloadAccountData();
      const url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url; anchor.download = "thyncspace-account.jsonl"; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus("Account download is ready. Keep this file somewhere private.");
    } catch (error) { setError(error instanceof Error ? error.message : "Download failed. Try again."); }
    finally { setBusy(false); }
  };
  const changeRequest = async (cancel: boolean) => {
    if (busy) return;
    setBusy(true); setError(""); setStatus("");
    try {
      setRequest(await Api.changeDeletionRequest(cancel, confirmation)); setConfirmation("");
      setStatus(cancel ? "Deletion request cancelled." : "Deletion request received. Your account remains available until the request is processed.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update the request."); }
    finally { setBusy(false); }
  };
  return <AppLayout><Head><title>Account privacy | ThyncSpace</title></Head><div className="settings-page">
    <header className="settings-header"><h1>Account privacy</h1><p>Manage your data as {loggedInUser?.username}.</p><Link href="/settings/">Back to settings</Link></header>
    <section className="settings-section" aria-labelledby="export-heading"><h2 id="export-heading">Download account data</h2>
      <p>Download your profile, owned documents and boards (including trash and retained history), notebook and tag metadata, preferences, schedules, device records and deletion request. Shared memberships are listed without copying someone else’s content.</p>
      <p>Save pending edits first. Records reflect the time they are read. Credentials and session tokens are excluded. Private calculator state and drafts stored only on a device are not held by the server. This JSON Lines data file is for inspection, separate from Markdown import/export.</p>
      <button type="button" className="btn-primary" disabled={busy} onClick={() => void download()}>Download my data</button>
    </section>
    <section className="settings-section" aria-labelledby="deletion-heading"><h2 id="deletion-heading">Request account deletion</h2>
      <p>This submits a request for the service operator to process. It does not delete data immediately. The request covers your account and owned notes, including notes you shared. Copies already exported by other people cannot be recalled.</p>
      {loading ? <p role="status">Loading request…</p> : request?.status === "pending" ? <>
        <p>Pending since {new Date(request.requestedAt).toLocaleString()}. Request ID: <code>{request.id}</code>. You can cancel while it is pending.</p>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => void changeRequest(true)}>Cancel deletion request</button>
      </> : <form className="settings-profile-form" onSubmit={event => { event.preventDefault(); void changeRequest(false); }}>
        {request?.status === "cancelled" && <p>Your previous request was cancelled.</p>}
        <label className="settings-field">Type your username to confirm<input className="input-base" autoComplete="off" value={confirmation} maxLength={50} onChange={event => setConfirmation(event.target.value)} /></label>
        <button type="submit" className="btn-ghost" disabled={busy || confirmation !== loggedInUser?.username}>Request deletion</button>
      </form>}
      <button type="button" className="btn-ghost" disabled={busy || loading} onClick={() => setRefresh(value => value + 1)}>Refresh request</button>
    </section>
    {busy && <p role="status">Working…</p>}{status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
  </div></AppLayout>;
}
