// Data access for Cloud storage buckets. Every query uses `?` placeholders
// (see db.js). CoralzOne owns the bucket LIST (name, owner, frozen state); the
// storage service only knows each file's bucket_id, so sizes and file counts
// are added on the server-function side (src/lib/storage-buckets.functions.ts).
//
// Rules enforced here, in transactions, because this is the one place a
// hostile client cannot skip:
//   - a plan's bucket limit (Starter: 1) and unique names per user
//   - banned users cannot create buckets
//   - a bucket frozen by an admin cannot be renamed or deleted by its owner
import { randomUUID } from "node:crypto";
import { bucketLimitFor, escapeLike } from "./storage-bucket-schema.js";
import { toEntitlement } from "./storage-entitlement.js";

const LOG_DETAILS_MAX = 8_000;

function userFacing(message) {
  const error = new Error(message);
  error.userFacing = true;
  return error;
}

const iso = (value) => (value ? new Date(value).toISOString() : null);

function toBucket(row) {
  return { id: row.id, name: row.name, frozen: row.frozen_at != null, createdAt: iso(row.created_at) };
}

// Everything that touches the database is built from the `db` you pass in
// ({ query, withTransaction }), so the rules above can be tested with a fake
// and the real thing is wired up in storage-bucket-core.js.
export function makeBucketStore({ query, withTransaction }) {
  // An API key limited to a bucket must not outlive it. The table's foreign key
  // would turn such a key into an all buckets key when the bucket row goes, so
  // those keys are revoked first, inside the same transaction.
  async function revokeKeysOf(conn, bucketId) {
    await conn.query("UPDATE storage_api_keys SET revoked_at = NOW() WHERE bucket_id = ? AND revoked_at IS NULL", [bucketId]);
  }

  // ── The signed-in user's own buckets ─────────────────────────────────────────

  async function listUserBuckets(userId) {
    const rows = await query(
      "SELECT id, name, frozen_at, created_at FROM storage_buckets WHERE user_id = ? ORDER BY created_at ASC, id ASC",
      [userId],
    );
    return rows.map(toBucket);
  }

  // The user's own bucket, or null. Ownership is part of the WHERE, so asking
  // for someone else's bucket id is the same as asking for one that doesn't exist.
  async function getUserBucket(userId, bucketId) {
    const rows = await query(
      "SELECT id, name, frozen_at, created_at FROM storage_buckets WHERE id = ? AND user_id = ? LIMIT 1",
      [bucketId, userId],
    );
    return rows[0] ? toBucket(rows[0]) : null;
  }

  async function nameTaken(conn, userId, name, exceptId = null) {
    const [rows] = await conn.query(
      "SELECT id FROM storage_buckets WHERE user_id = ? AND LOWER(name) = LOWER(?) AND id <> ? LIMIT 1",
      [userId, name, exceptId ?? ""],
    );
    return rows.length > 0;
  }

  // Returns the new bucket, or null if the user doesn't exist.
  async function createUserBucket(userId, name) {
    return withTransaction(async (conn) => {
      // Locking the user row serialises this user's creates, so two requests
      // made at the same moment cannot both slip under the plan limit.
      const [users] = await conn.query("SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE", [userId]);
      if (!users[0]) return null;

      const [bans] = await conn.query("SELECT user_id FROM storage_user_bans WHERE user_id = ? LIMIT 1", [userId]);
      if (bans[0]) throw userFacing("Your Cloud storage access has been suspended. Contact support if you think this is a mistake.");

      const [quotas] = await conn.query("SELECT plan FROM storage_quotas WHERE user_id = ? LIMIT 1", [userId]);
      const plan = quotas[0]?.plan ?? "starter";
      const limit = bucketLimitFor(plan);
      const [counts] = await conn.query("SELECT COUNT(*) AS n FROM storage_buckets WHERE user_id = ?", [userId]);
      if (limit !== null && Number(counts[0].n) >= limit) {
        const label = plan.charAt(0).toUpperCase() + plan.slice(1);
        throw userFacing(`Your ${label} plan includes ${limit} bucket${limit === 1 ? "" : "s"}. Upgrade your plan to create more.`);
      }
      if (await nameTaken(conn, userId, name)) throw userFacing("You already have a bucket with that name.");

      const id = randomUUID();
      await conn.query("INSERT INTO storage_buckets (id, user_id, name) VALUES (?, ?, ?)", [id, userId, name]);
      const [rows] = await conn.query("SELECT id, name, frozen_at, created_at FROM storage_buckets WHERE id = ?", [id]);
      return toBucket(rows[0]);
    });
  }

  // Returns the renamed bucket, or null if it isn't this user's.
  async function renameUserBucket(userId, bucketId, name) {
    return withTransaction(async (conn) => {
      const [found] = await conn.query(
        "SELECT id, frozen_at FROM storage_buckets WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE",
        [bucketId, userId],
      );
      if (!found[0]) return null;
      if (found[0].frozen_at != null) throw userFacing("This bucket is frozen, so it can't be changed. Contact support.");
      if (await nameTaken(conn, userId, name, bucketId)) throw userFacing("You already have a bucket with that name.");
      await conn.query("UPDATE storage_buckets SET name = ? WHERE id = ? AND user_id = ?", [name, bucketId, userId]);
      const [rows] = await conn.query("SELECT id, name, frozen_at, created_at FROM storage_buckets WHERE id = ?", [bucketId]);
      return toBucket(rows[0]);
    });
  }

  // Removes the bucket row only. The server function has already checked it is
  // empty (a user can't delete a bucket that still holds files).
  // Returns true if a row was removed.
  async function deleteUserBucket(userId, bucketId) {
    return withTransaction(async (conn) => {
      const [found] = await conn.query(
        "SELECT id, frozen_at FROM storage_buckets WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE",
        [bucketId, userId],
      );
      if (!found[0]) return false;
      if (found[0].frozen_at != null) throw userFacing("This bucket is frozen, so it can't be deleted. Contact support.");
      await revokeKeysOf(conn, bucketId);
      await conn.query("DELETE FROM storage_buckets WHERE id = ? AND user_id = ?", [bucketId, userId]);
      return true;
    });
  }

  // ── Admin: every bucket ──────────────────────────────────────────────────────

  const ADMIN_SELECT = `
    SELECT b.id, b.user_id, b.name, b.frozen_at, b.created_at,
           u.email AS owner_email, u.name AS owner_name,
           q.plan, q.extra_bytes, q.status, q.bytes_quota, q.max_upload_bytes, bn.banned_at
    FROM storage_buckets b
    JOIN users u ON u.id = b.user_id
    LEFT JOIN storage_quotas q ON q.user_id = b.user_id
    LEFT JOIN storage_user_bans bn ON bn.user_id = b.user_id`;

  function toAdminBucket(row) {
    return {
      ...toBucket(row),
      owner: { id: row.user_id, email: row.owner_email, name: row.owner_name },
      // Raw facts only: the page turns them into the owner's quota with the live settings.
      entitlement: toEntitlement(row),
    };
  }

  // q matches the bucket name or the owner's email. status 'frozen' keeps only
  // frozen buckets. Newest first. Returns { buckets, total }.
  async function adminListBuckets({ q, status, limit, offset }) {
    const where = [];
    const params = [];
    if (q) {
      const like = `%${escapeLike(q.toLowerCase())}%`;
      where.push("(LOWER(b.name) LIKE ? ESCAPE '\\\\' OR u.email_normalized LIKE ? ESCAPE '\\\\')");
      params.push(like, like);
    }
    if (status === "frozen") where.push("b.frozen_at IS NOT NULL");
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const totals = await query(
      `SELECT COUNT(*) AS n FROM storage_buckets b JOIN users u ON u.id = b.user_id ${clause}`,
      params,
    );
    const rows = await query(
      `${ADMIN_SELECT} ${clause} ORDER BY b.created_at DESC, b.id ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return { buckets: rows.map(toAdminBucket), total: Number(totals[0]?.n ?? 0) };
  }

  async function adminGetBucket(bucketId) {
    const rows = await query(`${ADMIN_SELECT} WHERE b.id = ? LIMIT 1`, [bucketId]);
    return rows[0] ? toAdminBucket(rows[0]) : null;
  }

  async function audit(conn, adminUserId, action, bucketId, details) {
    await conn.query(
      `INSERT INTO admin_action_log (id, admin_user_id, action, target_type, target_id, details)
       VALUES (?, ?, ?, 'bucket', ?, ?)`,
      [randomUUID(), adminUserId, action, bucketId, JSON.stringify(details).slice(0, LOG_DETAILS_MAX)],
    );
  }

  // Freeze or unfreeze. Idempotent: asking for the state it is already in
  // changes and logs nothing. Returns { changed } or null if there is no such bucket.
  async function adminSetBucketFrozen(bucketId, frozen, adminUserId) {
    return withTransaction(async (conn) => {
      const [found] = await conn.query(
        "SELECT id, user_id, name, frozen_at FROM storage_buckets WHERE id = ? LIMIT 1 FOR UPDATE",
        [bucketId],
      );
      const row = found[0];
      if (!row) return null;
      if ((row.frozen_at != null) === frozen) return { changed: false };
      await conn.query("UPDATE storage_buckets SET frozen_at = ? WHERE id = ?", [frozen ? new Date() : null, bucketId]);
      await audit(conn, adminUserId, frozen ? "cloud.bucket.freeze" : "cloud.bucket.unfreeze", bucketId, {
        name: row.name, ownerId: row.user_id,
      });
      return { changed: true };
    });
  }

  // Removes the bucket row and logs it. The storage service has already emptied
  // it (the server function drives that in batches); `filesDeleted` is recorded
  // for the audit trail. Returns true if a row was removed.
  async function adminDeleteBucket(bucketId, filesDeleted, adminUserId) {
    return withTransaction(async (conn) => {
      const [found] = await conn.query(
        "SELECT id, user_id, name FROM storage_buckets WHERE id = ? LIMIT 1 FOR UPDATE",
        [bucketId],
      );
      const row = found[0];
      if (!row) return false;
      await revokeKeysOf(conn, bucketId);
      await conn.query("DELETE FROM storage_buckets WHERE id = ?", [bucketId]);
      await audit(conn, adminUserId, "cloud.bucket.delete", bucketId, { name: row.name, ownerId: row.user_id, filesDeleted });
      return true;
    });
  }

  return { listUserBuckets, getUserBucket, createUserBucket, renameUserBucket, deleteUserBucket, adminListBuckets, adminGetBucket, adminSetBucketFrozen, adminDeleteBucket };
}
