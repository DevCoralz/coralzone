// Admin view of every Cloud bucket. Admin only (see admin-core.js): anyone else
// gets the same 404 as an unknown route, so its existence is never confirmed.
//
//   GET    /api/admin/cloud-buckets?q=&status=&limit=&offset=   list + total
//   GET    /api/admin/cloud-buckets?id=<uuid>                   one bucket
//   PUT    /api/admin/cloud-buckets {id, frozen}                freeze / unfreeze (audited)
//   DELETE /api/admin/cloud-buckets {id, filesDeleted}          remove the bucket ROW (audited);
//          the server function has already emptied it in the storage service.
//
// Sizes and file counts are not here: they live in the storage service, and
// the server function adds them (src/lib/storage-buckets.functions.ts).
import { sendJson, readJsonBody, methodNotAllowed, isTrustedOrigin } from "../http.js";
import { requireAdminSession } from "../admin-core.js";
import { checkRateLimit } from "../rate-limit.js";
import { isUuid } from "../storage-quota-schema.js";
import { parseAdminListQuery, validateFreeze, validateAdminDelete } from "../storage-bucket-schema.js";
import { adminListBuckets, adminGetBucket, adminSetBucketFrozen, adminDeleteBucket } from "../storage-bucket-core.js";

const NO_STORE = { "Cache-Control": "no-store" };

export default async function handler(req, res) {
  const method = req.method;
  if (!["GET", "PUT", "DELETE"].includes(method)) return methodNotAllowed(res, ["GET", "PUT", "DELETE"]);
  if (method !== "GET" && !isTrustedOrigin(req)) return sendJson(res, 403, { error: "Request rejected" });

  const admin = await requireAdminSession(req, res);
  if (!admin) return;

  const limit = await checkRateLimit(`admin-cloud-buckets:${admin.id}`, { max: 120, windowSeconds: 60 });
  if (!limit.allowed) {
    return sendJson(res, 429, { error: "Too many requests — wait a moment." }, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  if (method === "GET") {
    const url = new URL(req.url, "http://localhost");
    const id = url.searchParams.get("id");
    if (id !== null) {
      if (!isUuid(id)) return sendJson(res, 404, { error: "Bucket not found." });
      const bucket = await adminGetBucket(id.toLowerCase());
      if (!bucket) return sendJson(res, 404, { error: "Bucket not found." });
      return sendJson(res, 200, { bucket }, NO_STORE);
    }
    return sendJson(res, 200, await adminListBuckets(parseAdminListQuery(url.searchParams)), NO_STORE);
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  if (method === "PUT") {
    const parsed = validateFreeze(body);
    if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
    const result = await adminSetBucketFrozen(parsed.id, parsed.frozen, admin.id);
    if (!result) return sendJson(res, 404, { error: "Bucket not found." });
    return sendJson(res, 200, { ok: true, changed: result.changed }, NO_STORE);
  }

  const parsed = validateAdminDelete(body);
  if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
  const removed = await adminDeleteBucket(parsed.id, parsed.filesDeleted, admin.id);
  if (!removed) return sendJson(res, 404, { error: "Bucket not found." });
  return sendJson(res, 200, { ok: true }, NO_STORE);
}
