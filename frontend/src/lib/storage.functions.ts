// Server-only proxy to the CoralzOne storage service.
// STORAGE_SERVICE_URL and STORAGE_SERVICE_KEY are read inside handlers only —
// they are never sent to the browser, and no response ever echoes them.
// When the variables are not configured yet, every call reports
// { configured: false } so the UI can fall back to demo state.
//
// Contract (see coralz-storage/app/api/storage/media.py):
//   GET    /health                        — liveness, no auth
//   GET    /api/v1/storage/files           — X-Service-Key, ?limit&offset
//   GET    /api/v1/storage/usage           — X-Service-Key
//   POST   /api/v1/storage/media           — X-Service-Key, multipart (file, owner_id, allow_video)
//   DELETE /api/v1/storage/media/{id}      — X-Service-Key, multipart/form (owner_id)
//   GET    /api/v1/storage/media/{id}      — public, anonymous download
//
// STORAGE_SERVICE_URL is the tunnel host with NO /api/v1/storage suffix
// (e.g. https://storage.example.workers.dev) — this module appends the
// prefix itself so health checks can still hit plain /health.
import { createServerFn } from "@tanstack/react-start";

const STORAGE_PREFIX = "/api/v1/storage";

// Files have no per-user owner in CoralzOne's current auth model — every
// upload/delete through this admin-facing page is tagged with one fixed
// owner_id so the service's delete-time owner check still applies. If
// per-user attribution is added later, pass the real user id through here
// instead.
const DEFAULT_OWNER_ID = "coralzone-admin";

function storageBase(): string {
  return (process.env.STORAGE_SERVICE_URL ?? "").trim().replace(/\/+$/, "");
}

function storageKey(): string {
  return (process.env.STORAGE_SERVICE_KEY ?? "").trim();
}

type StorageResult<T> = {
  configured: boolean;
  ok: boolean;
  status: number;
  data: T | null;
};

async function storageFetch<T>(path: string, init?: RequestInit): Promise<StorageResult<T>> {
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
    if (!response.ok) return { configured: true, ok: false, status: response.status, data: null };
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

export interface StorageFile {
  key: string;
  name: string;
  size: number;
  updatedAt: string;
  contentType: string;
}

export const getStorageStatus = createServerFn({ method: "GET" }).handler(async (): Promise<{ configured: boolean; online: boolean; detail: string }> => {
  if (!storageBase()) return { configured: false, online: false, detail: "not_configured" };
  // /health is a plain liveness check on the service root, unauthenticated —
  // deliberately NOT under STORAGE_PREFIX.
  const result = await storageFetch<unknown>("/health");
  return { configured: true, online: result.ok, detail: result.ok ? "online" : `unreachable_${result.status || "network"}` };
});

export const listStorageFiles = createServerFn({ method: "GET" }).handler(async (): Promise<{ configured: boolean; files: StorageFile[] }> => {
  const result = await storageFetch<{ files: Array<Record<string, unknown>> }>(`${STORAGE_PREFIX}/files?limit=50`);
  const rows = (result.data?.files ?? []).map(row => {
    const key = String(row.key ?? row.id ?? "file");
    const original = [row.name, row.filename, row.file_name, row.original_name, row.original_filename, row.originalName, row.title]
      .find(value => typeof value === "string" && value.trim());
    return {
      key,
      name: typeof original === "string" ? original.trim() : "",
      size: Number(row.size ?? 0),
      updatedAt: String(row.updatedAt ?? row.updated_at ?? row.created_at ?? ""),
      contentType: String(row.contentType ?? row.content_type ?? row.mime_type ?? ""),
    };
  });
  return { configured: result.configured && result.ok, files: rows };
});

export interface StorageUsage {
  configured: boolean;
  bytesUsed: number;
  bytesQuota: number;
  requests: number;
}

export const getStorageUsage = createServerFn({ method: "GET" }).handler(async (): Promise<StorageUsage> => {
  const result = await storageFetch<Record<string, unknown>>(`${STORAGE_PREFIX}/usage`);
  const data = (result.data && typeof result.data === "object" ? result.data : {}) as Record<string, unknown>;
  const bytesUsed = Number(data.bytesUsed ?? 0);
  const bytesQuota = Number(data.bytesQuota ?? 0);
  const requests = Number(data.requests ?? 0);
  return { configured: result.configured && result.ok, bytesUsed, bytesQuota, requests };
});

export const deleteStorageFile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (typeof input !== "string" || !input.trim()) throw new Error("A file key is required");
    return input.trim();
  })
  .handler(async ({ data }): Promise<{ configured: boolean; ok: boolean }> => {
    // The service requires owner_id as multipart/form-data on DELETE (a
    // second check independent of the service key) — fetch has no form-encoded
    // body shorthand for DELETE, so it's built explicitly here.
    const form = new FormData();
    form.set("owner_id", DEFAULT_OWNER_ID);
    const result = await storageFetch<unknown>(`${STORAGE_PREFIX}/media/${encodeURIComponent(data)}`, {
      method: "DELETE",
      body: form,
    });
    return { configured: result.configured, ok: result.ok };
  });

export const uploadStorageFile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const value = (input ?? {}) as { name?: unknown; contentType?: unknown; dataBase64?: unknown };
    if (typeof value.name !== "string" || !value.name.trim() || typeof value.dataBase64 !== "string") {
      throw new Error("A file name and contents are required");
    }
    return {
      name: value.name.trim(),
      contentType: typeof value.contentType === "string" ? value.contentType : "application/octet-stream",
      dataBase64: value.dataBase64,
    };
  })
  .handler(async ({ data }): Promise<{ configured: boolean; ok: boolean; id: string }> => {
    // The service's /media upload takes multipart file + owner_id (Form),
    // not JSON — decode the base64 the browser sent us back into bytes and
    // repack as multipart here, server-side, so the browser payload shape
    // doesn't have to change.
    const bytes = Buffer.from(data.dataBase64, "base64");
    const form = new FormData();
    form.set("file", new Blob([bytes], { type: data.contentType }), data.name);
    form.set("owner_id", DEFAULT_OWNER_ID);
    const result = await storageFetch<Record<string, unknown>>(`${STORAGE_PREFIX}/media`, {
      method: "POST",
      body: form,
    });
    const body = (result.data && typeof result.data === "object" ? result.data : {}) as Record<string, unknown>;
    const nested = (body.file && typeof body.file === "object" ? body.file : {}) as Record<string, unknown>;
    const id = String(body.id ?? body.key ?? body.media_id ?? nested.id ?? nested.key ?? "");
    return { configured: result.configured, ok: result.ok, id };
  });

export const downloadStorageFile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (typeof input !== "string" || !input.trim()) throw new Error("A file key is required");
    return input.trim();
  })
  .handler(async ({ data }): Promise<{ ok: boolean; contentType: string; dataBase64: string }> => {
    const base = storageBase();
    if (!base) return { ok: false, contentType: "", dataBase64: "" };
    try {
      const response = await fetch(`${base}${STORAGE_PREFIX}/media/${encodeURIComponent(data)}`);
      if (!response.ok) return { ok: false, contentType: "", dataBase64: "" };
      const buffer = Buffer.from(await response.arrayBuffer());
      return { ok: true, contentType: response.headers.get("content-type") ?? "application/octet-stream", dataBase64: buffer.toString("base64") };
    } catch {
      return { ok: false, contentType: "", dataBase64: "" };
    }
  });
