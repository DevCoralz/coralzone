// Rules for Cloud API keys: how a key looks, what it may be called, how many a
// plan allows, how fast it may be used, and the shape of every request that
// touches keys. Hand written with no dependencies beyond node:crypto so
// `node --test` can run it. This is the real check; src/lib/storage-apikeys.ts
// only copies the constants for the pages, and both test suites pin them.
import { createHash, randomBytes } from "node:crypto";
import { isUuid } from "./storage-quota-schema.js";
import { ADMIN_LIST_LIMIT, ADMIN_SEARCH_MAX } from "./storage-bucket-schema.js";

export const KEY_PREFIX = "cz_live_";
// What is kept in clear and shown in lists: the prefix plus four characters.
export const KEY_SHOWN_LENGTH = 12;
export const KEY_NAME_MAX = 60;
const KEY_BODY_HEX = 48;
const KEY_RE = new RegExp(`^${KEY_PREFIX}[0-9a-f]{${KEY_BODY_HEX}}$`);

// Active keys each plan includes. null = unlimited. Keep in sync with
// apiKeyLimit in src/lib/storage-plans.ts.
export const API_KEY_LIMITS = { starter: 1, pro: 5, scale: null };
// Requests per minute for one key when an admin has not set a custom limit.
// Keep in sync with API_RATE_DEFAULTS in src/lib/storage-apikeys.ts.
export const API_RATE_DEFAULTS = { starter: 60, pro: 300, scale: 1200 };
export const RATE_LIMIT_RANGE = { min: 1, max: 10_000 };

export const KEY_STATUSES = ["all", "active", "revoked"];
export const KEY_LIST_LIMIT = ADMIN_LIST_LIMIT;

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function apiKeyLimitFor(plan) {
  return hasOwn(API_KEY_LIMITS, plan) ? API_KEY_LIMITS[plan] : API_KEY_LIMITS.starter;
}

// A custom limit wins; otherwise the plan's default (unknown plans get Starter's).
export function rateLimitFor(plan, custom) {
  if (Number.isSafeInteger(custom) && custom >= RATE_LIMIT_RANGE.min) return custom;
  return hasOwn(API_RATE_DEFAULTS, plan) ? API_RATE_DEFAULTS[plan] : API_RATE_DEFAULTS.starter;
}

// ─── The key itself ──────────────────────────────────────────────────────────

// Keys carry 192 random bits, so a plain SHA-256 is enough to store: there is
// nothing to brute force, and rotating SESSION_SECRET never breaks a key.
export function hashApiKey(secret) {
  return createHash("sha256").update(secret).digest("hex");
}

export function looksLikeApiKey(value) {
  return typeof value === "string" && KEY_RE.test(value);
}

// The secret is shown to its owner once and never stored: only the hash and
// the short prefix are.
export function newApiKey() {
  const secret = `${KEY_PREFIX}${randomBytes(KEY_BODY_HEX / 2).toString("hex")}`;
  return { secret, prefix: secret.slice(0, KEY_SHOWN_LENGTH), hash: hashApiKey(secret) };
}

// ─── Requests ────────────────────────────────────────────────────────────────

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;

export function validateKeyName(input) {
  if (typeof input !== "string") return { ok: false, error: "Give the key a name." };
  const name = input.replace(/\s+/g, " ").trim();
  if (name.length === 0) return { ok: false, error: "Give the key a name." };
  if (name.length > KEY_NAME_MAX) return { ok: false, error: `Key names can be at most ${KEY_NAME_MAX} characters.` };
  if (!NAME_RE.test(name)) return { ok: false, error: "Use letters, numbers, spaces, dots, dashes and underscores, starting with a letter or number." };
  return { ok: true, name };
}

// Body of POST /api/cloud/api-keys  { name, bucketId? }. A key can be limited
// to one bucket; no bucketId means all of the owner's buckets.
export function validateCreateKey(body) {
  if (!isPlainObject(body)) return { ok: false, error: "Send a key name." };
  const named = validateKeyName(body.name);
  if (!named.ok) return named;
  const raw = body.bucketId;
  if (raw === undefined || raw === null || raw === "") return { ok: true, name: named.name, bucketId: null };
  if (!isUuid(raw)) return { ok: false, error: "Unknown bucket." };
  return { ok: true, name: named.name, bucketId: raw.toLowerCase() };
}

// Body of DELETE /api/cloud/api-keys  { id }
export function validateKeyRef(body) {
  if (!isPlainObject(body) || !isUuid(body.id)) return { ok: false, error: "Unknown key." };
  return { ok: true, id: body.id.toLowerCase() };
}

// Body of PUT /api/admin/cloud-api-keys
//   { action: "revoke", id }
//   { action: "rateLimit", id, rateLimitPerMinute }   number, or null = plan default
//   { action: "revokeAll", userId }
export function validateAdminKeyAction(body) {
  if (!isPlainObject(body)) return { ok: false, error: "Send an action." };
  if (body.action === "revoke") {
    const ref = validateKeyRef(body);
    return ref.ok ? { ok: true, action: "revoke", id: ref.id } : ref;
  }
  if (body.action === "rateLimit") {
    const ref = validateKeyRef(body);
    if (!ref.ok) return ref;
    const v = body.rateLimitPerMinute;
    if (v !== null && !(Number.isSafeInteger(v) && v >= RATE_LIMIT_RANGE.min && v <= RATE_LIMIT_RANGE.max)) {
      return { ok: false, error: `Rate limit must be between ${RATE_LIMIT_RANGE.min} and ${RATE_LIMIT_RANGE.max.toLocaleString("en-US")} requests a minute, or empty to follow the plan.` };
    }
    return { ok: true, action: "rateLimit", id: ref.id, rateLimitPerMinute: v };
  }
  if (body.action === "revokeAll") {
    if (!isUuid(body.userId)) return { ok: false, error: "Unknown user." };
    return { ok: true, action: "revokeAll", userId: body.userId.toLowerCase() };
  }
  return { ok: false, error: "Unknown action." };
}

// Query string of GET /api/admin/cloud-api-keys. Bad values fall back to the
// defaults, because this is a read only list.
export function parseKeyListQuery(params) {
  const rawQ = (params.get("q") ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const status = KEY_STATUSES.includes(params.get("status")) ? params.get("status") : "all";
  const limitRaw = Number(params.get("limit"));
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1 ? Math.min(limitRaw, KEY_LIST_LIMIT.max) : KEY_LIST_LIMIT.default;
  const offsetRaw = Number(params.get("offset"));
  const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 && offsetRaw <= 1_000_000 ? offsetRaw : 0;
  return { q: rawQ.slice(0, ADMIN_SEARCH_MAX), status, limit, offset };
}

// Query string of GET /api/v1/files.
export const V1_FILES_LIMIT = { default: 50, max: 100 };

export function parseV1FilesQuery(params) {
  const limitRaw = Number(params.get("limit"));
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1 ? Math.min(limitRaw, V1_FILES_LIMIT.max) : V1_FILES_LIMIT.default;
  const offsetRaw = Number(params.get("offset"));
  const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 && offsetRaw <= 1_000_000 ? offsetRaw : 0;
  const bucket = params.get("bucket_id");
  if (bucket === null || bucket === "") return { ok: true, limit, offset, bucketId: null };
  if (!isUuid(bucket)) return { ok: false, error: "bucket_id must be a bucket id." };
  return { ok: true, limit, offset, bucketId: bucket.toLowerCase() };
}

// What the public API says about one file. Only these fields leave the
// service: no owner id, no storage internals.
export function toPublicFile(row) {
  return {
    id: String(row?.key ?? ""),
    name: typeof row?.name === "string" ? row.name : "",
    size: Number.isFinite(row?.size) ? row.size : 0,
    contentType: typeof row?.mimeType === "string" ? row.mimeType : "",
    kind: typeof row?.kind === "string" ? row.kind : "",
    bucketId: typeof row?.bucketId === "string" ? row.bucketId : null,
    createdAt: typeof row?.updatedAt === "string" ? row.updatedAt : null,
  };
}

// One line for the admin history. Same idea as summarizeAction for user
// controls: only a short sentence reaches the page, never the raw details.
export function summarizeKeyAction(action, detailsText) {
  let details = {};
  try {
    const parsed = JSON.parse(String(detailsText ?? ""));
    if (isPlainObject(parsed)) details = parsed;
  } catch {
    details = {};
  }
  if (action === "cloud.apikey.revoke") return "Revoked an API key";
  if (action === "cloud.apikey.revoke_all") {
    const n = Number.isSafeInteger(details.count) ? details.count : null;
    return n === null ? "Revoked all API keys" : `Revoked ${n} API key${n === 1 ? "" : "s"}`;
  }
  if (action === "cloud.apikey.ratelimit") {
    const to = details.to;
    return Number.isSafeInteger(to) ? `Set an API key rate limit to ${to} a minute` : "Set an API key to follow its plan's rate limit";
  }
  return null;
}
