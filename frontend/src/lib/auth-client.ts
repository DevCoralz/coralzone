// Thin client for /api/auth/*. Unlike apiFetch, these throw a typed
// AuthError with the server's message so the auth form can show it —
// a silent `null` isn't enough feedback for "wrong password".
export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AuthError(data?.error || "Something went wrong. Try again.", response.status);
  }
  return data as T;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}

export function registerRequest(input: { name: string; email: string; password: string }) {
  return postJson<{ ok: true; email: string; message: string }>("/api/auth/register", input);
}

export function loginRequest(input: { email: string; password: string }) {
  return postJson<
    | { ok: true; user: PublicUser }
    | { ok: true; needsVerification: true; email: string }
  >("/api/auth/login", input);
}

export function verifyEmailRequest(input: { email: string; code: string }) {
  return postJson<{ ok: true; user: PublicUser }>("/api/auth/verify-email", input);
}

export function resendCodeRequest(input: { email: string }) {
  return postJson<{ ok: true; message: string }>("/api/auth/resend-code", input);
}

export async function logoutRequest() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
}

export const GOOGLE_SIGN_IN_URL = "/api/auth/google";
