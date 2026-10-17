// GET /api/admin/cloud-settings — current overrides + when they last changed.
// PUT /api/admin/cloud-settings — apply a partial change; `null` resets one
//                                 setting to its default. Audited.
// Admin only (see admin-core.js).
import { sendJson, readJsonBody, methodNotAllowed, isTrustedOrigin } from "../http.js";
import { requireAdminSession } from "../admin-core.js";
import { checkRateLimit } from "../rate-limit.js";
import { validateSettingsPatch } from "../storage-settings-schema.js";
import { loadOverrides, saveOverrides } from "../storage-settings-core.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "PUT") return methodNotAllowed(res, ["GET", "PUT"]);

  if (req.method === "PUT" && !isTrustedOrigin(req)) {
    return sendJson(res, 403, { error: "Request rejected" });
  }

  const admin = await requireAdminSession(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const { overrides, updatedAt } = await loadOverrides({ useCache: false });
    return sendJson(res, 200, { overrides, updatedAt }, { "Cache-Control": "no-store" });
  }

  const limit = await checkRateLimit(`admin-cloud-settings:${admin.id}`, { max: 30, windowSeconds: 60 });
  if (!limit.allowed) {
    return sendJson(res, 429, { error: "Too many changes — wait a moment." }, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const parsed = validateSettingsPatch(body);
  if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

  const changed = await saveOverrides(parsed.patch, admin.id);
  const { overrides, updatedAt } = await loadOverrides({ useCache: false });
  return sendJson(res, 200, { ok: true, changed, overrides, updatedAt }, { "Cache-Control": "no-store" });
}
