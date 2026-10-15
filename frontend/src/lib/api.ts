// Single point of contact with the backend. VITE_API_URL is optional:
// unset -> requests go relative to the current origin (same-origin backend,
// or a reverse-proxied /api path). apiFetch never throws — callers get
// `null` on any failure (missing env var, network error, non-2xx, bad JSON)
// so the UI can render in a degraded state instead of crashing SSR.
const API_URL = (import.meta.env["VITE_API_URL"] ?? "").replace(/\/+$/, "");

export function apiUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${suffix}`;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(apiUrl(path), init);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch (error) {
    // Backend unreachable, VITE_API_URL misconfigured, or offline — degrade, don't crash.
    console.error("[api] request failed:", error);
    return null;
  }
}
