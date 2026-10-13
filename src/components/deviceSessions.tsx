import { useEffect, useState } from "react";
import * as Api from "../util/fetch";

const browserName = (agent: string) => {
  const browser = /Edg\//.test(agent) ? "Edge" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "Browser";
  const system = /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iOS" : /Windows/.test(agent) ? "Windows" : /Macintosh/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : "unknown device";
  return `${browser} on ${system}`;
};
export default function DeviceSessions() {
  const [devices, setDevices] = useState<Api.DeviceSession[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    Api.fetchDeviceSessions().then(value => { if (active) setDevices(value); }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Could not load sessions."); });
    return () => { active = false; };
  }, [attempt]);
  const revoke = async (device: Api.DeviceSession) => {
    if (busy || !window.confirm(`Sign out ${device.current ? "this session" : browserName(device.userAgent)}? Its live editors will disconnect.`)) return;
    setBusy(true); setError(""); setStatus("");
    try {
      const result = await Api.revokeDeviceSession(device.id);
      if (result.current) { window.location.assign("/login/"); return; }
      setDevices(current => current?.filter(item => item.id !== device.id) ?? []);
      setStatus("Session signed out. Its live connections have been closed.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not sign out this session."); }
    finally { setBusy(false); }
  };
  return <section className="settings-section" aria-labelledby="device-sessions-heading">
    <h2 id="device-sessions-heading">Signed-in devices</h2>
    <p>Sessions seen since this feature was installed. Browser names come from the device and are approximate. Up to 100 active sessions are shown.</p>
    <button type="button" className="btn-ghost" disabled={busy} onClick={() => setAttempt(value => value + 1)}>Refresh sessions</button>
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
    {!devices && !error && <p role="status">Loading sessions…</p>}
    {devices?.map(device => <article className="device-session-row" key={device.id}>
      <div><h3>{browserName(device.userAgent)}{device.current ? " · This session" : ""}</h3><p>Last request {new Date(device.lastSeenAt).toLocaleString()}<br />First seen {new Date(device.firstSeenAt).toLocaleString()}</p><details><summary>Browser details</summary><p>{device.userAgent}</p></details></div>
      <button type="button" className="btn-ghost" disabled={busy} onClick={() => void revoke(device)}>{device.current ? "Sign out this session" : "Sign out device"}</button>
    </article>)}
    {devices?.length === 0 && <p>No active sessions found.</p>}
  </section>;
}
