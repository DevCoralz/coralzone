// Server-only helpers for talking to the coralz-storage service. Kept in a
// `.server.ts` module so more than one `*.functions.ts` file can share them
// (uploads, buckets). Import it ONLY from inside createServerFn handlers or
// other `.server.ts` modules: STORAGE_SERVICE_KEY must never reach the browser.
export const STORAGE_PREFIX = "/api/v1/storage";

export function storageBase(): string {
  return (process.env.STORAGE_SERVICE_URL ?? "").trim().replace(/\/+$/, "");
}

// Where the browser sends upload chunks. Only https is accepted (or localhost
// for development), because the one time upload token travels in a header.
export function storagePublicBase(): string {
  const explicit = (process.env.STORAGE_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  const base = explicit || storageBase();
  if (/^https:\/\//i.test(base) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(base)) return base;
  return "";
}

export function storageKey(): string {
  return (process.env.STORAGE_SERVICE_KEY ?? "").trim();
}

export type StorageResult<T> = {
  configured: boolean;
  ok: boolean;
  status: number;
  data: T | null;
  // Short, service-authored reason for a 4xx rejection (e.g. "File type not
  // allowed"). Never set for 5xx/network failures, which stay generic.
  detail?: string;
};

export async function storageFetch<T>(path: string, init?: RequestInit): Promise<StorageResult<T>> {
  const base = storageBase();
  if (!base) return { configured: false, ok: false, status: 0, data: null };
  const key = storageKey();
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...(key ? { "X-Service-Key": key } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      let detail: string | undefined;
      if (response.status >= 400 && response.status < 500) {
        try {
          const body = (await response.json()) as { detail?: unknown };
          if (typeof body.detail === "string") detail = body.detail.slice(0, 200);
        } catch {
          /* no JSON body */
        }
      }
      return { configured: true, ok: false, status: response.status, data: null, detail };
    }
    const text = await response.text();
    let data: T | null = null;
    try {
      data = (text ? JSON.parse(text) : null) as T;
    } catch {
      data = text as unknown as T;
    }
    return { configured: true, ok: true, status: response.status, data };
  } catch {
    return { configured: true, ok: false, status: 0, data: null };
  }
}

