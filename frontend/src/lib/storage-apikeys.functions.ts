// Server functions for Cloud API keys.
//
// Who owns what: the gateway owns the keys (it hashes them, enforces the plan
// limit, checks bucket scope and writes the admin log). These functions only
// check who is calling, pass the request on and shape the answer.
//
// The "my..." ones need a signed in user and never take an owner id from the
// browser. The "admin..." ones call requireAdmin() first, because each server
// function has its own HTTP endpoint and the page guard alone would not
// protect it. The full key is returned by createMyApiKey and nowhere else.
import { createServerFn } from "@tanstack/react-start";
import { getSession } from "./auth-session.functions";
import { requireAdmin } from "./admin.functions";
import { gateway, errorOf } from "./storage-buckets.server";
import { STORAGE_PLANS, isStoragePlanId, type StoragePlanId } from "./storage-plans";
import {
  ADMIN_KEY_PAGE_SIZE, API_RATE_DEFAULTS, KEY_PREFIX, RATE_LIMIT_RANGE, isKeyStatusFilter, parseApiKey, parseApiKeys, parseRawAdminApiKey, toAdminKeyRow, validateKeyName,
  type AdminApiKeyRow, type ApiKey, type RawAdminApiKey,
} from "./storage-apikeys";

const UUID_LIKE = /^[0-9a-f-]{36}$/i;

function cleanId(input: unknown): string {
  if (typeof input !== "string" || !UUID_LIKE.test(input.trim())) throw new Error("An id is required");
  return input.trim().toLowerCase();
}

async function requireUserId(): Promise<string> {
  const user = await getSession();
  if (!user) throw new Error("You must be signed in.");
  return user.id;
}

// ─── The signed in user's own keys ───────────────────────────────────────────

export type MyApiKeysResult =
  | { ok: true; keys: ApiKey[]; plan: StoragePlanId; planLabel: string; keyLimit: number | null; activeKeys: number; rateLimitPerMinute: number; banned: boolean }
  | { ok: false; error: string };

export const listMyApiKeys = createServerFn({ method: "GET" }).handler(async (): Promise<MyApiKeysResult> => {
  await requireUserId();
  const reply = await gateway("/api/cloud/api-keys");
  const b = reply.body;
  if (!reply.ok || !Array.isArray(b.keys) || typeof b.plan !== "string" || !isStoragePlanId(b.plan)) return { ok: false, error: errorOf(reply) };
  return {
    ok: true,
    keys: parseApiKeys(b.keys),
    plan: b.plan,
    planLabel: STORAGE_PLANS[b.plan].label,
    keyLimit: typeof b.keyLimit === "number" ? b.keyLimit : null,
    activeKeys: typeof b.activeKeys === "number" ? b.activeKeys : 0,
    rateLimitPerMinute: typeof b.rateLimitPerMinute === "number" ? b.rateLimitPerMinute : API_RATE_DEFAULTS[b.plan],
    banned: b.banned === true,
  };
});

// The only place a full key ever reaches the browser. It is shown once and is
// not stored anywhere that can be read back.
export const createMyApiKey = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Give the key a name.");
    const { name, bucketId } = input as { name?: unknown; bucketId?: unknown };
    if (typeof name !== "string") throw new Error("Give the key a name.");
    return { name, bucketId: bucketId === null || bucketId === undefined || bucketId === "" ? null : cleanId(bucketId) };
  })
  .handler(async ({ data }): Promise<{ ok: true; key: ApiKey; secret: string } | { ok: false; error: string }> => {
    await requireUserId();
    const named = validateKeyName(data.name);
    if (!named.ok) return { ok: false, error: named.error };
    const reply = await gateway("/api/cloud/api-keys", { method: "POST", json: { name: named.name, bucketId: data.bucketId } });
    const key = reply.ok ? parseApiKey(reply.body.key) : null;
    const secret = reply.ok && typeof reply.body.secret === "string" && reply.body.secret.startsWith(KEY_PREFIX) ? reply.body.secret : null;
    return key && secret ? { ok: true, key, secret } : { ok: false, error: errorOf(reply) };
  });

export const revokeMyApiKey = createServerFn({ method: "POST" })
  .inputValidator(cleanId)
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await requireUserId();
    const reply = await gateway("/api/cloud/api-keys", { method: "DELETE", json: { id: data } });
    return reply.ok ? { ok: true } : { ok: false, error: errorOf(reply) };
  });

// ─── Admin ───────────────────────────────────────────────────────────────────

export type AdminApiKeyList =
  | { ok: true; rows: AdminApiKeyRow[]; total: number; page: number; pageSize: number }
  | { ok: false; error: string };

export const adminListApiKeys = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const page = typeof v.page === "number" && Number.isInteger(v.page) && v.page >= 1 && v.page <= 100_000 ? v.page : 1;
    return { q: typeof v.q === "string" ? v.q.slice(0, 100) : "", status: isKeyStatusFilter(v.status) ? v.status : "all", page };
  })
  .handler(async ({ data }): Promise<AdminApiKeyList> => {
    await requireAdmin();
    const params = new URLSearchParams({ q: data.q, status: data.status, limit: String(ADMIN_KEY_PAGE_SIZE), offset: String((data.page - 1) * ADMIN_KEY_PAGE_SIZE) });
    const reply = await gateway(`/api/admin/cloud-api-keys?${params.toString()}`);
    const raw = Array.isArray(reply.body.keys) ? reply.body.keys.map(parseRawAdminApiKey).filter((k): k is RawAdminApiKey => k !== null) : null;
    if (!reply.ok || !raw) return { ok: false, error: errorOf(reply) };
    return { ok: true, rows: raw.map(toAdminKeyRow), total: Number(reply.body.total ?? raw.length), page: data.page, pageSize: ADMIN_KEY_PAGE_SIZE };
  });

export type AdminApiKeyResult = { ok: true; row: AdminApiKeyRow } | { ok: false; error: string; notFound?: boolean };

export const adminGetApiKey = createServerFn({ method: "POST" })
  .inputValidator(cleanId)
  .handler(async ({ data }): Promise<AdminApiKeyResult> => {
    await requireAdmin();
    const reply = await gateway(`/api/admin/cloud-api-keys?id=${encodeURIComponent(data)}`);
    if (reply.status === 404) return { ok: false, error: "Key not found.", notFound: true };
    const raw = reply.ok ? parseRawAdminApiKey(reply.body.key) : null;
    return raw ? { ok: true, row: toAdminKeyRow(raw) } : { ok: false, error: errorOf(reply) };
  });

export const adminRevokeApiKey = createServerFn({ method: "POST" })
  .inputValidator(cleanId)
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await requireAdmin();
    const reply = await gateway("/api/admin/cloud-api-keys", { method: "PUT", json: { action: "revoke", id: data } });
    return reply.ok ? { ok: true } : { ok: false, error: errorOf(reply) };
  });

// value null = follow the plan's default.
export const adminSetApiKeyRateLimit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Send a key and a limit.");
    const { id, value } = input as { id?: unknown; value?: unknown };
    if (value !== null && !(typeof value === "number" && Number.isSafeInteger(value) && value >= RATE_LIMIT_RANGE.min && value <= RATE_LIMIT_RANGE.max)) {
      throw new Error("Rate limit out of range.");
    }
    return { id: cleanId(id), value: value as number | null };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await requireAdmin();
    const reply = await gateway("/api/admin/cloud-api-keys", { method: "PUT", json: { action: "rateLimit", id: data.id, rateLimitPerMinute: data.value } });
    return reply.ok ? { ok: true } : { ok: false, error: errorOf(reply) };
  });

export const adminRevokeAllUserKeys = createServerFn({ method: "POST" })
  .inputValidator(cleanId)
  .handler(async ({ data }): Promise<{ ok: true; revoked: number } | { ok: false; error: string }> => {
    await requireAdmin();
    const reply = await gateway("/api/admin/cloud-api-keys", { method: "PUT", json: { action: "revokeAll", userId: data } });
    return reply.ok ? { ok: true, revoked: typeof reply.body.revoked === "number" ? reply.body.revoked : 0 } : { ok: false, error: errorOf(reply) };
  });
