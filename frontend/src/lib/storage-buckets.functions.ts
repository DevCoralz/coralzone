// Server functions for Cloud buckets.
//
// Who owns what: CoralzOne's database owns the bucket LIST (name, owner, frozen),
// enforced by the gateway (plan limit, unique names, ownership, audit log). The
// storage service owns the FILES and knows each file's bucket id, so sizes and
// file counts come from it. These functions combine the two.
//
// Like every function in this app they re-check who is calling themselves:
// the "my..." ones need a signed-in user and never take an owner id from the
// browser; the "admin..." ones call requireAdmin() first.
import { createServerFn } from "@tanstack/react-start";
import { getSession } from "./auth-session.functions";
import { requireAdmin } from "./admin.functions";
import { mapFileRow, type StorageFile } from "./storage.functions";
import { loadMyQuota, QUOTA_UNAVAILABLE } from "./storage-quota.server";
import { loadEffectiveSettings } from "./storage-settings.server";
import { STORAGE_PREFIX, storageFetch } from "./storage-service.server";
import { fetchUsage, gateway, errorOf, parseBucket, parseRawAdminBucket, UNREACHABLE } from "./storage-buckets.server";
import {
  ADMIN_BUCKET_PAGE_SIZE, NEARLY_FULL_SCAN_CAP, bucketLimitFor, sortFullestFirst, toAdminRow, validateBucketName,
  type AdminBucketRow, type Bucket, type MyBucket, type RawAdminBucket,
} from "./storage-buckets";
import type { StoragePlanId } from "./storage-plans";

const UUID_LIKE = /^[0-9a-f-]{36}$/i;

function cleanId(input: unknown): string {
  if (typeof input !== "string" || !UUID_LIKE.test(input.trim())) throw new Error("A bucket id is required");
  return input.trim().toLowerCase();
}

async function requireUserId(): Promise<string> {
  const user = await getSession();
  if (!user) throw new Error("You must be signed in.");
  return user.id;
}

// ─── The signed-in user's own buckets ────────────────────────────────────────

export type MyBucketsResult =
  | { ok: true; buckets: MyBucket[]; plan: StoragePlanId; planLabel: string; limit: number | null; usageAvailable: boolean }
  | { ok: false; error: string };

export const listMyBuckets = createServerFn({ method: "GET" }).handler(async (): Promise<MyBucketsResult> => {
  await requireUserId();
  const context = await loadMyQuota();
  if (!context) return { ok: false, error: QUOTA_UNAVAILABLE };
  const reply = await gateway("/api/cloud/buckets");
  const list = Array.isArray(reply.body.buckets) ? reply.body.buckets.map(parseBucket).filter((b): b is Bucket => b !== null) : null;
  if (!reply.ok || !list) return { ok: false, error: UNREACHABLE };
  const usage = await fetchUsage(list.map(b => b.id), []);
  return {
    ok: true,
    buckets: list.map(b => ({ ...b, ...(usage?.buckets.get(b.id) ?? { files: 0, bytes: 0 }) })),
    plan: context.quota.plan,
    planLabel: context.quota.planLabel,
    limit: bucketLimitFor(context.quota.plan),
    usageAvailable: usage !== null,
  };
});

export const createMyBucket = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (typeof input !== "string") throw new Error("Give the bucket a name.");
    return input;
  })
  .handler(async ({ data }): Promise<{ ok: true; bucket: Bucket } | { ok: false; error: string }> => {
    await requireUserId();
    const named = validateBucketName(data);
    if (!named.ok) return { ok: false, error: named.error };
    const reply = await gateway("/api/cloud/buckets", { method: "POST", json: { name: named.name } });
    const bucket = reply.ok ? parseBucket(reply.body.bucket) : null;
    return bucket ? { ok: true, bucket } : { ok: false, error: errorOf(reply) };
  });

export const renameMyBucket = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Send a bucket and a new name.");
    const { id, name } = input as { id?: unknown; name?: unknown };
    if (typeof name !== "string") throw new Error("Give the bucket a name.");
    return { id: cleanId(id), name };
  })
  .handler(async ({ data }): Promise<{ ok: true; bucket: Bucket } | { ok: false; error: string }> => {
    await requireUserId();
    const named = validateBucketName(data.name);
    if (!named.ok) return { ok: false, error: named.error };
    const reply = await gateway("/api/cloud/buckets", { method: "PUT", json: { id: data.id, name: named.name } });
    const bucket = reply.ok ? parseBucket(reply.body.bucket) : null;
    return bucket ? { ok: true, bucket } : { ok: false, error: errorOf(reply) };
  });

// A bucket can only be deleted once it is empty. If the storage service can't
// be asked, the answer is "no": better a refused delete than orphaned files.
export const deleteMyBucket = createServerFn({ method: "POST" })
  .inputValidator(cleanId)
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await requireUserId();
    const mine = await gateway(`/api/cloud/buckets?id=${encodeURIComponent(data)}`);
    if (mine.status === 404) return { ok: false, error: "Bucket not found." };
    if (!mine.ok) return { ok: false, error: UNREACHABLE };
    const usage = await fetchUsage([data], []);
    if (!usage) return { ok: false, error: "We could not check what is in this bucket. Please try again." };
    const files = usage.buckets.get(data)?.files ?? 0;
    if (files > 0) return { ok: false, error: `This bucket still holds ${files.toLocaleString("en-NG")} file${files === 1 ? "" : "s"}. Delete them first.` };
    const reply = await gateway("/api/cloud/buckets", { method: "DELETE", json: { id: data } });
    return reply.ok ? { ok: true } : { ok: false, error: errorOf(reply) };
  });

// Files of one of the user's own buckets (ownership is checked twice: the
// bucket must be theirs, and the storage call is also scoped to their id).
export const listMyBucketFiles = createServerFn({ method: "POST" })
  .inputValidator(cleanId)
  .handler(async ({ data }): Promise<{ configured: boolean; files: StorageFile[] }> => {
    const userId = await requireUserId();
    const mine = await gateway(`/api/cloud/buckets?id=${encodeURIComponent(data)}`);
    if (!mine.ok) return { configured: true, files: [] };
    const result = await storageFetch<{ files: Array<Record<string, unknown>> }>(
      `${STORAGE_PREFIX}/files?limit=50&owner_id=${encodeURIComponent(userId)}&bucket_id=${encodeURIComponent(data)}`,
    );
    return { configured: result.configured && result.ok, files: (result.data?.files ?? []).map(mapFileRow) };
  });

// ─── Admin ───────────────────────────────────────────────────────────────────

export type AdminBucketList =
  | { ok: true; rows: AdminBucketRow[]; total: number; page: number; pageSize: number; usageAvailable: boolean; truncated: boolean }
  | { ok: false; error: string };

export const adminListBuckets = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const page = typeof v.page === "number" && Number.isInteger(v.page) && v.page >= 1 && v.page <= 100_000 ? v.page : 1;
    return {
      q: typeof v.q === "string" ? v.q.slice(0, 100) : "",
      frozenOnly: v.frozenOnly === true,
      nearlyFull: v.nearlyFull === true,
      page,
    };
  })
  .handler(async ({ data }): Promise<AdminBucketList> => {
    await requireAdmin();
    const settings = await loadEffectiveSettings();
    const status = data.frozenOnly ? "frozen" : "all";
    const fetchPage = async (limit: number, offset: number): Promise<{ raw: RawAdminBucket[]; total: number } | { error: string }> => {
      const params = new URLSearchParams({ q: data.q, status, limit: String(limit), offset: String(offset) });
      const reply = await gateway(`/api/admin/cloud-buckets?${params.toString()}`);
      const raw = Array.isArray(reply.body.buckets) ? reply.body.buckets.map(parseRawAdminBucket).filter((b): b is RawAdminBucket => b !== null) : null;
      return reply.ok && raw ? { raw, total: Number(reply.body.total ?? raw.length) } : { error: errorOf(reply) };
    };
    const build = async (raws: RawAdminBucket[]) => {
      const usage = await fetchUsage(raws.map(b => b.id), raws.map(b => b.owner.id));
      return {
        usage,
        rows: raws.map(b => toAdminRow(b, usage?.buckets.get(b.id) ?? null, usage ? usage.owners.get(b.owner.id) ?? 0 : null, settings)),
      };
    };

    if (!data.nearlyFull) {
      const first = await fetchPage(ADMIN_BUCKET_PAGE_SIZE, (data.page - 1) * ADMIN_BUCKET_PAGE_SIZE);
      if ("error" in first) return { ok: false, error: first.error };
      const built = await build(first.raw);
      return { ok: true, rows: built.rows, total: first.total, page: data.page, pageSize: ADMIN_BUCKET_PAGE_SIZE, usageAvailable: built.usage !== null, truncated: false };
    }

    // "Nearly full" depends on data from the storage service, so it cannot be
    // filtered in the database: read every bucket (up to a cap), then filter.
    const all: RawAdminBucket[] = [];
    let total = 0;
    for (let offset = 0; offset < NEARLY_FULL_SCAN_CAP; offset += 100) {
      const chunk = await fetchPage(100, offset);
      if ("error" in chunk) return { ok: false, error: chunk.error };
      total = chunk.total;
      all.push(...chunk.raw);
      if (all.length >= total || chunk.raw.length === 0) break;
    }
    const built = await build(all);
    if (!built.usage) return { ok: false, error: "The storage service could not be reached, so fullness can't be worked out right now." };
    const full = sortFullestFirst(built.rows.filter(r => r.nearlyFull));
    const start = (data.page - 1) * ADMIN_BUCKET_PAGE_SIZE;
    return {
      ok: true, rows: full.slice(start, start + ADMIN_BUCKET_PAGE_SIZE), total: full.length, page: data.page,
      pageSize: ADMIN_BUCKET_PAGE_SIZE, usageAvailable: true, truncated: total > all.length,
    };
  });

export type AdminBucketDetail =
  | { ok: true; row: AdminBucketRow; files: StorageFile[]; filesShown: number; storageOnline: boolean }
  | { ok: false; error: string; notFound?: boolean };

export const adminGetBucketDetail = createServerFn({ method: "POST" })
  .inputValidator(cleanId)
  .handler(async ({ data }): Promise<AdminBucketDetail> => {
    await requireAdmin();
    const reply = await gateway(`/api/admin/cloud-buckets?id=${encodeURIComponent(data)}`);
    if (reply.status === 404) return { ok: false, error: "Bucket not found.", notFound: true };
    const raw = reply.ok ? parseRawAdminBucket(reply.body.bucket) : null;
    if (!raw) return { ok: false, error: errorOf(reply) };
    const [settings, usage, listing] = await Promise.all([
      loadEffectiveSettings(),
      fetchUsage([raw.id], [raw.owner.id]),
      storageFetch<{ files: Array<Record<string, unknown>> }>(`${STORAGE_PREFIX}/files?limit=50&owner_id=${encodeURIComponent(raw.owner.id)}&bucket_id=${encodeURIComponent(raw.id)}`),
    ]);
    const row = toAdminRow(raw, usage?.buckets.get(raw.id) ?? null, usage ? usage.owners.get(raw.owner.id) ?? 0 : null, settings);
    const files = (listing.data?.files ?? []).map(mapFileRow);
    return { ok: true, row, files, filesShown: files.length, storageOnline: usage !== null && listing.ok };
  });

export const adminSetBucketFrozen = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Send a bucket and a state.");
    const { id, frozen } = input as { id?: unknown; frozen?: unknown };
    if (typeof frozen !== "boolean") throw new Error("Frozen must be true or false.");
    return { id: cleanId(id), frozen };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await requireAdmin();
    const reply = await gateway("/api/admin/cloud-buckets", { method: "PUT", json: data });
    return reply.ok ? { ok: true } : { ok: false, error: errorOf(reply) };
  });

// Deleting a bucket is two steps so no serverless time limit can cut it in half.
//  1. adminEmptyBucketStep, called again and again by the page: freezes the
//     bucket (no new uploads), then deletes one batch of its files.
//  2. adminRemoveBucket, once nothing is left: removes the bucket itself.
export const adminEmptyBucketStep = createServerFn({ method: "POST" })
  .inputValidator(cleanId)
  .handler(async ({ data }): Promise<{ ok: boolean; deleted: number; remaining: number; error?: string }> => {
    await requireAdmin();
    const found = await gateway(`/api/admin/cloud-buckets?id=${encodeURIComponent(data)}`);
    const raw = found.ok ? parseRawAdminBucket(found.body.bucket) : null;
    if (!raw) return { ok: false, deleted: 0, remaining: 0, error: found.status === 404 ? "Bucket not found." : errorOf(found) };
    // Freeze first, so nobody can add files while it is being emptied.
    const frozen = await gateway("/api/admin/cloud-buckets", { method: "PUT", json: { id: data, frozen: true } });
    if (!frozen.ok) return { ok: false, deleted: 0, remaining: 0, error: errorOf(frozen) };
    const result = await storageFetch<{ deleted?: number; remaining?: number }>(
      `${STORAGE_PREFIX}/buckets/${encodeURIComponent(data)}/files?owner_id=${encodeURIComponent(raw.owner.id)}&limit=50`,
      { method: "DELETE" },
    );
    if (!result.ok || !result.data) {
      return { ok: false, deleted: 0, remaining: 0, error: result.detail ?? "The storage service could not delete these files. Nothing was lost; try again." };
    }
    return { ok: true, deleted: Number(result.data.deleted ?? 0), remaining: Number(result.data.remaining ?? 0) };
  });

export const adminRemoveBucket = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Send a bucket.");
    const { id, filesDeleted } = input as { id?: unknown; filesDeleted?: unknown };
    const n = typeof filesDeleted === "number" && Number.isSafeInteger(filesDeleted) && filesDeleted >= 0 ? filesDeleted : 0;
    return { id: cleanId(id), filesDeleted: n };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await requireAdmin();
    // Never remove a bucket that still holds files, whatever the page claims.
    const usage = await fetchUsage([data.id], []);
    if (!usage) return { ok: false, error: "The storage service could not be reached, so the bucket was not removed." };
    const left = usage.buckets.get(data.id)?.files ?? 0;
    if (left > 0) return { ok: false, error: `${left.toLocaleString("en-NG")} file${left === 1 ? " is" : "s are"} still inside. Empty it first.` };
    const reply = await gateway("/api/admin/cloud-buckets", { method: "DELETE", json: data });
    return reply.ok ? { ok: true } : { ok: false, error: errorOf(reply) };
  });
