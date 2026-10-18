// Data access for the per-user Cloud entitlement: plan, extra storage, freeze,
// manual limits and bans. Every query uses `?` placeholders (see db.js).
//
// The gateway only ever returns RAW entitlement facts. Turning them into the
// limits that apply right now (plan quota from the admin settings, global
// ceiling, maintenance mode, ...) happens in src/lib/storage-quota.ts, so
// there is exactly one copy of that logic.
import { randomUUID } from "node:crypto";
import { query, withTransaction } from "./db.js";
import { toEntitlement } from "./storage-entitlement.js";

const LOG_DETAILS_MAX = 8_000;


const ENTITLEMENT_SELECT = `
  SELECT u.id, u.name, u.email, q.plan, q.extra_bytes, q.status, q.bytes_quota, q.max_upload_bytes,
         b.banned_at, b.reason AS ban_reason
  FROM users u
  LEFT JOIN storage_quotas q ON q.user_id = u.id
  LEFT JOIN storage_user_bans b ON b.user_id = u.id`;

// The signed-in user's own entitlement. No ban reason: that is admin-only.
// Returns null when the user doesn't exist.
export async function getEntitlement(userId) {
  const rows = await query(`${ENTITLEMENT_SELECT} WHERE u.id = ? LIMIT 1`, [userId]);
  return rows[0] ? toEntitlement(rows[0]) : null;
}

// Admin view: who the user is plus the entitlement and the ban reason.
// `ref` is { userId } or { email } (already validated by parseUserRef).
export async function getAdminUserControls(ref) {
  const rows = ref.userId
    ? await query(`${ENTITLEMENT_SELECT} WHERE u.id = ? LIMIT 1`, [ref.userId])
    : await query(`${ENTITLEMENT_SELECT} WHERE u.email_normalized = ? LIMIT 1`, [ref.email]);
  const row = rows[0];
  if (!row) return null;
  return {
    user: { id: row.id, name: row.name, email: row.email },
    entitlement: toEntitlement(row),
    banReason: row.banned_at != null ? row.ban_reason ?? null : null,
  };
}

// Applies a validated patch for ONE user atomically and writes one audit-log
// row in the same transaction. Returns the list of fields that really changed
// (an empty list means nothing was written). Returns null if the user does
// not exist.
export async function saveUserControls(userId, patch, adminUserId) {
  const result = await withTransaction(async (conn) => {
    const [userRows] = await conn.query("SELECT id FROM users WHERE id = ? LIMIT 1", [userId]);
    if (!userRows[0]) return null;

    const [rows] = await conn.query(
      `SELECT q.plan, q.extra_bytes, q.status, q.bytes_quota, q.max_upload_bytes, b.banned_at, b.reason AS ban_reason
       FROM users u
       LEFT JOIN storage_quotas q ON q.user_id = u.id
       LEFT JOIN storage_user_bans b ON b.user_id = u.id
       WHERE u.id = ? FOR UPDATE`,
      [userId],
    );
    const current = toEntitlement(rows[0]);
    const currentReason = rows[0]?.banned_at != null ? rows[0].ban_reason ?? null : null;

    const next = { ...current };
    for (const key of ["plan", "extraBytes", "frozen", "bytesQuotaOverride", "maxUploadOverride", "banned"]) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
    }
    const nextReason = next.banned
      ? Object.prototype.hasOwnProperty.call(patch, "banReason") ? patch.banReason : currentReason
      : null;

    // Cross-field rule against the *resulting* state, not just the patch.
    if (next.bytesQuotaOverride !== null && next.maxUploadOverride !== null && next.maxUploadOverride > next.bytesQuotaOverride) {
      const error = new Error("Upload limit cannot be larger than the storage override.");
      error.userFacing = true;
      throw error;
    }

    const changes = {};
    for (const key of ["plan", "extraBytes", "frozen", "bytesQuotaOverride", "maxUploadOverride", "banned"]) {
      if (current[key] !== next[key]) changes[key] = { from: current[key], to: next[key] };
    }
    if (next.banned && nextReason !== currentReason) changes.banReason = { from: currentReason, to: nextReason };

    const quotaChanged = ["plan", "extraBytes", "frozen", "bytesQuotaOverride", "maxUploadOverride"].some((k) => k in changes);
    if (quotaChanged) {
      await conn.query(
        `INSERT INTO storage_quotas (user_id, plan, bytes_quota, max_upload_bytes, extra_bytes, status)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE plan = VALUES(plan), bytes_quota = VALUES(bytes_quota),
           max_upload_bytes = VALUES(max_upload_bytes), extra_bytes = VALUES(extra_bytes), status = VALUES(status)`,
        [userId, next.plan, next.bytesQuotaOverride, next.maxUploadOverride, next.extraBytes, next.frozen ? "frozen" : "active"],
      );
    }

    if ("banned" in changes || "banReason" in changes) {
      if (next.banned) {
        await conn.query(
          `INSERT INTO storage_user_bans (user_id, reason, banned_by) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE reason = VALUES(reason), banned_by = VALUES(banned_by)`,
          [userId, nextReason, adminUserId],
        );
      } else {
        await conn.query("DELETE FROM storage_user_bans WHERE user_id = ?", [userId]);
      }
    }

    const changedKeys = Object.keys(changes);
    if (changedKeys.length > 0) {
      await conn.query(
        `INSERT INTO admin_action_log (id, admin_user_id, action, target_type, target_id, details)
         VALUES (?, ?, 'cloud.user.controls.update', 'user', ?, ?)`,
        [randomUUID(), adminUserId, userId, JSON.stringify({ changes }).slice(0, LOG_DETAILS_MAX)],
      );
    }
    return changedKeys;
  });
  return result;
}
