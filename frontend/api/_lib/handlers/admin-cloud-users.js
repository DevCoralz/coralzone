// Admin view of every user's Cloud storage facts. Read only, admin only (see
// admin-core.js): anyone else gets the same 404 as an unknown route.
//
//   GET /api/admin/cloud-users?q=&status=&plan=&limit=&offset=   list + total
//   GET /api/admin/cloud-users?id=<uuid>                         one user's overview
//
// Sizes and file counts are not here: they live in the storage service, and
// the server function adds them (src/lib/storage-users.functions.ts).
// Changing a user (plan, freeze, ban) stays in admin-cloud-user-controls.js.
import { sendJson, methodNotAllowed } from "../http.js";
import { requireAdminSession } from "../admin-core.js";
import { checkRateLimit } from "../rate-limit.js";
import { isUuid } from "../storage-quota-schema.js";
import { parseUserListQuery } from "../storage-user-schema.js";
import { adminListUsers, adminGetUserOverview } from "../storage-user-core.js";

const NO_STORE = { "Cache-Control": "no-store" };

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const admin = await requireAdminSession(req, res);
  if (!admin) return;

  const limit = await checkRateLimit(`admin-cloud-users:${admin.id}`, { max: 120, windowSeconds: 60 });
  if (!limit.allowed) {
    return sendJson(res, 429, { error: "Too many requests. Wait a moment." }, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  const url = new URL(req.url, "http://localhost");
  const id = url.searchParams.get("id");
  if (id !== null) {
    if (!isUuid(id)) return sendJson(res, 404, { error: "User not found." });
    const overview = await adminGetUserOverview(id.toLowerCase());
    if (!overview) return sendJson(res, 404, { error: "User not found." });
    return sendJson(res, 200, overview, NO_STORE);
  }
  return sendJson(res, 200, await adminListUsers(parseUserListQuery(url.searchParams)), NO_STORE);
}
