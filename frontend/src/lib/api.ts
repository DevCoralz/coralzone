// Single point of contact with the backend. The API now lives in this same
// app under /api (see /frontend/api), so every request is same-origin —
// there's no VITE_API_URL to configure on Vercel or anywhere else.
// apiFetch never throws — callers get `null` on any failure (network
// error, non-2xx, bad JSON) so the UI can render in a degraded state
// instead of crashing SSR.
export function apiUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(apiUrl(path), init);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch (error) {
    console.error("[api] request failed:", error);
    return null;
  }
}
