// Server-only proxy to the CoralzOne storage service.
// STORAGE_SERVICE_URL and STORAGE_SERVICE_KEY are read inside handlers only —
// they are never sent to the browser, and no response ever echoes them.
// When the variables are not configured yet, every call reports
// { configured: false } so the UI can fall back to demo state.
//
// Contract (see coralz-storage/app/api/storage/media.py):
//   GET    /health                        — liveness, no auth
//   GET    /api/v1/storage/files           — X-Service-Key, ?limit&offset&owner_id&bucket_id
//   GET    /api/v1/storage/usage           — X-Service-Key, ?owner_id
//   POST   /api/v1/storage/media           — X-Service-Key, multipart (file, owner_id, allow_video, bucket_id)
//   DELETE /api/v1/storage/media/{id}      — X-Service-Key, multipart/form (owner_id)
//   GET    /api/v1/storage/media/{id}      — public, anonymous download
//
// STORAGE_SERVICE_URL is the tunnel host with NO /api/v1/storage suffix
// (e.g. https://storage.example.workers.dev) — this module appends the
// prefix itself so health checks can still hit plain /health.
//
// Ownership: every call in this file either (a) is scoped to the signed-in
// user via getSession() and rejects if nobody is signed in — the "my..."
// functions, used by /cloud/* pages — or (b) re-checks getIsAdmin() itself,
// not just trusting that the calling route's own beforeLoad already gated
// it, because a server function has its own HTTP endpoint that can be
// called directly regardless of which page rendered the button — the
// "admin..." functions, used only by /admin/cloud. Never trust a client-
// supplied owner id for anything that writes or deletes.
import { createServerFn } from "@tanstack/react-start";
import { getSession } from "./auth-session.functions";
import { requireAdmin } from "./admin.functions";
import { DEFAULT_STORAGE_PLAN } from "./storage-plans";
import { effectivePlan, allowedMimeTypes, maintenanceMessage } from "./storage-settings";
import { loadEffectiveSettings } from "./storage-settings.functions";
import { formatBytes } from "./format";

const STORAGE_PREFIX = "/api/v1/storage";

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
  // Short, service-authored reason for a 4xx rejection (e.g. "File type not
  // allowed"). Never set for 5xx/network failures, which stay generic.
  detail?: string;
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

export interface StorageFile {
  key: string;
  name: string;
  size: number;
  updatedAt: string;
  contentType: string;
  ownerId: string | null;
  bucketId: string | null;
}

function mapFileRow(row: Record<string, unknown>): StorageFile {
  const key = String(row.key ?? row.id ?? "file");
  const original = [row.name, row.filename, row.file_name, row.original_name, row.original_filename, row.originalName, row.title]
    .find(value => typeof value === "string" && value.trim());
  return {
    key,
    name: typeof original === "string" ? original.trim() : "",
    size: Number(row.size ?? 0),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? row.created_at ?? ""),
    contentType: String(row.contentType ?? row.content_type ?? row.mime_type ?? ""),
    ownerId: row.ownerId != null ? String(row.ownerId) : row.owner_id != null ? String(row.owner_id) : null,
    bucketId: row.bucketId != null ? String(row.bucketId) : row.bucket_id != null ? String(row.bucket_id) : null,
  };
}

// Shared, unauthenticated: a liveness flag carries no per-user data, and
// every /cloud and /admin/cloud page needs it to know whether to even try.
export const getStorageStatus = createServerFn({ method: "GET" }).handler(async (): Promise<{ configured: boolean; online: boolean; detail: string }> => {
  if (!storageBase()) return { configured: false, online: false, detail: "not_configured" };
  // /health is a plain liveness check on the service root, unauthenticated —
  // deliberately NOT under STORAGE_PREFIX.
  const result = await storageFetch<unknown>("/health");
  return { configured: true, online: result.ok, detail: result.ok ? "online" : `unreachable_${result.status || "network"}` };
});

export interface StorageUsage {
  configured: boolean;
  bytesUsed: number;
  bytesQuota: number;
  requests: number;
  daily: Array<{ date: string; requests: number }>;
}

function mapUsage(result: StorageResult<Record<string, unknown>>, bytesQuota: number): StorageUsage {
  const data = (result.data && typeof result.data === "object" ? result.data : {}) as Record<string, unknown>;
  const bytesUsed = Number(data.bytesUsed ?? 0);
  const requests = Number(data.requests ?? 0);
  const rawDaily = [data.daily, data.history, data.series, data.days].find(Array.isArray) as Array<Record<string, unknown>> | undefined;
  const daily = (rawDaily ?? [])
    .map(row => ({ date: String(row.date ?? row.day ?? row.label ?? "").slice(0, 10), requests: Number(row.requests ?? row.count ?? row.total ?? 0) }))
    .filter(row => row.date);
  return { configured: result.configured && result.ok, bytesUsed, bytesQuota, requests, daily };
}

// --- User-scoped: every /cloud/* page. Never accept an owner id as input —
// it always comes from the verified session, never the client. -----------

async function requireSignedInUserId(): Promise<string> {
  const user = await getSession();
  if (!user) throw new Error("You must be signed in.");
  return user.id;
}

export const getMyStorageUsage = createServerFn({ method: "GET" }).handler(async (): Promise<StorageUsage> => {
  const userId = await requireSignedInUserId();
  // Per-user plans arrive with the quota engine (build step 3); until then
  // everyone is on the default plan, with its quota from the admin settings.
  const quota = effectivePlan(DEFAULT_STORAGE_PLAN, await loadEffectiveSettings());
  const result = await storageFetch<Record<string, unknown>>(`${STORAGE_PREFIX}/usage?owner_id=${encodeURIComponent(userId)}`);
  return mapUsage(result, quota.bytesQuota);
});

export const listMyStorageFiles = createServerFn({ method: "GET" }).handler(async (): Promise<{ configured: boolean; files: StorageFile[] }> => {
  const userId = await requireSignedInUserId();
  const result = await storageFetch<{ files: Array<Record<string, unknown>> }>(`${STORAGE_PREFIX}/files?limit=50&owner_id=${encodeURIComponent(userId)}`);
  const rows = (result.data?.files ?? []).map(mapFileRow);
  return { configured: result.configured && result.ok, files: rows };
});

export const deleteMyStorageFile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (typeof input !== "string" || !input.trim()) throw new Error("A file key is required");
    return input.trim();
  })
  .handler(async ({ data }): Promise<{ configured: boolean; ok: boolean }> => {
    const userId = await requireSignedInUserId();
    // The service requires owner_id as multipart/form-data on DELETE and
    // 404s if it doesn't match the file's stored owner — this is what
    // actually stops one user from deleting another user's file; the
    // server-derived userId here is what makes that check meaningful.
    const form = new FormData();
    form.set("owner_id", userId);
    const result = await storageFetch<unknown>(`${STORAGE_PREFIX}/media/${encodeURIComponent(data)}`, {
      method: "DELETE",
      body: form,
    });
    return { configured: result.configured, ok: result.ok };
  });

// Takes the browser's FormData directly (field "file") instead of a
// base64-encoded JSON payload — smaller over the wire (~33% less data) and
// lets the client drive real upload progress via XMLHttpRequest against
// this function's own URL, since fetch() has no upload progress event.
export const uploadMyStorageFile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("Expected form data");
    const file = input.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("A file is required");
    return input;
  })
  .handler(async ({ data }): Promise<{ configured: boolean; ok: boolean; id: string; error?: string }> => {
    const userId = await requireSignedInUserId();
    const file = data.get("file") as File;

    // Admin-controlled gates first, in order: storage maintenance mode, then
    // the effective per-file cap (plan cap, never above the global ceiling).
    // The same cap and the allowed MIME list are ALSO sent to the storage
    // service below, which re-checks them against the bytes it actually
    // receives — so a tampered client can't dodge them.
    const settings = await loadEffectiveSettings();
    if (settings.maintenance.enabled) {
      return { configured: true, ok: false, id: "", error: maintenanceMessage(settings) };
    }
    const plan = effectivePlan(DEFAULT_STORAGE_PLAN, settings);
    if (file.size > plan.maxUploadBytes) {
      const capped = settings.globalMaxUploadBytes < settings.planQuotas[plan.id].maxUploadBytes;
      return {
        configured: true,
        ok: false,
        id: "",
        error: capped
          ? `Uploads are limited to ${formatBytes(plan.maxUploadBytes)} per file right now.`
          : `File too large for the ${plan.label} plan (max ${formatBytes(plan.maxUploadBytes)}). Upgrade for larger uploads.`,
      };
    }

    const form = new FormData();
    form.set("file", file, file.name);
    form.set("owner_id", userId);
    form.set("max_bytes", String(plan.maxUploadBytes));
    form.set("allowed_mime", JSON.stringify(allowedMimeTypes(settings.allowedFileGroups)));
    const result = await storageFetch<Record<string, unknown>>(`${STORAGE_PREFIX}/media`, {
      method: "POST",
      body: form,
    });
    let id = "";
    let error: string | undefined;
    try {
      const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
      const body = asRecord(result.data);
      const nested = asRecord(body.file);
      id = String(body.id ?? body.key ?? body.media_id ?? nested.id ?? nested.key ?? "");
      if (typeof body.detail === "string") error = body.detail;
    } catch {
      id = "";
    }
    if (!result.ok && !error) error = result.detail;
    return { configured: result.configured, ok: result.ok, id, error };
  });

export const downloadMyStorageFile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (typeof input !== "string" || !input.trim()) throw new Error("A file key is required");
    return input.trim();
  })
  .handler(async ({ data }): Promise<{ ok: boolean; contentType: string; dataBase64: string }> => {
    // Downloads hit the storage service's public, anonymous-by-design
    // media/{id} route (the id itself is the access control, same as a
    // public S3/R2 object URL) — still requiring a session here at least
    // keeps this app's own download button off limits to signed-out
    // visitors, even though the underlying URL isn't secret.
    await requireSignedInUserId();
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

// --- Admin-scoped: /admin/cloud only. Re-checks getIsAdmin() itself rather
// than trusting the route's beforeLoad, because this function has its own
// callable HTTP endpoint independent of which page renders a button for it.

export const adminGetStorageUsage = createServerFn({ method: "GET" }).handler(async (): Promise<StorageUsage> => {
  await requireAdmin();
  const result = await storageFetch<Record<string, unknown>>(`${STORAGE_PREFIX}/usage`);
  return mapUsage(result, 0); // platform-wide total has no single plan quota to compare against
});

export const adminListStorageFiles = createServerFn({ method: "GET" }).handler(async (): Promise<{ configured: boolean; files: StorageFile[] }> => {
  await requireAdmin();
  const result = await storageFetch<{ files: Array<Record<string, unknown>> }>(`${STORAGE_PREFIX}/files?limit=50`);
  const rows = (result.data?.files ?? []).map(mapFileRow);
  return { configured: result.configured && result.ok, files: rows };
});

export const adminDeleteStorageFile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("A file key and owner are required");
    const { key, ownerId } = input as { key?: unknown; ownerId?: unknown };
    if (typeof key !== "string" || !key.trim()) throw new Error("A file key is required");
    if (typeof ownerId !== "string" || !ownerId.trim()) throw new Error("An owner id is required");
    return { key: key.trim(), ownerId: ownerId.trim() };
  })
  .handler(async ({ data }): Promise<{ configured: boolean; ok: boolean }> => {
    await requireAdmin();
    // The storage service requires the file's own stored owner_id to match
    // on delete, regardless of who's asking — admin must pass the file's
    // real owner (surfaced on every row from adminListStorageFiles), not
    // its own identity. There's no bypass for "any owner" by design; adding
    // one means touching coralz-storage, held for when it's actually needed.
    const form = new FormData();
    form.set("owner_id", data.ownerId);
    const result = await storageFetch<unknown>(`${STORAGE_PREFIX}/media/${encodeURIComponent(data.key)}`, {
      method: "DELETE",
      body: form,
    });
    return { configured: result.configured, ok: result.ok };
  });
