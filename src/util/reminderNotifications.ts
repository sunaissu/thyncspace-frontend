import type { ReminderList } from "./fetch";

const key = (owner: string) => `thyncspace-reminder-notifications:${owner}`;
export const remindersEnabled = (owner: string) => localStorage.getItem(key(owner)) === "true";
export function enableReminders(owner: string, enabled: boolean) { localStorage.setItem(key(owner), String(enabled)); }
export async function notifyDueReminders(owner: string, reminders: ReminderList) {
  if (!("Notification" in window) || !navigator.locks || Notification.permission !== "granted" || !remindersEnabled(owner)) return;
  await navigator.locks.request(`thyncspace-reminders:${owner}`, { ifAvailable: true }, async lock => {
    if (!lock || !remindersEnabled(owner)) return;
    const storageKey = key(owner) + ":shown", raw = JSON.parse(localStorage.getItem(storageKey) || "{}");
    const shown: Record<string, string> = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const due = reminders.entries.filter(entry => entry.available && !entry.completedAt && !entry.sourceChanged && !entry.taskDone && Date.parse(entry.dueAt) <= Date.now() && shown[entry.id] !== entry.dueAt);
    if (!due.length) return;
    const next = Object.fromEntries(reminders.entries.filter(entry => shown[entry.id]).map(entry => [entry.id, shown[entry.id]]));
    due.forEach(entry => { next[entry.id] = entry.dueAt; });
    localStorage.setItem(storageKey, JSON.stringify(next));
    try {
      const title = "ThyncSpace reminders", options = { body: `${due.length} ${due.length === 1 ? "reminder is" : "reminders are"} due. Open your workspace to review.`, tag: `thyncspace-reminders:${owner}`, data: { path: "/notes/?reminders=1" } };
      const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
      if (registration?.active) await registration.showNotification(title, options);
      else { const notification = new Notification(title, options); notification.onclick = () => { window.focus(); window.dispatchEvent(new Event("thyncspace-open-reminders")); notification.close(); }; }
    } catch (error) { localStorage.setItem(storageKey, JSON.stringify(shown)); throw error; }
  });
}
