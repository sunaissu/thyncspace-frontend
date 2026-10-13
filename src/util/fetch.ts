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
      return request(input, init, false);
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
