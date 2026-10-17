// GET /api/admin/cloud-user-controls?user=<id or email>
//     — who the user is + their raw entitlement + ban reason.
// PUT /api/admin/cloud-user-controls  { user, patch }
//     — change plan / extra storage / freeze / manual limits / ban. Audited.
// Admin only (see admin-core.js). Non-admins get the same 404 as an unknown
// route, so this endpoint's existence is never confirmed to them.
import { sendJson, readJsonBody, methodNotAllowed, isTrustedOrigin } from "../http.js";
import { requireAdminSession } from "../admin-core.js";
import { checkRateLimit } from "../rate-limit.js";
import { parseUserRef, validateControlsPatch } from "../storage-quota-schema.js";
import { getAdminUserControls, saveUserControls } from "../storage-quota-core.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "PUT") return methodNotAllowed(res, ["GET", "PUT"]);

  if (req.method === "PUT" && !isTrustedOrigin(req)) {
    return sendJson(res, 403, { error: "Request rejected" });
  }

  const admin = await requireAdminSession(req, res);
  if (!admin) return;

  const limit = await checkRateLimit(`admin-cloud-user-controls:${admin.id}`, { max: 60, windowSeconds: 60 });
  if (!limit.allowed) {
    return sendJson(res, 429, { error: "Too many requests — wait a moment." }, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  if (req.method === "GET") {
    const url = new URL(req.url, "http://localhost");
    const ref = parseUserRef(url.searchParams.get("user") ?? "");
    if (!ref) return sendJson(res, 400, { error: "Enter a valid email address or user id." });
    const found = await getAdminUserControls(ref);
    if (!found) return sendJson(res, 404, { error: "No user found." });
    return sendJson(res, 200, found, { "Cache-Control": "no-store" });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }
  const ref = parseUserRef(typeof body?.user === "string" ? body.user : "");
  if (!ref) return sendJson(res, 400, { error: "Enter a valid email address or user id." });
  const parsed = validateControlsPatch(body?.patch);
  if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

  // Resolve email -> id first so the write itself always targets an id.
  const target = await getAdminUserControls(ref);
  if (!target) return sendJson(res, 404, { error: "No user found." });

  try {
    const changed = await saveUserControls(target.user.id, parsed.patch, admin.id);
    if (changed === null) return sendJson(res, 404, { error: "No user found." });
    const fresh = await getAdminUserControls({ userId: target.user.id });
    return sendJson(res, 200, { ok: true, changed, ...fresh }, { "Cache-Control": "no-store" });
  } catch (error) {
    if (error && error.userFacing) return sendJson(res, 400, { error: error.message });
    throw error;
  }
}
