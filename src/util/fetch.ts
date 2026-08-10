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
  notes: Array<{ title: string; text: string }>,
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
): Promise<CollaboratorDetails> {
  const response = await fetchData(
    `${env.SERVER_URL}/api/notes/${noteId}/collaborators`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, permission }),
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
