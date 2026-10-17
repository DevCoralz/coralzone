// Validation for the per-user Cloud storage controls an admin can change
// (plan, extra storage, freeze, manual limits, ban). Hand-rolled and
// dependency-free so it can be unit tested with plain `node --test`. This is
// the AUTHORITATIVE check; the admin form only mirrors it for fast feedback.
//
// Patch shape (every field optional, at least one required):
//   plan               "starter" | "pro" | "scale"
//   extraBytes         whole bytes, 0 .. planBytesQuota.max
//   frozen             boolean
//   bytesQuotaOverride whole bytes in planBytesQuota range, or null = follow plan
//   maxUploadOverride  whole bytes in planMaxUploadBytes range, or null = follow plan
//   banned             boolean
//   banReason          string (<= 200 chars, one line) or null; only used with banned: true
import { LIMITS, PLAN_IDS } from "./storage-settings-schema.js";

export const BAN_REASON_MAX = 200;
export const CONTROL_KEYS = ["plan", "extraBytes", "frozen", "bytesQuotaOverride", "maxUploadOverride", "banned", "banReason"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}$/;
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isIntInRange = (v, { min, max }) => Number.isSafeInteger(v) && v >= min && v <= max;

export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

// Admin lookups accept a user id OR an email. Returns { userId } | { email } | null.
export function parseUserRef(input) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (isUuid(value)) return { userId: value.toLowerCase() };
  if (value.length <= 254 && EMAIL_RE.test(value)) return { email: value.toLowerCase() };
  return null;
}

function cleanReason(raw) {
  return raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

// Returns { ok: true, patch } | { ok: false, error }. `patch` only contains
// validated, normalised fields.
export function validateControlsPatch(input) {
  if (!isPlainObject(input)) return { ok: false, error: "Send an object of changes." };
  const keys = Object.keys(input);
  if (keys.length === 0) return { ok: false, error: "No changes to apply." };
  if (!keys.every((k) => CONTROL_KEYS.includes(k))) return { ok: false, error: "Unknown field in request." };

  const patch = {};

  if (hasOwn(input, "plan")) {
    if (!PLAN_IDS.includes(input.plan)) return { ok: false, error: "Plan must be starter, pro or scale." };
    patch.plan = input.plan;
  }
  if (hasOwn(input, "extraBytes")) {
    if (!isIntInRange(input.extraBytes, { min: 0, max: LIMITS.planBytesQuota.max })) {
      return { ok: false, error: "Extra storage must be a whole number of bytes from 0 up to 100 TB." };
    }
    patch.extraBytes = input.extraBytes;
  }
  if (hasOwn(input, "frozen")) {
    if (typeof input.frozen !== "boolean") return { ok: false, error: "Frozen must be true or false." };
    patch.frozen = input.frozen;
  }
  if (hasOwn(input, "bytesQuotaOverride")) {
    const v = input.bytesQuotaOverride;
    if (v !== null && !isIntInRange(v, LIMITS.planBytesQuota)) return { ok: false, error: "Storage override must be between 1 GB and 100 TB, or empty to follow the plan." };
    patch.bytesQuotaOverride = v;
  }
  if (hasOwn(input, "maxUploadOverride")) {
    const v = input.maxUploadOverride;
    if (v !== null && !isIntInRange(v, LIMITS.planMaxUploadBytes)) return { ok: false, error: "Upload limit override must be between 1 MB and 4 GB, or empty to follow the plan." };
    patch.maxUploadOverride = v;
  }
  if (hasOwn(input, "banned")) {
    if (typeof input.banned !== "boolean") return { ok: false, error: "Banned must be true or false." };
    patch.banned = input.banned;
  }
  if (hasOwn(input, "banReason")) {
    const v = input.banReason;
    if (v !== null && typeof v !== "string") return { ok: false, error: "Ban reason must be text." };
    const cleaned = v === null ? null : cleanReason(v);
    if (cleaned !== null && cleaned.length > BAN_REASON_MAX) return { ok: false, error: `Ban reason must be ${BAN_REASON_MAX} characters or fewer.` };
    patch.banReason = cleaned === "" ? null : cleaned;
  }

  // A quota override can't be smaller than a per-file override on the same
  // patch (mirrors the plan rule: one file must be able to fit).
  if (typeof patch.bytesQuotaOverride === "number" && typeof patch.maxUploadOverride === "number" && patch.maxUploadOverride > patch.bytesQuotaOverride) {
    return { ok: false, error: "Upload limit cannot be larger than the storage override." };
  }
  return { ok: true, patch };
}
