import Router from "next/router";
import env from "@/util/config";
import type { Note } from "../model/note";
import type { User } from "../model/user";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const isUnauthorizedError = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 401;

let csrfToken: string | null = null;
let expectedAccount: string | null = null;
export const setExpectedAccount = (userId: string | null) => { expectedAccount = userId; };
let csrfTokenRequest: Promise<string> | null = null;

const isMutation = (method: string) =>
  !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());

const loadCsrfToken = async () => {
  if (csrfToken) return csrfToken;
  if (!csrfTokenRequest) {
    csrfTokenRequest = fetch(`${env.SERVER_URL}/api/auth/csrf-token`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new ApiError("Could not initialize request security", response.status);
        }
        const body = (await response.json()) as { token?: string };
        if (!body.token) throw new Error("CSRF response did not include a token");
        csrfToken = body.token;
        return body.token;
      })
      .finally(() => {
        csrfTokenRequest = null;
      });
  }
  return csrfTokenRequest;
};

const request = async (
  input: RequestInfo,
  init: RequestInit = {},
  retryCsrf = true,
): Promise<Response> => {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  const path = typeof input === "string" ? new URL(input, env.SERVER_URL).pathname : "";
  if (expectedAccount && !headers.has("X-Account-Id") && !["/api/auth/login", "/api/auth/register", "/api/auth/csrf-token", "/api/auth/request-reset", "/api/auth/account-action"].includes(path) && path !== "/api/users/getUser") headers.set("X-Account-Id", expectedAccount);
  if (isMutation(method)) {
    headers.set("X-CSRF-Token", await loadCsrfToken());
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? "include",
  });

  if (response.status === 403 && isMutation(method) && retryCsrf) {
    const errorBody = await response.clone().json().catch(() => ({}));
    if (errorBody.error === "Invalid CSRF token") {
      csrfToken = null;
      return request(input, { ...init, headers }, false);
    }
  }
  return response;
};

const readError = async (response: Response) => {
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const errorBody = isJson ? await response.json().catch(() => ({})) : {};
  return errorBody.error || `HTTP error ${response.status}`;
};

async function fetchData(
  input: RequestInfo,
  init?: RequestInit,
  redirectOnUnauthorized = true,
) {
  const response = await request(input, init);
  if (response.ok) return response;

  const errorMessage = await readError(response);
  if (response.status === 401 && redirectOnUnauthorized) {
    void Router.push("/unauthorized");
  }
  throw new ApiError(errorMessage, response.status);
}

export async function getLoginUser(): Promise<User> {
  const response = await request(`${env.SERVER_URL}/api/users/getUser`, {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) throw new ApiError(await readError(response), response.status);
  const body = await response.json();
  return body.user;
}

interface RegisterCredentials {
  username: string;
  email: string;
  password: string;
}

export async function registerUser(user: RegisterCredentials): Promise<User> {
  const response = await fetchData(
    `${env.SERVER_URL}/api/auth/register`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user),
    },
    false,
  );
  csrfToken = null;
  const body = await response.json();
  return body.user;
}

interface LoginCredentials {
  email: string;
  password: string;
}

export async function loginUser(user: LoginCredentials): Promise<User> {
  const response = await fetchData(
    `${env.SERVER_URL}/api/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user),
    },
    false,
  );
  csrfToken = null;
  const body = await response.json();
  return body.user;
}

export async function logout() {
  await fetchData(`${env.SERVER_URL}/api/auth/logout`, { method: "POST" });
  csrfToken = null;
}

export async function fetchNotes(): Promise<Note[]> {
  const response = await fetchData(`${env.SERVER_URL}/api/notes`);
  return response.json();
}

export async function fetchNote(noteId: string): Promise<Note> {
  const response = await fetchData(`${env.SERVER_URL}/api/notes/${noteId}`);
  return response.json();
}

export async function fetchSharedNotes(): Promise<Note[]> {
  const response = await fetchData(`${env.SERVER_URL}/api/notes/shared`);
  return response.json();
}

export async function fetchFavoriteNotes(): Promise<Note[]> {
  const response = await fetchData(`${env.SERVER_URL}/api/notes/favorites`);
  return response.json();
}

export async function toggleFavoriteNote(noteId: string): Promise<Note> {
  const response = await fetchData(
    `${env.SERVER_URL}/api/notes/${noteId}/favorite`,
    { method: "PATCH" },
  );
  return response.json();
}

export interface NoteInput {
  expectedRevision?: number;
  title?: string;
  text?: string;
  type?: string;
}

export async function createNotes(note: NoteInput): Promise<Note> {
  const response = await fetchData(`${env.SERVER_URL}/api/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(note),
  });
  return response.json();
}

export async function importNotes(
  notes: Array<{ title: string; text: string; sourcePath?: string }>,
): Promise<Note[]> {
  const response = await fetchData(`${env.SERVER_URL}/api/notes/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
  return response.json();
}

export async function updateNotes(id: string, note: NoteInput) {
  const response = await fetchData(`${env.SERVER_URL}/api/notes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(note),
  });
  return response.json();
}

export async function updatePrivateNote(
  id: string,
  note: NoteInput,
): Promise<Note> {
  const response = await fetchData(
    `${env.SERVER_URL}/api/notes/${id}/private`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note),
    },
  );
  return response.json();
}

export interface CollaboratorDetails {
  email: string;
  permission: "viewer" | "editor";
  userId: string;
  username: string;
}

export async function getCollaborationToken(noteId: string): Promise<string> {
  const response = await fetchData(
    `${env.SERVER_URL}/api/notes/${noteId}/collaboration-token`,
    { method: "POST" },
  );
  const body = await response.json();
  return body.token;
}

export async function fetchCollaborators(
  noteId: string,
): Promise<CollaboratorDetails[]> {
  const response = await fetchData(
    `${env.SERVER_URL}/api/notes/${noteId}/collaborators`,
  );
  return response.json();
}

export async function shareNote(
  noteId: string,
  identifier: string,
  permission: "viewer" | "editor",
  snapshot?: { text: string; expectedRevision: number },
): Promise<CollaboratorDetails> {
  const response = await fetchData(
    `${env.SERVER_URL}/api/notes/${noteId}/collaborators`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, permission, snapshot }),
    },
  );
  return response.json();
}

export async function unshareNote(noteId: string, userId: string) {
  await fetchData(
    `${env.SERVER_URL}/api/notes/${noteId}/collaborators/${userId}`,
    { method: "DELETE" },
  );
}

export async function deleteNotes(id: string) {
  await fetchData(`${env.SERVER_URL}/api/notes/${id}`, { method: "DELETE" });
}

export async function updateUsername(newUsername: string): Promise<User> {
  const response = await fetchData(`${env.SERVER_URL}/api/users/updateUsername`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newUsername }),
  });
  const body = await response.json();
  return body.user;
}

export interface NoteVersion { label?: string; id: string; title: string; savedAt: string }
export async function fetchTrash(): Promise<Note[]> {
  return (await fetchData(env.SERVER_URL + "/api/notes/trash")).json();
}
export async function fetchNoteHistory(noteId: string): Promise<NoteVersion[]> {
  return (await fetchData(env.SERVER_URL + "/api/notes/" + noteId + "/history")).json();
}
export async function recoverNote(noteId: string, versionId?: string): Promise<Note> {
  return (await fetchData(env.SERVER_URL + "/api/notes/" + noteId + "/recover", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ versionId }),
  })).json();
}
export async function updateNoteOrganization(noteId: string, notebook: string, tags: string[], isTemplate?: boolean, isArchived?: boolean): Promise<Note> {
  return (await fetchData(env.SERVER_URL + "/api/notes/" + noteId + "/organization", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notebook, tags, isTemplate, isArchived }),
  })).json();
}

export async function fetchNoteVersion(noteId: string, versionId: string): Promise<NoteVersion & { content: string; type: string }> {
  return (await fetchData(env.SERVER_URL + "/api/notes/" + noteId + "/history/" + versionId)).json();
}
export async function renameNoteVersion(noteId: string, versionId: string, label: string): Promise<void> {
  await fetchData(env.SERVER_URL + "/api/notes/" + noteId + "/history/" + versionId, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
}
export async function permanentlyDeleteNote(noteId: string): Promise<void> {
  await fetchData(env.SERVER_URL + "/api/notes/trash/" + noteId, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: noteId }) });
}

export interface StorageUsage {
  totals: { notes: number; totalBytes: number; contentBytes: number; historyBytes: number; collaborationBytes: number; trashBytes: number };
  largest: Array<{ _id: string; title: string; type: string; status: string; totalBytes: number }>;
  noteLimitBytes: number;
}
export async function fetchStorageUsage(): Promise<StorageUsage> {
  return (await fetchData(env.SERVER_URL + "/api/notes/storage")).json();
}

export type OrganizationAction = { action: "archive"; noteIds: string[]; isArchived: boolean } | { action: "move"; noteIds: string[]; notebook: string } | { action: "rename-tag"; from: string; to: string };
export async function bulkOrganizeNotes(action: OrganizationAction): Promise<{ affected: number }> {
  return (await fetchData(env.SERVER_URL + "/api/notes/organization/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) })).json();
}

export interface SavedSearch { id: string; name: string; query: string; notebook: string; tag: string; owner: "all" | "mine" | "shared"; type: "all" | "document" | "whiteboard"; from: string; to: string; view: "all" | "shared" | "documents" | "boards" | "favorites" | "pinned" | "recent" | "archived" }
export interface WorkspacePreferences { revision: number; pinned: string[]; recent: Array<{ noteId: string; openedAt: string }>; searches: SavedSearch[] }
export type WorkspaceAction = { action: "pin" | "unpin" | "open"; noteId: string } | { action: "clear-recent" } | { action: "save-search"; search: SavedSearch } | { action: "delete-search"; id: string };
export async function fetchWorkspacePreferences(): Promise<WorkspacePreferences> { return (await fetchData(env.SERVER_URL + "/api/notes/workspace")).json(); }
export async function updateWorkspacePreferences(action: WorkspaceAction): Promise<WorkspacePreferences> { return (await fetchData(env.SERVER_URL + "/api/notes/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) })).json(); }

export interface DeviceSession { id: string; current: boolean; userAgent: string; firstSeenAt: string; lastSeenAt: string; expiresAt: string }
export async function fetchDeviceSessions(): Promise<DeviceSession[]> { return (await fetchData(env.SERVER_URL + "/api/users/sessions")).json(); }
export async function revokeDeviceSession(id: string): Promise<{ signedOut: boolean; current: boolean }> { return (await fetchData(env.SERVER_URL + "/api/users/sessions/" + encodeURIComponent(id), { method: "DELETE" })).json(); }

export interface NoteSchedule { id: string; templateId: string; title: string; cadence: "daily" | "weekly"; time: string; weekday: number; isActive: boolean; nextRunAt: string; lastRunAt?: string; lastNoteId?: string; error?: string }
export async function openDailyNote(date: string, templateId?: string): Promise<Note> { return (await fetchData(env.SERVER_URL + "/api/notes/daily", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, templateId }) })).json(); }
export async function fetchNoteSchedules(): Promise<NoteSchedule[]> { return (await fetchData(env.SERVER_URL + "/api/notes/schedules")).json(); }
export async function createNoteSchedule(value: Pick<NoteSchedule, "templateId" | "title" | "cadence" | "time" | "weekday">): Promise<NoteSchedule> { return (await fetchData(env.SERVER_URL + "/api/notes/schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) })).json(); }
export async function changeNoteSchedule(id: string, isActive: boolean): Promise<NoteSchedule> { return (await fetchData(env.SERVER_URL + "/api/notes/schedules/" + encodeURIComponent(id), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive }) })).json(); }
export async function deleteNoteSchedule(id: string): Promise<void> { await fetchData(env.SERVER_URL + "/api/notes/schedules/" + encodeURIComponent(id), { method: "DELETE" }); }

export async function saveCapture(captureId: string, title: string, text: string): Promise<Note> { return (await fetchData(env.SERVER_URL + "/api/notes/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ captureId, title, text }) }, false)).json(); }

export interface DeletionRequest { id: string; status: "pending" | "cancelled"; requestedAt: string; cancelledAt?: string; }
export async function fetchDeletionRequest(): Promise<DeletionRequest | null> {
  return (await fetchData(`${env.SERVER_URL}/api/users/privacy/deletion`, { cache: "no-store" })).json();
}
export async function changeDeletionRequest(cancel: boolean, confirmation: string): Promise<DeletionRequest | null> {
  return (await fetchData(`${env.SERVER_URL}/api/users/privacy/deletion`, { method: cancel ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: cancel ? undefined : JSON.stringify({ confirmation }) })).json();
}
export async function downloadAccountData(): Promise<Blob> {
  const response = await fetchData(`${env.SERVER_URL}/api/users/privacy/export`, { cache: "no-store" });
  const blob = await response.blob();
  const tail = (await blob.slice(-2048).text()).trim().split("\n").at(-1);
  const end = JSON.parse(tail || "{}");
  if (end.kind !== "complete" || !Number.isInteger(end.records) || end.records < 1) throw new Error("The account export was incomplete. Try again.");
  return blob;
}

export interface AccountSecurity { provider: "local" | "google"; verified: boolean; emailDeliveryAvailable: boolean; }
export async function fetchAccountSecurity(): Promise<AccountSecurity> { return (await fetchData(`${env.SERVER_URL}/api/auth/security`, { cache: "no-store" })).json(); }
async function securityMutation(path: string, body: unknown): Promise<string> {
  const response = await fetchData(`${env.SERVER_URL}/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, false);
  return (await response.json()).message;
}
export const requestPasswordReset = (email: string) => securityMutation("request-reset", { email });
export const requestEmailVerification = () => securityMutation("request-verification", {});
export const confirmAccountAction = (purpose: "reset" | "verify", token: string, password?: string) => securityMutation("account-action", { purpose, token, password });
export const changeAccountPassword = (currentPassword: string, newPassword: string) => securityMutation("change-password", { currentPassword, newPassword });

export interface NoteActivityEvent { id: string; kind: string; at: string; actor: string; target?: string; permission?: string; sourceNoteId?: string; sourceVersionId?: string; }
export interface NoteActivity { createdAt: string; limit: number; events: NoteActivityEvent[]; }
export async function fetchNoteActivity(noteId: string): Promise<NoteActivity> { return (await fetchData(`${env.SERVER_URL}/api/notes/${encodeURIComponent(noteId)}/activity`, { cache: "no-store" })).json(); }

export interface AttachmentFile { id: string; name: string; mime: string; bytes: number; owner: string; references: Array<{ noteId: string; title: string }>; createdAt: string; indexedAt?: string; }
export interface AttachmentLibraryData { files: AttachmentFile[]; truncated: boolean; usage: { bytes: number; count: number }; limits: { fileBytes: number; accountBytes: number; count: number }; }
export async function fetchAttachments(q = "", noteId?: string): Promise<AttachmentLibraryData> { const query = new URLSearchParams({ q }); if (noteId) query.set("noteId", noteId); return (await fetchData(env.SERVER_URL + "/api/attachments?" + query, { cache: "no-store" })).json(); }
export async function fetchAttachmentContent(id: string): Promise<Blob> { return (await fetchData(env.SERVER_URL + "/api/attachments/" + encodeURIComponent(id) + "/content", { cache: "no-store" })).blob(); }
export async function uploadAttachment(name: string, mime: string, data: string): Promise<{ id: string }> { return (await fetchData(env.SERVER_URL + "/api/attachments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mime, data }) })).json(); }
export async function referenceAttachment(id: string, noteId: string, remove: boolean): Promise<void> { await fetchData(env.SERVER_URL + "/api/attachments/" + encodeURIComponent(id) + "/references", { method: remove ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ noteId }) }); }
export async function deleteAttachment(id: string): Promise<void> { await fetchData(env.SERVER_URL + "/api/attachments/" + encodeURIComponent(id), { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: id }) }); }

export interface AttachmentIndex { text: string; indexedAt: string | null; revision: number; }
export async function fetchAttachmentIndex(id: string): Promise<AttachmentIndex> { return (await fetchData(env.SERVER_URL + "/api/attachments/" + encodeURIComponent(id) + "/index", { cache: "no-store" })).json(); }
export async function updateAttachmentIndex(id: string, text: string, expectedRevision: number): Promise<AttachmentIndex> { return (await fetchData(env.SERVER_URL + "/api/attachments/" + encodeURIComponent(id) + "/index", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, expectedRevision, consent: true }) })).json(); }

export interface Reminder { id: string; noteId: string; title: string; available: boolean; dueAt: string; repeatDays: number; completedAt?: string; taskLine?: number; taskText?: string; sourceChanged: boolean; taskDone: boolean; }
export interface ReminderList { revision: number; entries: Reminder[]; }
function readReminderList(value: ReminderList): ReminderList {
  if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.entries) || value.entries.length > 100 || value.entries.some(entry => !entry || typeof entry.id !== "string" || !/^[a-f0-9-]{36}$/i.test(entry.id) || typeof entry.noteId !== "string" || !/^[a-f0-9]{24}$/i.test(entry.noteId) || typeof entry.title !== "string" || typeof entry.available !== "boolean" || typeof entry.sourceChanged !== "boolean" || typeof entry.taskDone !== "boolean" || typeof entry.dueAt !== "string" || !Number.isFinite(Date.parse(entry.dueAt)) || !Number.isInteger(entry.repeatDays) || entry.repeatDays < 0 || entry.repeatDays > 365 || (entry.taskText !== undefined && typeof entry.taskText !== "string") || (entry.completedAt !== undefined && (typeof entry.completedAt !== "string" || !Number.isFinite(Date.parse(entry.completedAt)))))) throw new Error("The reminder response was invalid. Refresh to try again.");
  return value;
}
export async function fetchReminders(): Promise<ReminderList> { return readReminderList(await (await fetchData(env.SERVER_URL + "/api/notes/reminders", { cache: "no-store" })).json()); }
export async function updateReminders(input: { action: "create" | "complete" | "snooze" | "delete"; expectedRevision: number; id: string; noteId?: string; dueAt?: string; repeatDays?: number; taskLine?: number; sourceText?: string }): Promise<ReminderList> { return readReminderList(await (await fetchData(env.SERVER_URL + "/api/notes/reminders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })).json()); }

export async function fetchOfflineSyncNote(account: string, id: string): Promise<Note> { return (await fetchData(env.SERVER_URL + "/api/notes/" + encodeURIComponent(id), { cache: "no-store", headers: { "X-Account-Id": account } }, false)).json(); }
export async function saveOfflineSyncNote(account: string, id: string, text: string, expectedRevision: number): Promise<Note> { return (await fetchData(env.SERVER_URL + "/api/notes/" + encodeURIComponent(id) + "/private", { method: "PATCH", headers: { "Content-Type": "application/json", "X-Account-Id": account }, body: JSON.stringify({ text, expectedRevision }) }, false)).json(); }

export interface LinkedSource { noteId: string; available: boolean; title: string; type?: "document" | "whiteboard"; sourceRevision?: number; reviewedRevision: number; stale: boolean; }
export interface LinkedSources { revision: number; canEdit: boolean; entries: LinkedSource[]; }
export interface LinkedPreview { noteId: string; title: string; type: "document" | "whiteboard"; content: string; revision: number; updatedAt: string; }
function readLinkedSources(value: LinkedSources): LinkedSources { if (!value || !Number.isSafeInteger(value.revision) || typeof value.canEdit !== "boolean" || !Array.isArray(value.entries) || value.entries.length > 20 || value.entries.some(entry => typeof entry?.noteId !== "string" || typeof entry.title !== "string" || typeof entry.available !== "boolean" || typeof entry.stale !== "boolean")) throw new Error("Linked sources could not be read. Refresh to try again."); return value; }
export async function fetchLinkedSources(noteId: string): Promise<LinkedSources> { return readLinkedSources(await (await fetchData(env.SERVER_URL + "/api/notes/" + encodeURIComponent(noteId) + "/embeds", { cache: "no-store" }, false)).json()); }
export async function fetchLinkedPreview(noteId: string, sourceId: string): Promise<LinkedPreview> { const value = await (await fetchData(env.SERVER_URL + "/api/notes/" + encodeURIComponent(noteId) + "/embeds/" + encodeURIComponent(sourceId), { cache: "no-store" }, false)).json(); if (!value || value.noteId !== sourceId || !["document", "whiteboard"].includes(value.type) || typeof value.content !== "string" || typeof value.title !== "string" || !Number.isSafeInteger(value.revision)) throw new Error("The source preview was invalid."); return value; }
export async function updateLinkedSources(noteId: string, input: { action: "add" | "remove" | "review"; sourceId: string; expectedRevision: number; expectedSourceRevision?: number }): Promise<LinkedSources> { return readLinkedSources(await (await fetchData(env.SERVER_URL + "/api/notes/" + encodeURIComponent(noteId) + "/embeds", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }, false)).json()); }

export interface DiscussionMember { id: string; name: string; }
export interface DiscussionPost { id: string; authorId: string; author: string; body: string; deleted: boolean; createdAt: string; editedAt?: string; mentions: DiscussionMember[]; }
export interface Discussion { id: string; noteId: string; title: string; revision: number; resolved: boolean; canEdit: boolean; isOwner: boolean; members: DiscussionMember[]; posts: DiscussionPost[]; }
export interface DiscussionList { entries: Array<{ id: string; noteId: string; title: string; revision: number; resolved: boolean; updatedAt: string; count: number; excerpt: string }>; nextCursor: string | null; canEdit: boolean; members: DiscussionMember[]; }
export interface DiscussionAction { action: "create" | "reply" | "edit" | "delete-post" | "resolve" | "reopen" | "remove"; id: string; body: string; mentions: string[]; expectedRevision?: number; confirmation?: string; }
const validMembers = (value: DiscussionMember[]) => Array.isArray(value) && value.every(member => member && typeof member.id === "string" && typeof member.name === "string");
export async function fetchDiscussions(noteId: string, filter: string, cursor: string): Promise<DiscussionList> {
  const query = new URLSearchParams({ filter }); if (noteId) query.set("noteId", noteId); if (cursor) query.set("cursor", cursor);
  const value = await (await fetchData(env.SERVER_URL + "/api/notes/discussions?" + query, { cache: "no-store" }, false)).json();
  if (!value || !Array.isArray(value.entries) || value.entries.length > 50 || typeof value.canEdit !== "boolean" || !validMembers(value.members) || (value.nextCursor !== null && typeof value.nextCursor !== "string") || value.entries.some((entry: DiscussionList["entries"][number]) => !entry || typeof entry.id !== "string" || typeof entry.noteId !== "string" || typeof entry.title !== "string" || typeof entry.excerpt !== "string")) throw new Error("The discussion inbox response was invalid.");
  return value;
}
export async function fetchDiscussion(noteId: string, id: string): Promise<Discussion> {
  const value = await (await fetchData(env.SERVER_URL + "/api/notes/" + encodeURIComponent(noteId) + "/discussions/" + encodeURIComponent(id), { cache: "no-store" }, false)).json();
  if (!value || value.id !== id || value.noteId !== noteId || typeof value.title !== "string" || !Number.isSafeInteger(value.revision) || typeof value.resolved !== "boolean" || typeof value.canEdit !== "boolean" || typeof value.isOwner !== "boolean" || !validMembers(value.members) || !Array.isArray(value.posts) || value.posts.length > 50 || value.posts.some((post: DiscussionPost) => !post || typeof post.id !== "string" || typeof post.authorId !== "string" || typeof post.author !== "string" || typeof post.body !== "string" || typeof post.deleted !== "boolean" || !Number.isFinite(Date.parse(post.createdAt)) || !validMembers(post.mentions))) throw new Error("The discussion response was invalid.");
  return value;
}
export async function changeDiscussion(noteId: string, id: string | undefined, input: DiscussionAction): Promise<{ id: string; removed: boolean }> {
  const value = await (await fetchData(env.SERVER_URL + "/api/notes/" + encodeURIComponent(noteId) + "/discussions" + (id ? "/" + encodeURIComponent(id) : ""), { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }, false)).json();
  if (!value || typeof value.id !== "string" || typeof value.removed !== "boolean") throw new Error("The comment response was invalid. Refresh before retrying."); return value;
}

export interface SharedNotebookSummary { id: string; name: string; owner: string; ownerName: string; revision: number; permission: "owner" | "viewer" | "editor"; noteCount: number; }
export interface SharedNotebookList { entries: SharedNotebookSummary[]; nextCursor: string | null; }
export interface SharedNotebook { id: string; name: string; revision: number; owner: string; ownerName: string; isOwner: boolean; members: Array<{ id: string; name: string; permission: "viewer" | "editor" }>; notes: Array<{ id: string; title: string; type: string; revision: number }>; }
export interface NotebookAction { action: "rename" | "member" | "remove-member" | "attach" | "detach" | "delete"; expectedRevision: number; name?: string; identifier?: string; permission?: "viewer" | "editor"; memberId?: string; noteId?: string; expectedContentRevision?: number; confirmation?: string; }
export async function fetchSharedNotebooks(cursor = ""): Promise<SharedNotebookList> {
  const value = await (await fetchData(env.SERVER_URL + "/api/notes/notebooks" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""), { cache: "no-store" }, false)).json();
  if (!value || !Array.isArray(value.entries) || value.entries.length > 50 || (value.nextCursor !== null && typeof value.nextCursor !== "string") || value.entries.some((book: SharedNotebookSummary) => !book || typeof book.id !== "string" || typeof book.name !== "string" || typeof book.ownerName !== "string")) throw new Error("The notebook list response was invalid."); return value;
}
export async function fetchSharedNotebook(id: string): Promise<SharedNotebook> {
  const value = await (await fetchData(env.SERVER_URL + "/api/notes/notebooks/" + encodeURIComponent(id), { cache: "no-store" }, false)).json();
  if (!value || value.id !== id || typeof value.name !== "string" || !Number.isSafeInteger(value.revision) || typeof value.isOwner !== "boolean" || !Array.isArray(value.members) || value.members.length > 100 || value.members.some((member: SharedNotebook["members"][number]) => !member || typeof member.id !== "string" || typeof member.name !== "string" || !["viewer", "editor"].includes(member.permission)) || !Array.isArray(value.notes) || value.notes.length > 100 || value.notes.some((note: SharedNotebook["notes"][number]) => !note || typeof note.id !== "string" || typeof note.title !== "string")) throw new Error("The notebook response was invalid."); return value;
}
export async function createSharedNotebook(id: string, name: string): Promise<{ id: string }> { const value = await (await fetchData(env.SERVER_URL + "/api/notes/notebooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name }) }, false)).json(); if (!value || typeof value.id !== "string") throw new Error("The notebook response was invalid. Refresh before retrying."); return value; }
export async function changeSharedNotebook(id: string, input: NotebookAction): Promise<{ id: string; removed: boolean }> { const value = await (await fetchData(env.SERVER_URL + "/api/notes/notebooks/" + encodeURIComponent(id), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }, false)).json(); if (!value || value.id !== id || typeof value.removed !== "boolean") throw new Error("The notebook response was invalid. Refresh before retrying."); return value; }
