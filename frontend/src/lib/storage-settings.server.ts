// Server-only helpers for the Cloud storage settings gateway.
//
// Kept in a `.server.ts` module on purpose: it imports
// "@tanstack/react-start/server", which TanStack's import protection denies in
// the client bundle. Anything exported from a `*.functions.ts` file that
// touches getRequest() at module level keeps that import alive for the client
// and fails the build. Import this file ONLY from inside createServerFn
// handlers (the compiler strips those from the client build).
import { getRequest } from "@tanstack/react-start/server";
import { resolveStorageSettings, type EffectiveStorageSettings } from "./storage-settings";

// Must only run inside a request (a server function handler).
export async function callGateway(path: string, init?: RequestInit): Promise<Response> {
  const request = getRequest();
  const url = new URL(request.url);
  const forwardedHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
  const origin = forwardedHost ? `https://${forwardedHost}` : url.origin;
  const cookie = request.headers.get("cookie") ?? "";
  return fetch(`${origin}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), cookie },
  });
}

// Used by other server code (uploads) as well as the server function below.
// Fails SAFE for availability: if the settings can't be read, the built-in
// defaults apply, so a settings outage never blocks every upload.
export async function loadEffectiveSettings(): Promise<EffectiveStorageSettings> {
  try {
    const response = await callGateway("/api/cloud/settings");
    if (!response.ok) return resolveStorageSettings({});
    const data = (await response.json()) as { overrides?: unknown };
    return resolveStorageSettings(data.overrides);
  } catch (error) {
    console.error("[storage-settings] could not load settings, using defaults:", error);
    return resolveStorageSettings({});
  }
}

