// Data access for storage_settings + the admin audit trail. Every query uses
// `?` placeholders (see db.js). Stored values are re-validated on read, so a
// bad row written by hand in the database can never reach the app — it is
// ignored and the built-in default applies instead.
import { randomUUID } from "node:crypto";
import { query, withTransaction } from "./db.js";
import { DB_TO_KEY, KEY_TO_DB, validateSettingValue } from "./storage-settings-schema.js";

const CACHE_TTL_MS = 5_000;
const LOG_DETAILS_MAX = 8_000;

// Warm serverless instances share this for a few seconds so a burst of
// uploads or pricing-page views doesn't hit MySQL once each. saveOverrides()
// clears it on the instance that handled the save; other warm instances
// pick the change up within CACHE_TTL_MS.
const globalForCache = globalThis;

function readCache() {
  const entry = globalForCache.__coralzoneSettingsCache;
  if (entry && Date.now() - entry.at < CACHE_TTL_MS) return entry.value;
  return null;
}

function clearCache() {
  globalForCache.__coralzoneSettingsCache = undefined;
}

// Returns { overrides, updatedAt } where overrides only contains settings an
// admin has explicitly saved (and that still validate).
export async function loadOverrides({ useCache = true } = {}) {
  if (useCache) {
    const cached = readCache();
    if (cached) return cached;
  }
  const rows = await query("SELECT setting_key, value_json, updated_at FROM storage_settings");
  const overrides = {};
  let updatedAt = null;
  for (const row of rows) {
    const key = DB_TO_KEY[row.setting_key];
    if (!key) continue;
    let parsed;
    try {
      parsed = JSON.parse(row.value_json);
    } catch {
      continue;
    }
    const result = validateSettingValue(key, parsed);
    if (!result.ok) continue;
    overrides[key] = result.value;
    const when = new Date(row.updated_at);
    if (!updatedAt || when > updatedAt) updatedAt = when;
  }
  const value = { overrides, updatedAt: updatedAt ? updatedAt.toISOString() : null };
  globalForCache.__coralzoneSettingsCache = { at: Date.now(), value };
  return value;
}

// Applies a validated patch atomically and writes one audit-log row in the
// same transaction — either both happen or neither does.
// patch: { <camelKey>: value | null }  (null deletes the override).
// Returns the list of keys that actually changed.
export async function saveOverrides(patch, adminUserId) {
  const changed = await withTransaction(async (conn) => {
    const dbKeys = Object.keys(patch).map((k) => KEY_TO_DB[k]);
    const [currentRows] = await conn.query(
      "SELECT setting_key, value_json FROM storage_settings WHERE setting_key IN (?) FOR UPDATE",
      [dbKeys],
    );
    const before = {};
    for (const row of currentRows) {
      try {
        before[DB_TO_KEY[row.setting_key]] = JSON.parse(row.value_json);
      } catch {
        before[DB_TO_KEY[row.setting_key]] = null;
      }
    }

    const changes = {};
    for (const [key, next] of Object.entries(patch)) {
      const prev = before[key] ?? null;
      if (JSON.stringify(prev) === JSON.stringify(next)) continue;
      changes[key] = { from: prev, to: next };
      if (next === null) {
        await conn.query("DELETE FROM storage_settings WHERE setting_key = ?", [KEY_TO_DB[key]]);
      } else {
        await conn.query(
          `INSERT INTO storage_settings (setting_key, value_json, updated_by) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by)`,
          [KEY_TO_DB[key], JSON.stringify(next), adminUserId],
        );
      }
    }

    const changedKeys = Object.keys(changes);
    if (changedKeys.length > 0) {
      await conn.query(
        `INSERT INTO admin_action_log (id, admin_user_id, action, target_type, target_id, details)
         VALUES (?, ?, 'cloud.settings.update', 'storage_settings', ?, ?)`,
        [randomUUID(), adminUserId, changedKeys.join(",").slice(0, 64), JSON.stringify({ changes }).slice(0, LOG_DETAILS_MAX)],
      );
    }
    return changedKeys;
  });
  clearCache();
  return changed;
}
