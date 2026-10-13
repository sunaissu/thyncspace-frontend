import { useEffect, useState } from "react";
import * as Api from "../util/fetch";

export default function UsageConsent({ owner }: { owner?: string }) {
  const [value, setValue] = useState<{ enabled: boolean; revision: number } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  useEffect(() => { let active = true; setValue(null); Api.fetchUsageConsent().then(value => { if (active) { setValue(value); setError(""); } }).catch(() => { if (active) setError("Usage preferences could not be loaded."); }); return () => { active = false; }; }, [owner, refresh]);
  const change = async () => {
    if (!value || busy) return; setBusy(true); setError("");
    try { setValue(await Api.changeUsageConsent(!value.enabled, value.revision)); } catch (error) { setError(error instanceof Error ? error.message : "Could not change usage preferences."); } finally { setBusy(false); }
  };
  return <section className="settings-section" aria-labelledby="usage-heading"><h2 id="usage-heading">Optional usage counts</h2><p>Off by default. If enabled, Thyncspace counts successful workspace opens, note creation, opening and private saves, imports, archive downloads, sharing changes, collaboration token requests and companion setup.</p><p>Records contain a random internal ID, UTC day and counts. They exclude note IDs, titles, text, files, searches, names, email addresses, IP addresses and all calculator activity. Records expire after 90 days. Only aggregate counts are included in the operator report.</p><p>Turning this off deletes your existing usage records. Turning it on again starts with a new random ID. Your account download includes retained counts, and account deletion removes them.</p>{value ? <><p role="status">Usage counts are {value.enabled ? "on" : "off"}.</p><button type="button" className="btn-ghost" disabled={busy} onClick={() => void change()}>{value.enabled ? "Turn off and delete usage counts" : "Allow usage counts"}</button></> : !error && <p role="status">Loading usage preference…</p>}{error && <p role="alert">{error}</p>}<button type="button" className="btn-ghost" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh usage preference</button></section>;
}
