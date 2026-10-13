import { useEffect, useRef, useState } from "react";
import { fetchAuthPolicy, type AuthPolicy } from "../util/fetch";
type Widget = { render: (node: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void };
const widget = () => (window as unknown as { turnstile?: Widget }).turnstile;
let script: Promise<void> | undefined;
function loadScript() {
  if (widget()) return Promise.resolve();
  if (!script) script = new Promise<void>((resolve, reject) => {
    const node = document.createElement("script"); node.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; node.async = true; node.referrerPolicy = "no-referrer";
    const timer = window.setTimeout(() => { node.remove(); reject(new Error("Verification did not load. Check your connection and retry.")); }, 15000);
    node.onload = () => { clearTimeout(timer); if (widget()) resolve(); else { node.remove(); reject(new Error("Verification could not initialize. Retry the challenge.")); } }; node.onerror = () => { clearTimeout(timer); node.remove(); reject(new Error("Verification could not load. Check your connection and retry.")); }; document.head.append(node);
  }).catch(error => { script = undefined; throw error; });
  return script;
}
export function useAuthPolicy() {
  const [policy, setPolicy] = useState<AuthPolicy | null>(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  useEffect(() => { let active = true; fetchAuthPolicy().then(value => { if (active) { setPolicy(value); setError(""); } }).catch(() => { if (active) setError("Could not load sign-in options. Check your connection and retry."); }); return () => { active = false; }; }, [attempt]);
  return { policy, error, retry: () => setAttempt(value => value + 1) };
}
export default function AuthChallenge({ siteKey, action, reset, onToken }: { siteKey: string; action: "register" | "login" | "recover"; reset: number; onToken: (value: string) => void }) {
  const container = useRef<HTMLDivElement>(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!siteKey) return; let active = true, id: string | undefined; onToken("");
    void loadScript().then(() => { if (!active || !container.current) return; const api = widget(); if (!api) throw new Error("Verification is unavailable. Retry the challenge."); setError(""); id = api.render(container.current, { sitekey: siteKey, action, size: "compact", callback: (token: string) => { if (active) onToken(token); }, "expired-callback": () => { if (active) onToken(""); }, "error-callback": () => { if (active) { onToken(""); setError("Verification failed. Retry the challenge."); } } }); }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Verification failed."); });
    return () => { active = false; if (id !== undefined) widget()?.remove(id); };
  }, [siteKey, action, reset, attempt, onToken]);
  if (!siteKey) return null;
  return <div className="auth-challenge"><p>Cloudflare verifies this request to help prevent automated abuse.</p><div ref={container} />{error && <><p role="alert">{error}</p><button type="button" className="btn-ghost" onClick={() => setAttempt(value => value + 1)}>Retry verification</button></>}</div>;
}
