// Validation for Cloud storage buckets: what a user may call one, how many a
// plan allows, and the shape of the admin list query and actions. Hand-rolled
// and dependency-free so `node --test` can run it. This is the AUTHORITATIVE
// check; the pages mirror it only for fast feedback (src/lib/storage-buckets.ts,
// pinned against this file by both test suites).
import { isUuid } from "./storage-quota-schema.js";

export const BUCKET_NAME_MAX = 60;

// How many buckets ("projects") each plan includes. null = unlimited.
// Keep in sync with BUCKET_LIMITS in src/lib/storage-buckets.ts.
export const BUCKET_LIMITS = { starter: 1, pro: null, scale: null };

export const ADMIN_LIST_LIMIT = { default: 25, max: 100 };
export const ADMIN_SEARCH_MAX = 100;
export const ADMIN_STATUSES = ["all", "frozen"];

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Letters and digits from any language, then spaces . _ - (no slashes, no
// control characters, no leading punctuation). One line, shown as plain text.
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;

export function bucketLimitFor(plan) {
  return hasOwn(BUCKET_LIMITS, plan) ? BUCKET_LIMITS[plan] : BUCKET_LIMITS.starter;
}

// Returns { ok: true, name } | { ok: false, error }.
export function validateBucketName(input) {
  if (typeof input !== "string") return { ok: false, error: "Give the bucket a name." };
  const name = input.replace(/\s+/g, " ").trim();
  if (name.length === 0) return { ok: false, error: "Give the bucket a name." };
  if (name.length > BUCKET_NAME_MAX) return { ok: false, error: `Bucket names can be at most ${BUCKET_NAME_MAX} characters.` };
  if (!NAME_RE.test(name)) return { ok: false, error: "Use letters, numbers, spaces, dots, dashes and underscores, starting with a letter or number." };
  return { ok: true, name };
}

// Body of POST /api/cloud/buckets
export function validateCreate(body) {
  if (!isPlainObject(body)) return { ok: false, error: "Send a bucket name." };
  return validateBucketName(body.name);
}

// Body of PUT /api/cloud/buckets  { id, name }
export function validateRename(body) {
  if (!isPlainObject(body) || !isUuid(body.id)) return { ok: false, error: "Unknown bucket." };
  const named = validateBucketName(body.name);
  return named.ok ? { ok: true, id: body.id.toLowerCase(), name: named.name } : named;
}

// Body of DELETE /api/cloud/buckets  { id }
export function validateBucketRef(body) {
  if (!isPlainObject(body) || !isUuid(body.id)) return { ok: false, error: "Unknown bucket." };
  return { ok: true, id: body.id.toLowerCase() };
}

// Body of PUT /api/admin/cloud-buckets  { id, frozen }
export function validateFreeze(body) {
  const ref = validateBucketRef(body);
  if (!ref.ok) return ref;
  if (typeof body.frozen !== "boolean") return { ok: false, error: "Frozen must be true or false." };
  return { ok: true, id: ref.id, frozen: body.frozen };
}

// Body of DELETE /api/admin/cloud-buckets  { id, filesDeleted }
// filesDeleted is only recorded in the audit log: the storage service did the
// real deleting, and the admin is trusted, but it still has to be a sane number.
export function validateAdminDelete(body) {
  const ref = validateBucketRef(body);
  if (!ref.ok) return ref;
  const n = hasOwn(body, "filesDeleted") ? body.filesDeleted : 0;
  if (!Number.isSafeInteger(n) || n < 0 || n > 100_000_000) return { ok: false, error: "Invalid file count." };
  return { ok: true, id: ref.id, filesDeleted: n };
}

// Escape LIKE wildcards so a search for "50%" finds "50%", not everything.
export function escapeLike(text) {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Query string of GET /api/admin/cloud-buckets. Bad numbers fall back to the
// defaults instead of erroring: it is a list page, not a write.
export function parseAdminListQuery(params) {
  const rawQ = (params.get("q") ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const q = rawQ.slice(0, ADMIN_SEARCH_MAX);
  const status = ADMIN_STATUSES.includes(params.get("status")) ? params.get("status") : "all";
  const limitRaw = Number(params.get("limit"));
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1 ? Math.min(limitRaw, ADMIN_LIST_LIMIT.max) : ADMIN_LIST_LIMIT.default;
  const offsetRaw = Number(params.get("offset"));
  const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 && offsetRaw <= 1_000_000 ? offsetRaw : 0;
  return { q, status, limit, offset };
}
