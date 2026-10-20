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
//   POST   /api/v1/storage/uploads         — X-Service-Key, JSON: opens a chunked upload (big files)
//   POST   /api/v1/storage/uploads/{id}/complete — X-Service-Key, JSON (owner_id): starts processing
//   DELETE /api/v1/storage/uploads/{id}     — X-Service-Key + ?owner_id=, cancels a session
//   (chunks and status go browser to storage with a one time token, see chunked-upload.ts)
//   DELETE /api/v1/storage/media/{id}      — X-Service-Key, multipart/form (owner_id)
//   GET    /api/v1/storage/media/{id}      — public, anonymous download
//
// STORAGE_PUBLIC_URL (optional) is the address browsers use to reach the storage
// service for chunked uploads. It defaults to STORAGE_SERVICE_URL. It must be https.
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
import { allowedMimeTypes } from "./storage-settings";
import { checkUpload, summarizeQuota, type QuotaSummary } from "./storage-quota";
import { loadMyQuota, QUOTA_UNAVAILABLE } from "./storage-quota.server";
import { loadUsableBucket } from "./storage-buckets.server";
import { STORAGE_PREFIX, storageBase, storagePublicBase, storageFetch, type StorageResult } from "./storage-service.server";

export interface StorageFile {
  key: string;
  name: string;
  size: number;
  updatedAt: string;
  contentType: string;
  ownerId: string | null;
  bucketId: string | null;
}

export function mapFileRow(row: Record<string, unknown>): StorageFile {
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
  // The signed-in user's plan and limits; null on the admin (platform-wide)
  // view and when the entitlement could not be verified.
  access: QuotaSummary | null;
}

function mapUsage(result: StorageResult<Record<string, unknown>>, bytesQuota: number, access: QuotaSummary | null): StorageUsage {
  const data = (result.data && typeof result.data === "object" ? result.data : {}) as Record<string, unknown>;
  const bytesUsed = Number(data.bytesUsed ?? 0);
  const requests = Number(data.requests ?? 0);
  const rawDaily = [data.daily, data.history, data.series, data.days].find(Array.isArray) as Array<Record<string, unknown>> | undefined;
  const daily = (rawDaily ?? [])
    .map(row => ({ date: String(row.date ?? row.day ?? row.label ?? "").slice(0, 10), requests: Number(row.requests ?? row.count ?? row.total ?? 0) }))
    .filter(row => row.date);
  return { configured: result.configured && result.ok, bytesUsed, bytesQuota, requests, daily, access };
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
  // The quota engine: this user's plan + extra storage + manual limits, over
  // the live admin settings. null = could not verify, shown as "no plan".
  const context = await loadMyQuota();
  const result = await storageFetch<Record<string, unknown>>(`${STORAGE_PREFIX}/usage?owner_id=${encodeURIComponent(userId)}`);
  return mapUsage(result, context?.quota.bytesQuota ?? 0, context ? summarizeQuota(context.quota) : null);
});

// Light call for the upload page: plan, per-file limit and any block, without
// touching the storage service. Lets the browser refuse an oversized file
// before sending gigabytes the server would only reject.
export const getMyStorageAccess = createServerFn({ method: "GET" }).handler(async (): Promise<QuotaSummary | null> => {
  await requireSignedInUserId();
  const context = await loadMyQuota();
  return context ? summarizeQuota(context.quota) : null;
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
    // A banned user's files stay put for admin review: no deleting either.
    const context = await loadMyQuota();
    if (!context || context.quota.banned) return { configured: true, ok: false };
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

// Uploads no longer pass through this server: Vercel refuses bodies over about
// 4.5 MB. Instead the browser asks startMyUpload for a session, sends the file
// to the storage service in chunks (chunked-upload.ts) and calls finishMyUpload.
// Both functions run the quota engine, so a ban or freeze cannot be skipped.
export interface MyUploadSession {
  id: string;
  token: string;
  chunkSize: number;
  endpoint: string;
}

export const startMyUpload = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("A file name and size are required");
    const { name, size, bucketId } = input as { name?: unknown; size?: unknown; bucketId?: unknown };
    if (typeof name !== "string" || !name.trim() || name.length > 255) throw new Error("A valid file name is required");
    if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 1) throw new Error("A valid file size is required");
    if (bucketId !== undefined && bucketId !== null && (typeof bucketId !== "string" || !/^[0-9a-f-]{36}$/i.test(bucketId))) throw new Error("Unknown bucket");
    return { name: name.trim(), size, bucketId: typeof bucketId === "string" ? bucketId.toLowerCase() : null };
  })
  .handler(async ({ data }): Promise<{ configured: boolean; ok: boolean; session?: MyUploadSession; error?: string }> => {
    const userId = await requireSignedInUserId();

    // Order of checks: maintenance, banned, frozen, per file limit, free space.
    // Fails CLOSED if the plan can't be verified.
    const context = await loadMyQuota();
    if (!context) return { configured: true, ok: false, error: QUOTA_UNAVAILABLE };
    const { settings, quota } = context;
    if (quota.blockMessage) return { configured: true, ok: false, error: quota.blockMessage };

    if (!storageBase()) return { configured: false, ok: false };
    const publicBase = storagePublicBase();
    if (!publicBase) return { configured: true, ok: false, error: "Uploads are not available right now. Please contact support." };

    const usage = await storageFetch<Record<string, unknown>>(`${STORAGE_PREFIX}/usage?owner_id=${encodeURIComponent(userId)}`);
    if (!usage.ok) return { configured: true, ok: false, error: "We could not check your free storage space. Please try again." };
    const bytesUsed = Number((usage.data as Record<string, unknown> | null)?.bytesUsed ?? 0);
    const decision = checkUpload(quota, settings, data.size, Number.isFinite(bytesUsed) ? bytesUsed : 0);
    if (!decision.ok) return { configured: true, ok: false, error: decision.error };

    // A chosen bucket must be the user's own and not frozen by an admin.
    if (data.bucketId) {
      const bucket = await loadUsableBucket(data.bucketId);
      if (!bucket.ok) return { configured: true, ok: false, error: bucket.error };
    }

    // Allowed groups minus any single type an admin blocked. If nothing is left,
    // say so plainly: the storage service would only answer with a vague error.
    const allowedMime = allowedMimeTypes(settings.allowedFileGroups, settings.blockedMimeTypes);
    if (allowedMime.length === 0) return { configured: true, ok: false, error: "Uploads are switched off for every file type right now." };

    // The storage service checks the same limits again, and also counts the
    // uploads this user already has open, so two at once cannot overfill the quota.
    const result = await storageFetch<Record<string, unknown>>(`${STORAGE_PREFIX}/uploads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        owner_id: userId,
        filename: data.name,
        size: data.size,
        max_bytes: quota.maxUploadBytes,
        quota_bytes: quota.bytesQuota,
        allowed_mime: allowedMime,
        bucket_id: data.bucketId,
      }),
    });
    const body = result.data && typeof result.data === "object" ? result.data : {};
    const { id, token, chunkSize } = body as { id?: unknown; token?: unknown; chunkSize?: unknown };
    if (!result.ok || typeof id !== "string" || typeof token !== "string" || typeof chunkSize !== "number") {
      return { configured: result.configured, ok: false, error: result.detail ?? "We could not start the upload. Please try again." };
    }
    return { configured: true, ok: true, session: { id, token, chunkSize, endpoint: `${publicBase}${STORAGE_PREFIX}/uploads/${encodeURIComponent(id)}` } };
  });

export const finishMyUpload = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const v = (input && typeof input === "object" ? input : {}) as { uploadId?: unknown; bucketId?: unknown };
    if (typeof v.uploadId !== "string" || !/^[0-9a-f-]{36}$/.test(v.uploadId.trim())) throw new Error("An upload id is required");
    if (v.bucketId !== undefined && v.bucketId !== null && (typeof v.bucketId !== "string" || !/^[0-9a-f-]{36}$/i.test(v.bucketId))) throw new Error("Unknown bucket");
    return { uploadId: v.uploadId.trim(), bucketId: typeof v.bucketId === "string" ? v.bucketId.toLowerCase() : null };
  })
  .handler(async ({ data: input }): Promise<{ ok: boolean; error?: string; retry?: boolean }> => {
    const data = input.uploadId;
    const userId = await requireSignedInUserId();

    // Check again: the user may have been banned or frozen, or maintenance
    // switched on, while a long upload was running. Nothing gets stored then.
    const context = await loadMyQuota();
    if (!context) return { ok: false, retry: true, error: QUOTA_UNAVAILABLE };
    if (context.quota.blockMessage) {
      await storageFetch<unknown>(`${STORAGE_PREFIX}/uploads/${data}?owner_id=${encodeURIComponent(userId)}`, { method: "DELETE" });
      return { ok: false, error: context.quota.blockMessage };
    }

    // The bucket may have been frozen or deleted while a long upload ran.
    if (input.bucketId) {
      const bucket = await loadUsableBucket(input.bucketId);
      // A hiccup on our side must not throw away a finished upload (it can be
      // gigabytes): keep it and let the browser ask again. Only a bucket that is
      // really gone or frozen cancels the upload.
      if (!bucket.ok && bucket.transient) return { ok: false, retry: true, error: bucket.error };
      if (!bucket.ok) {
        await storageFetch<unknown>(`${STORAGE_PREFIX}/uploads/${data}?owner_id=${encodeURIComponent(userId)}`, { method: "DELETE" });
        return { ok: false, error: bucket.error };
      }
    }

    // expect_bucket makes the storage service refuse unless this is the bucket
    // the upload was started for, so the check above cannot be dodged by
    // claiming a different bucket here.
    const result = await storageFetch<unknown>(`${STORAGE_PREFIX}/uploads/${data}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner_id: userId, expect_bucket: true, bucket_id: input.bucketId }),
    });
    if (result.ok) return { ok: true };
    // The storage service says this upload was started for another bucket: it can
    // never be finished, so free its partial file now instead of waiting for it to expire.
    if (result.status === 409 && result.detail?.includes("different bucket")) {
      await storageFetch<unknown>(`${STORAGE_PREFIX}/uploads/${data}?owner_id=${encodeURIComponent(userId)}`, { method: "DELETE" });
    }
    // A 5xx or a dropped connection is worth another go; a 4xx is final.
    return { ok: false, retry: result.status === 0 || result.status >= 500, error: result.detail ?? "We could not finish the upload. Please try again." };
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
    // Banned users lose downloads through the app too (their files are kept
    // for admin review). Fails closed if the plan can't be verified.
    const context = await loadMyQuota();
    if (!context || context.quota.banned) return { ok: false, contentType: "", dataBase64: "" };
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
  return mapUsage(result, 0, null); // platform-wide total has no single plan quota to compare against
});

// Listing and removing files as an admin moved to storage-files.functions.ts in build
// step 7: it adds search, filters, flags and an admin log entry for every removal.
