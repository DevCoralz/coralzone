// The SIGNED-IN user's own buckets. Never accepts a user id: it is always the
// verified session's user, and every query also filters by that id, so asking
// for someone else's bucket looks exactly like asking for one that doesn't exist.
//
//   GET    /api/cloud/buckets            list mine  (or ?id=<uuid> for one)
//   POST   /api/cloud/buckets {name}     create     (plan limit + unique name)
//   PUT    /api/cloud/buckets {id,name}  rename
//   DELETE /api/cloud/buckets {id}       delete the bucket ROW. The server
//          function checks first that the bucket holds no files.
import { sendJson, readJsonBody, methodNotAllowed, isTrustedOrigin } from "../http.js";
import { readSessionCookie } from "../security.js";
import { resolveSession } from "../auth-core.js";
import { checkRateLimit } from "../rate-limit.js";
import { isUuid } from "../storage-quota-schema.js";
import { validateCreate, validateRename, validateBucketRef } from "../storage-bucket-schema.js";
import { listUserBuckets, getUserBucket, createUserBucket, renameUserBucket, deleteUserBucket } from "../storage-bucket-core.js";

const NO_STORE = { "Cache-Control": "no-store" };

export default async function handler(req, res) {
  const method = req.method;
  if (!["GET", "POST", "PUT", "DELETE"].includes(method)) return methodNotAllowed(res, ["GET", "POST", "PUT", "DELETE"]);
  if (method !== "GET" && !isTrustedOrigin(req)) return sendJson(res, 403, { error: "Request rejected" });

  const cookie = readSessionCookie(req);
  if (!cookie) return sendJson(res, 401, { error: "Not signed in" });
  const session = await resolveSession(cookie.sessionId, cookie.token);
  if (!session) return sendJson(res, 401, { error: "Not signed in" });
  const userId = session.user.id;

  const limit = await checkRateLimit(`cloud-buckets:${userId}`, { max: method === "GET" ? 120 : 30, windowSeconds: 60 });
  if (!limit.allowed) {
    return sendJson(res, 429, { error: "Too many requests — wait a moment." }, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  if (method === "GET") {
    const url = new URL(req.url, "http://localhost");
    const id = url.searchParams.get("id");
    if (id !== null) {
      if (!isUuid(id)) return sendJson(res, 404, { error: "Bucket not found." });
      const bucket = await getUserBucket(userId, id.toLowerCase());
      if (!bucket) return sendJson(res, 404, { error: "Bucket not found." });
      return sendJson(res, 200, { bucket }, NO_STORE);
    }
    return sendJson(res, 200, { buckets: await listUserBuckets(userId) }, NO_STORE);
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  try {
    if (method === "POST") {
      const parsed = validateCreate(body);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
      const bucket = await createUserBucket(userId, parsed.name);
      if (!bucket) return sendJson(res, 401, { error: "Not signed in" });
      return sendJson(res, 201, { bucket }, NO_STORE);
    }
    if (method === "PUT") {
      const parsed = validateRename(body);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
      const bucket = await renameUserBucket(userId, parsed.id, parsed.name);
      if (!bucket) return sendJson(res, 404, { error: "Bucket not found." });
      return sendJson(res, 200, { bucket }, NO_STORE);
    }
    const parsed = validateBucketRef(body);
    if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
    const removed = await deleteUserBucket(userId, parsed.id);
    if (!removed) return sendJson(res, 404, { error: "Bucket not found." });
    return sendJson(res, 200, { ok: true }, NO_STORE);
  } catch (error) {
    if (error && error.userFacing) return sendJson(res, 400, { error: error.message });
    throw error;
  }
}
