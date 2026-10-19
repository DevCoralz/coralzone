// GET /api/v1/usage  (X-API-Key). What the key's owner holds, plus this key's
// own limit. The owner id comes from the key, never from the request.
import { sendJson, methodNotAllowed } from "../http.js";
import { authenticateApiKey } from "../api-key-auth-core.js";
import { rateLimitFor } from "../storage-apikey-schema.js";
import { storageGet } from "../storage-service.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.error }, auth.headers);
  const { principal } = auth;

  const usage = await storageGet(`/api/v1/storage/usage?owner_id=${encodeURIComponent(principal.userId)}`);
  if (!usage) return sendJson(res, 503, { error: "Storage is unavailable right now. Try again shortly." }, auth.headers);
  return sendJson(res, 200, {
    plan: principal.plan,
    storage: { bytesUsed: Number(usage.bytesUsed ?? 0), files: Number(usage.requests ?? 0) },
    key: { bucketId: principal.bucketId, rateLimitPerMinute: rateLimitFor(principal.plan, principal.rateLimitPerMinute) },
  }, { ...auth.headers, "Cache-Control": "no-store" });
}
