// Admin view of every Cloud API key. Admin only (see admin-core.js): anyone
// else gets the same 404 as an unknown route, so its existence is never
// confirmed. The key hash and the secret never appear here: an admin can
// revoke or slow a key, but can never read or copy one.
//
//   GET /api/admin/cloud-api-keys?q=&status=&limit=&offset=   list + total
//   GET /api/admin/cloud-api-keys?id=<uuid>                   one key
//   PUT /api/admin/cloud-api-keys {action: "revoke", id}                    (audited)
//   PUT /api/admin/cloud-api-keys {action: "rateLimit", id, rateLimitPerMinute}   (audited)
//   PUT /api/admin/cloud-api-keys {action: "revokeAll", userId}             (audited)
import { sendJson, readJsonBody, methodNotAllowed, isTrustedOrigin } from "../http.js";
import { requireAdminSession } from "../admin-core.js";
import { checkRateLimit } from "../rate-limit.js";
import { isUuid } from "../storage-quota-schema.js";
import { parseKeyListQuery, validateAdminKeyAction } from "../storage-apikey-schema.js";
import { adminListKeys, adminGetKey, adminRevokeKey, adminSetRateLimit, adminRevokeAllForUser } from "../storage-apikey-core.js";

const NO_STORE = { "Cache-Control": "no-store" };

export default async function handler(req, res) {
  const method = req.method;
  if (!["GET", "PUT"].includes(method)) return methodNotAllowed(res, ["GET", "PUT"]);
  if (method !== "GET" && !isTrustedOrigin(req)) return sendJson(res, 403, { error: "Request rejected" });

  const admin = await requireAdminSession(req, res);
  if (!admin) return;

  const limit = await checkRateLimit(`admin-cloud-api-keys:${admin.id}`, { max: 120, windowSeconds: 60 });
  if (!limit.allowed) {
    return sendJson(res, 429, { error: "Too many requests. Wait a moment." }, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  if (method === "GET") {
    const url = new URL(req.url, "http://localhost");
    const id = url.searchParams.get("id");
    if (id !== null) {
      if (!isUuid(id)) return sendJson(res, 404, { error: "Key not found." });
      const key = await adminGetKey(id.toLowerCase());
      if (!key) return sendJson(res, 404, { error: "Key not found." });
      return sendJson(res, 200, { key }, NO_STORE);
    }
    return sendJson(res, 200, await adminListKeys(parseKeyListQuery(url.searchParams)), NO_STORE);
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }
  const parsed = validateAdminKeyAction(body);
  if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

  if (parsed.action === "revoke") {
    const result = await adminRevokeKey(parsed.id, admin.id);
    if (!result) return sendJson(res, 404, { error: "Key not found." });
    return sendJson(res, 200, { ok: true, changed: result.changed }, NO_STORE);
  }
  if (parsed.action === "rateLimit") {
    const result = await adminSetRateLimit(parsed.id, parsed.rateLimitPerMinute, admin.id);
    if (!result) return sendJson(res, 404, { error: "Key not found." });
    return sendJson(res, 200, { ok: true, changed: result.changed }, NO_STORE);
  }
  const result = await adminRevokeAllForUser(parsed.userId, admin.id);
  if (!result) return sendJson(res, 404, { error: "User not found." });
  return sendJson(res, 200, { ok: true, revoked: result.revoked }, NO_STORE);
}
