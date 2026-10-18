// Read only data access for the admin Users and usage pages. Every query uses
// `?` placeholders (see db.js), so nothing a person types can become SQL.
//
// Writes for a user (plan, extra storage, freeze, ban) already live in
// storage-quota-core.js; this file only reads. File sizes and counts are not
// here either: they live in the storage service and are added by the server
// functions in src/lib/storage-users.functions.ts.
import { escapeLike } from "./storage-bucket-schema.js";
import { isUuid } from "./storage-quota-schema.js";
import { toEntitlement } from "./storage-entitlement.js";
import { summarizeAction } from "./storage-user-schema.js";

const iso = (value) => (value ? new Date(value).toISOString() : null);
const ACTIONS_SHOWN = 10;

const BASE_SELECT = `
  SELECT u.id, u.name, u.email, u.created_at,
         q.plan, q.extra_bytes, q.status, q.bytes_quota, q.max_upload_bytes,
         b.banned_at, b.reason AS ban_reason,
         (SELECT COUNT(*) FROM storage_buckets sb WHERE sb.user_id = u.id) AS bucket_count
  FROM users u
  LEFT JOIN storage_quotas q ON q.user_id = u.id
  LEFT JOIN storage_user_bans b ON b.user_id = u.id`;

const BASE_FROM = `
  FROM users u
  LEFT JOIN storage_quotas q ON q.user_id = u.id
  LEFT JOIN storage_user_bans b ON b.user_id = u.id`;

function toUser(row) {
  return { id: row.id, name: row.name ?? "", email: row.email, createdAt: iso(row.created_at) };
}

// Turns the filters into a WHERE clause plus its parameters.
export function buildUserFilter({ q, status, plan }) {
  const where = [];
  const params = [];
  if (q) {
    if (isUuid(q)) {
      where.push("u.id = ?");
      params.push(q.toLowerCase());
    } else {
      const like = `%${escapeLike(q.toLowerCase())}%`;
      where.push("(LOWER(u.name) LIKE ? ESCAPE '\\\\' OR u.email_normalized LIKE ? ESCAPE '\\\\')");
      params.push(like, like);
    }
  }
  if (status === "frozen") where.push("q.status = 'frozen'");
  if (status === "banned") where.push("b.user_id IS NOT NULL");
  // A user with no quota row is on Starter, so Starter has to include them.
  if (plan && plan !== "all") {
    where.push("COALESCE(q.plan, 'starter') = ?");
    params.push(plan);
  }
  return { clause: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

export function makeUserStore({ query }) {
  // Newest accounts first. Returns { users, total }.
  async function adminListUsers(filters) {
    const { clause, params } = buildUserFilter(filters);
    const totals = await query(`SELECT COUNT(*) AS n ${BASE_FROM} ${clause}`, params);
    const rows = await query(
      `${BASE_SELECT} ${clause} ORDER BY u.created_at DESC, u.id ASC LIMIT ? OFFSET ?`,
      [...params, filters.limit, filters.offset],
    );
    return {
      users: rows.map((row) => ({
        ...toUser(row),
        bucketCount: Number(row.bucket_count ?? 0),
        // Raw facts only: the page turns them into limits with the live settings.
        entitlement: toEntitlement(row),
      })),
      total: Number(totals[0]?.n ?? 0),
    };
  }

  // Everything the gateway knows about one user, or null if there is no such user.
  async function adminGetUserOverview(userId) {
    const found = await query(`${BASE_SELECT} WHERE u.id = ? LIMIT 1`, [userId]);
    const row = found[0];
    if (!row) return null;

    const [buckets, keys, actions] = await Promise.all([
      query(
        "SELECT id, name, frozen_at, created_at FROM storage_buckets WHERE user_id = ? ORDER BY created_at ASC, id ASC",
        [userId],
      ),
      query(
        `SELECT COUNT(*) AS total, COALESCE(SUM(revoked_at IS NULL), 0) AS active, COALESCE(SUM(request_count), 0) AS requests
         FROM storage_api_keys WHERE user_id = ?`,
        [userId],
      ),
      query(
        `SELECT l.id, l.action, l.details, l.created_at, a.email AS admin_email
         FROM admin_action_log l
         LEFT JOIN users a ON a.id = l.admin_user_id
         WHERE l.target_type = 'user' AND l.target_id = ?
         ORDER BY l.created_at DESC, l.id ASC LIMIT ?`,
        [userId, ACTIONS_SHOWN],
      ),
    ]);

    return {
      user: toUser(row),
      entitlement: toEntitlement(row),
      banReason: row.banned_at != null ? row.ban_reason ?? null : null,
      buckets: buckets.map((b) => ({ id: b.id, name: b.name, frozen: b.frozen_at != null, createdAt: iso(b.created_at) })),
      apiKeys: {
        total: Number(keys[0]?.total ?? 0),
        active: Number(keys[0]?.active ?? 0),
        requests: Number(keys[0]?.requests ?? 0),
      },
      recentActions: actions.map((a) => ({
        id: a.id,
        summary: summarizeAction(a.action, a.details),
        by: a.admin_email ?? null,
        at: iso(a.created_at),
      })),
    };
  }

  return { adminListUsers, adminGetUserOverview };
}
