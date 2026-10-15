// Server function used by route loaders to gate access (e.g. /dashboard).
// It stays a thin proxy to /api/auth/me rather than touching MySQL
// directly from the SSR runtime, so every session check — browser or
// server-rendered — runs through the exact same code path in
// api/_lib/auth-core.js.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}

export const getSession = createServerFn({ method: "GET" }).handler(async (): Promise<SessionUser | null> => {
  const request = getRequest();
  const url = new URL(request.url);
  const forwardedHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
  const origin = forwardedHost ? `https://${forwardedHost}` : url.origin;
  const cookie = request.headers.get("cookie") ?? "";

  try {
    const response = await fetch(`${origin}/api/auth/me`, { headers: { cookie } });
    if (!response.ok) return null;
    const data = (await response.json()) as { user: SessionUser };
    return data.user;
  } catch (error) {
    console.error("[auth-session] failed to resolve session:", error);
    return null;
  }
});
