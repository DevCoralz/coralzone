// Database side of the admin file actions: who owns a file (to show an email
// instead of an id) and the admin log. Every query uses `?` placeholders. The
// files themselves are in the storage service; see storage-file-admin.js.
import { randomUUID } from "node:crypto";

const LOG_DETAILS_MAX = 8_000;

export function makeFileStore({ query }) {
  // Owners of the files on a page, in one query. Unknown ids are simply absent.
  async function ownersInfo(ids) {
    if (ids.length === 0) return [];
    const rows = await query(
      `SELECT u.id, u.name, u.email, bn.banned_at
       FROM users u LEFT JOIN storage_user_bans bn ON bn.user_id = u.id
       WHERE u.id IN (?)`,
      [ids],
    );
    return rows.map((row) => ({ id: row.id, name: row.name ?? "", email: row.email, banned: row.banned_at != null }));
  }

  async function logFileAction(adminUserId, action, fileId, details) {
    await query(
      `INSERT INTO admin_action_log (id, admin_user_id, action, target_type, target_id, details)
       VALUES (?, ?, ?, 'file', ?, ?)`,
      [randomUUID(), adminUserId, action, fileId, JSON.stringify(details).slice(0, LOG_DETAILS_MAX)],
    );
  }

  return { ownersInfo, logFileAction };
}
