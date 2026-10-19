// Data access for Cloud API keys. Every query uses `?` placeholders (see
// db.js), and no query ever selects key_hash back out: the hash is only
// compared in WHERE. The secret itself is shown once, at creation, and never
// stored.
//
// Rules enforced here, in transactions, because this is the one place a
// hostile client cannot skip:
//   - a plan's limit on ACTIVE keys (Starter 1, Pro 5, Scale unlimited)
//   - banned users cannot create keys, and a banned user's keys stop working
//   - a key limited to a bucket must be limited to one the owner really has
//   - revoking is permanent, and every admin change is written to the log
import { randomUUID } from "node:crypto";
import { escapeLike } from "./storage-bucket-schema.js";
import { apiKeyLimitFor, hashApiKey, newApiKey } from "./storage-apikey-schema.js";
import { KEY_COLUMNS, toApiKey } from "./storage-apikey-shape.js";

const LOG_DETAILS_MAX = 8_000;

function userFacing(message) {
  const error = new Error(message);
  error.userFacing = true;
  return error;
}

const USER_KEYS = `SELECT ${KEY_COLUMNS}
  FROM storage_api_keys k LEFT JOIN storage_buckets b ON b.id = k.bucket_id`;

const ADMIN_KEYS = `SELECT ${KEY_COLUMNS}, u.email AS owner_email, u.name AS owner_name, q.plan, bn.banned_at
  FROM storage_api_keys k
  JOIN users u ON u.id = k.user_id
  LEFT JOIN storage_buckets b ON b.id = k.bucket_id
  LEFT JOIN storage_quotas q ON q.user_id = k.user_id
  LEFT JOIN storage_user_bans bn ON bn.user_id = k.user_id`;

function toAdminKey(row) {
  return {
    ...toApiKey(row),
    owner: { id: row.user_id, email: row.owner_email, name: row.owner_name ?? "" },
    plan: row.plan ?? "starter",
    ownerBanned: row.banned_at != null,
  };
}

// Turns the filters into a WHERE clause plus its parameters.
export function buildKeyFilter({ q, status }) {
  const where = [];
  const params = [];
  if (q) {
    const like = `%${escapeLike(q.toLowerCase())}%`;
    where.push("(LOWER(k.name) LIKE ? ESCAPE '\\\\' OR LOWER(k.key_prefix) LIKE ? ESCAPE '\\\\' OR u.email_normalized LIKE ? ESCAPE '\\\\')");
    params.push(like, like, like);
  }
  if (status === "active") where.push("k.revoked_at IS NULL");
  if (status === "revoked") where.push("k.revoked_at IS NOT NULL");
  return { clause: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

// Everything that touches the database is built from the `db` you pass in
// ({ query, withTransaction }), so the rules above can be tested with a fake.
export function makeApiKeyStore({ query, withTransaction, makeKey = newApiKey }) {
  // ── The signed-in user's own keys ────────────────────────────────────────────

  async function listUserKeys(userId) {
    const rows = await query(`${USER_KEYS} WHERE k.user_id = ? ORDER BY k.created_at DESC, k.id ASC`, [userId]);
    return rows.map(toApiKey);
  }

  async function countActive(userId) {
    const rows = await query("SELECT COUNT(*) AS n FROM storage_api_keys WHERE user_id = ? AND revoked_at IS NULL", [userId]);
    return Number(rows[0]?.n ?? 0);
  }

  // Returns { key, secret }, or null if the user doesn't exist. The secret is
  // only ever in this return value.
  async function createUserKey(userId, { name, bucketId }) {
    return withTransaction(async (conn) => {
      // Locking the user row serialises this user's creates, so two requests
      // made at the same moment cannot both slip under the plan limit.
      const [users] = await conn.query("SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE", [userId]);
      if (!users[0]) return null;

      const [bans] = await conn.query("SELECT user_id FROM storage_user_bans WHERE user_id = ? LIMIT 1", [userId]);
      if (bans[0]) throw userFacing("Your Cloud storage access has been suspended. Contact support if you think this is a mistake.");

      const [quotas] = await conn.query("SELECT plan FROM storage_quotas WHERE user_id = ? LIMIT 1", [userId]);
      const plan = quotas[0]?.plan ?? "starter";
      const limit = apiKeyLimitFor(plan);
      const [counts] = await conn.query("SELECT COUNT(*) AS n FROM storage_api_keys WHERE user_id = ? AND revoked_at IS NULL", [userId]);
      if (limit !== null && Number(counts[0].n) >= limit) {
        const label = plan.charAt(0).toUpperCase() + plan.slice(1);
        throw userFacing(`Your ${label} plan includes ${limit} API key${limit === 1 ? "" : "s"}. Revoke one or upgrade your plan to add more.`);
      }

      if (bucketId) {
        const [buckets] = await conn.query("SELECT id FROM storage_buckets WHERE id = ? AND user_id = ? LIMIT 1", [bucketId, userId]);
        if (!buckets[0]) throw userFacing("That bucket no longer exists. Pick another one.");
      }

      const id = randomUUID();
      const fresh = makeKey();
      await conn.query(
        "INSERT INTO storage_api_keys (id, user_id, bucket_id, name, key_prefix, key_hash) VALUES (?, ?, ?, ?, ?, ?)",
        [id, userId, bucketId ?? null, name, fresh.prefix, fresh.hash],
      );
      const [rows] = await conn.query(`${USER_KEYS} WHERE k.id = ? LIMIT 1`, [id]);
      return { key: toApiKey(rows[0]), secret: fresh.secret };
    });
  }

  // Revokes the user's own key. Returns { changed }, or null if it isn't theirs.
  async function revokeUserKey(userId, keyId) {
    return withTransaction(async (conn) => {
      const [found] = await conn.query(
        "SELECT id, revoked_at FROM storage_api_keys WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE",
        [keyId, userId],
      );
      if (!found[0]) return null;
      if (found[0].revoked_at != null) return { changed: false };
      await conn.query("UPDATE storage_api_keys SET revoked_at = NOW() WHERE id = ? AND user_id = ?", [keyId, userId]);
      return { changed: true };
    });
  }

  // ── Checking a key that arrived on a request ─────────────────────────────────

  // `secret` must already look like a key (the caller checks). Returns what the
  // request needs to know, or null when no key has this hash.
  async function findKey(secret) {
    const rows = await query(
      `SELECT k.id, k.user_id, k.bucket_id, k.revoked_at, k.rate_limit_per_minute, q.plan, bn.banned_at
       FROM storage_api_keys k
       LEFT JOIN storage_quotas q ON q.user_id = k.user_id
       LEFT JOIN storage_user_bans bn ON bn.user_id = k.user_id
       WHERE k.key_hash = ? LIMIT 1`,
      [hashApiKey(secret)],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      keyId: row.id,
      userId: row.user_id,
      bucketId: row.bucket_id ?? null,
      plan: row.plan ?? "starter",
      rateLimitPerMinute: row.rate_limit_per_minute == null ? null : Number(row.rate_limit_per_minute),
      revoked: row.revoked_at != null,
      banned: row.banned_at != null,
    };
  }

  async function touchKey(keyId) {
    await query("UPDATE storage_api_keys SET last_used_at = NOW(), request_count = request_count + 1 WHERE id = ?", [keyId]);
  }

  // ── Admin: every key ─────────────────────────────────────────────────────────

  // q matches the key name, its prefix or the owner's email. Newest first.
  async function adminListKeys({ q, status, limit, offset }) {
    const { clause, params } = buildKeyFilter({ q, status });
    const totals = await query(`SELECT COUNT(*) AS n FROM storage_api_keys k JOIN users u ON u.id = k.user_id ${clause}`, params);
    const rows = await query(`${ADMIN_KEYS} ${clause} ORDER BY k.created_at DESC, k.id ASC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return { keys: rows.map(toAdminKey), total: Number(totals[0]?.n ?? 0) };
  }

  async function adminGetKey(keyId) {
    const rows = await query(`${ADMIN_KEYS} WHERE k.id = ? LIMIT 1`, [keyId]);
    return rows[0] ? toAdminKey(rows[0]) : null;
  }

  async function audit(conn, adminUserId, action, targetType, targetId, details) {
    await conn.query(
      `INSERT INTO admin_action_log (id, admin_user_id, action, target_type, target_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), adminUserId, action, targetType, targetId, JSON.stringify(details).slice(0, LOG_DETAILS_MAX)],
    );
  }

  // Idempotent: revoking a revoked key changes and logs nothing. Returns
  // { changed }, or null if there is no such key.
  async function adminRevokeKey(keyId, adminUserId) {
    return withTransaction(async (conn) => {
      const [found] = await conn.query(
        "SELECT id, user_id, name, key_prefix, revoked_at FROM storage_api_keys WHERE id = ? LIMIT 1 FOR UPDATE",
        [keyId],
      );
      const row = found[0];
      if (!row) return null;
      if (row.revoked_at != null) return { changed: false };
      await conn.query("UPDATE storage_api_keys SET revoked_at = NOW() WHERE id = ?", [keyId]);
      await audit(conn, adminUserId, "cloud.apikey.revoke", "api_key", keyId, { name: row.name, prefix: row.key_prefix, ownerId: row.user_id });
      return { changed: true };
    });
  }

  // value: a number, or null to follow the plan. Returns { changed }, or null.
  async function adminSetRateLimit(keyId, value, adminUserId) {
    return withTransaction(async (conn) => {
      const [found] = await conn.query(
        "SELECT id, user_id, name, key_prefix, rate_limit_per_minute FROM storage_api_keys WHERE id = ? LIMIT 1 FOR UPDATE",
        [keyId],
      );
      const row = found[0];
      if (!row) return null;
      const from = row.rate_limit_per_minute == null ? null : Number(row.rate_limit_per_minute);
      if (from === value) return { changed: false };
      await conn.query("UPDATE storage_api_keys SET rate_limit_per_minute = ? WHERE id = ?", [value, keyId]);
      await audit(conn, adminUserId, "cloud.apikey.ratelimit", "api_key", keyId, { name: row.name, prefix: row.key_prefix, ownerId: row.user_id, from, to: value });
      return { changed: true };
    });
  }

  // Revokes every active key of one user. Logged against the user, so it shows
  // in their history. Returns { revoked }, or null if there is no such user.
  async function adminRevokeAllForUser(userId, adminUserId) {
    return withTransaction(async (conn) => {
      const [users] = await conn.query("SELECT id FROM users WHERE id = ? LIMIT 1", [userId]);
      if (!users[0]) return null;
      const [active] = await conn.query(
        "SELECT id FROM storage_api_keys WHERE user_id = ? AND revoked_at IS NULL FOR UPDATE",
        [userId],
      );
      if (active.length === 0) return { revoked: 0 };
      await conn.query("UPDATE storage_api_keys SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL", [userId]);
      await audit(conn, adminUserId, "cloud.apikey.revoke_all", "user", userId, { count: active.length });
      return { revoked: active.length };
    });
  }

  return {
    listUserKeys, countActive, createUserKey, revokeUserKey, findKey, touchKey,
    adminListKeys, adminGetKey, adminRevokeKey, adminSetRateLimit, adminRevokeAllForUser,
  };
}
