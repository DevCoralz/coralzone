// Validation for the Cloud storage settings that admins edit from
// /admin/cloud/settings. Hand-rolled (no dependencies) so it can be unit
// tested with plain `node --test`. This is the AUTHORITATIVE check — the
// admin form in the browser runs the same ranges only to give fast feedback.
//
// Keep FILE_GROUP_IDS, PLAN_IDS and LIMITS in sync with
// src/lib/storage-settings.ts (the UI's copy). api/_lib/storage-settings.test.js
// pins the values so drift is caught.
const MB = 1024 ** 2;
const GB = 1024 ** 3;

export const FILE_GROUP_IDS = ["images", "video", "audio", "documents", "archives", "text_data", "other"];
export const PLAN_IDS = ["starter", "pro", "scale"];

export const LIMITS = {
  globalMaxUploadBytes: { min: 1 * MB, max: 4 * GB },
  extraStoragePriceNgn: { min: 0, max: 1_000_000 },
  planBytesQuota: { min: 1 * GB, max: 100 * 1024 * GB },
  planMaxUploadBytes: { min: 1 * MB, max: 4 * GB },
  maintenanceMessageMax: 200,
  blockedMimeTypesMax: 64,
};

// API (camelCase) key -> storage_settings.setting_key (snake_case).
export const KEY_TO_DB = {
  globalMaxUploadBytes: "global_max_upload_bytes",
  extraStoragePriceNgn: "extra_storage_price_ngn",
  allowedFileGroups: "allowed_file_groups",
  blockedMimeTypes: "blocked_mime_types",
  planQuotas: "plan_quotas",
  maintenance: "maintenance",
};
export const DB_TO_KEY = Object.fromEntries(Object.entries(KEY_TO_DB).map(([k, v]) => [v, k]));
export const SETTING_KEYS = Object.keys(KEY_TO_DB);

// A MIME type like image/png or application/vnd.rar: lowercase letters, numbers
// and . + - on each side of one slash. Anything else is refused, so a blocked
// entry can never be a pattern or carry odd characters into a request.
export const MIME_TYPE_RE = /^[a-z0-9][a-z0-9.+-]{0,60}\/[a-z0-9][a-z0-9.+-]{0,60}$/;

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isIntInRange = (v, { min, max }) => Number.isSafeInteger(v) && v >= min && v <= max;

function onlyKeys(obj, allowed) {
  return Object.keys(obj).every((k) => allowed.includes(k));
}

function cleanMessage(raw) {
  // Strip control characters (incl. newlines) so the message is always one
  // safe line; React escapes it on output as well.
  return raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

// Returns { ok: true, value } | { ok: false, error } for ONE setting.
export function validateSettingValue(key, value) {
  switch (key) {
    case "globalMaxUploadBytes":
      return isIntInRange(value, LIMITS.globalMaxUploadBytes)
        ? { ok: true, value }
        : { ok: false, error: "Global max upload must be between 1 MB and 4 GB." };

    case "extraStoragePriceNgn":
      return isIntInRange(value, LIMITS.extraStoragePriceNgn)
        ? { ok: true, value }
        : { ok: false, error: "Extra-storage price must be a whole number of naira from 0 to 1,000,000." };

    case "allowedFileGroups": {
      if (!Array.isArray(value) || value.length === 0 || value.length > FILE_GROUP_IDS.length) {
        return { ok: false, error: "Select at least one allowed file type group." };
      }
      if (!value.every((id) => typeof id === "string" && FILE_GROUP_IDS.includes(id))) {
        return { ok: false, error: "Unknown file type group." };
      }
      // De-duplicate, keep canonical order.
      return { ok: true, value: FILE_GROUP_IDS.filter((id) => value.includes(id)) };
    }

    case "blockedMimeTypes": {
      // Individual types an admin has switched off, on top of the file groups.
      // An empty list is fine: it means nothing is blocked.
      if (!Array.isArray(value) || value.length > LIMITS.blockedMimeTypesMax) {
        return { ok: false, error: `Block at most ${LIMITS.blockedMimeTypesMax} file types.` };
      }
      if (!value.every((item) => typeof item === "string" && MIME_TYPE_RE.test(item.toLowerCase()))) {
        return { ok: false, error: "Each blocked type must be a MIME type such as application/zip." };
      }
      return { ok: true, value: [...new Set(value.map((item) => item.toLowerCase()))].sort() };
    }

    case "planQuotas": {
      if (!isPlainObject(value) || !onlyKeys(value, PLAN_IDS) || !PLAN_IDS.every((id) => hasOwn(value, id))) {
        return { ok: false, error: "Plan quotas must include Starter, Pro and Scale." };
      }
      const out = {};
      for (const id of PLAN_IDS) {
        const plan = value[id];
        if (!isPlainObject(plan) || !onlyKeys(plan, ["bytesQuota", "maxUploadBytes"])) {
          return { ok: false, error: `Invalid quota for ${id}.` };
        }
        if (!isIntInRange(plan.bytesQuota, LIMITS.planBytesQuota)) {
          return { ok: false, error: `${id}: storage quota must be between 1 GB and 100 TB.` };
        }
        if (!isIntInRange(plan.maxUploadBytes, LIMITS.planMaxUploadBytes)) {
          return { ok: false, error: `${id}: max upload must be between 1 MB and 4 GB.` };
        }
        if (plan.maxUploadBytes > plan.bytesQuota) {
          return { ok: false, error: `${id}: max upload cannot exceed the storage quota.` };
        }
        out[id] = { bytesQuota: plan.bytesQuota, maxUploadBytes: plan.maxUploadBytes };
      }
      return { ok: true, value: out };
    }

    case "maintenance": {
      if (!isPlainObject(value) || !onlyKeys(value, ["enabled", "message"]) || typeof value.enabled !== "boolean" || typeof value.message !== "string") {
        return { ok: false, error: "Invalid maintenance setting." };
      }
      const message = cleanMessage(value.message);
      if (message.length > LIMITS.maintenanceMessageMax) {
        return { ok: false, error: `Maintenance message must be at most ${LIMITS.maintenanceMessageMax} characters.` };
      }
      return { ok: true, value: { enabled: value.enabled, message } };
    }

    default:
      return { ok: false, error: "Unknown setting." };
  }
}

// Validates an admin PATCH body: { <key>: value | null, ... }. `null` means
// "reset this setting to its built-in default" (the row is deleted).
// Returns { ok: true, patch } | { ok: false, error }.
export function validateSettingsPatch(body) {
  if (!isPlainObject(body)) return { ok: false, error: "Send a JSON object of settings." };
  const keys = Object.keys(body);
  if (keys.length === 0) return { ok: false, error: "No settings to change." };
  const patch = {};
  for (const key of keys) {
    if (!SETTING_KEYS.includes(key)) return { ok: false, error: "Unknown setting." };
    if (body[key] === null) {
      patch[key] = null;
      continue;
    }
    const result = validateSettingValue(key, body[key]);
    if (!result.ok) return result;
    patch[key] = result.value;
  }
  return { ok: true, patch };
}
