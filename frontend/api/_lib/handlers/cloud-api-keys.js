// The SIGNED IN user's own API keys. Never accepts a user id: it is always the
// verified session's user, and every query also filters by that id.
//
//   GET    /api/cloud/api-keys          list mine, plus the plan's key limit
//   POST   /api/cloud/api-keys {name, bucketId?}   create. The secret is in THIS
//          response only and is never shown again.
//   DELETE /api/cloud/api-keys {id}     revoke (permanent)
import { sendJson, readJsonBody, methodNotAllowed, isTrustedOrigin } from "../http.js";
import { readSessionCookie } from "../security.js";
import { resolveSession } from "../auth-core.js";
import { checkRateLimit } from "../rate-limit.js";
import { getEntitlement } from "../storage-quota-core.js";
import { apiKeyLimitFor, rateLimitFor, validateCreateKey, validateKeyRef } from "../storage-apikey-schema.js";
import { listUserKeys, createUserKey, revokeUserKey } from "../storage-apikey-core.js";

const NO_STORE = { "Cache-Control": "no-store" };

export default async function handler(req, res) {
  const method = req.method;
  if (!["GET", "POST", "DELETE"].includes(method)) return methodNotAllowed(res, ["GET", "POST", "DELETE"]);
  if (method !== "GET" && !isTrustedOrigin(req)) return sendJson(res, 403, { error: "Request rejected" });

  const cookie = readSessionCookie(req);
  if (!cookie) return sendJson(res, 401, { error: "Not signed in" });
  const session = await resolveSession(cookie.sessionId, cookie.token);
  if (!session) return sendJson(res, 401, { error: "Not signed in" });
  const userId = session.user.id;

  const limit = await checkRateLimit(`cloud-api-keys:${userId}`, { max: method === "GET" ? 120 : 20, windowSeconds: 60 });
  if (!limit.allowed) {
    return sendJson(res, 429, { error: "Too many requests. Wait a moment." }, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  if (method === "GET") {
    const entitlement = await getEntitlement(userId);
    if (!entitlement) return sendJson(res, 401, { error: "Not signed in" });
    const keys = await listUserKeys(userId);
    return sendJson(res, 200, {
      keys,
      plan: entitlement.plan,
      keyLimit: apiKeyLimitFor(entitlement.plan),
      activeKeys: keys.filter((k) => !k.revoked).length,
      banned: entitlement.banned,
      rateLimitPerMinute: rateLimitFor(entitlement.plan, null),
    }, NO_STORE);
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  try {
    if (method === "POST") {
      const parsed = validateCreateKey(body);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
      const created = await createUserKey(userId, { name: parsed.name, bucketId: parsed.bucketId });
      if (!created) return sendJson(res, 401, { error: "Not signed in" });
      return sendJson(res, 201, created, NO_STORE);
    }
    const parsed = validateKeyRef(body);
    if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
    const result = await revokeUserKey(userId, parsed.id);
    if (!result) return sendJson(res, 404, { error: "Key not found." });
    return sendJson(res, 200, { ok: true, changed: result.changed }, NO_STORE);
  } catch (error) {
    if (error && error.userFacing) return sendJson(res, 400, { error: error.message });
    throw error;
  }
}
