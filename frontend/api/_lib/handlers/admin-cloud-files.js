// Admin actions on stored files. Admin only (see admin-core.js): anyone else
// gets the same 404 as an unknown route. Reading and searching files is done
// by the server functions straight against the storage service; this route is
// for what has to be audited or needs the user database.
//
//   GET /api/admin/cloud-files?owners=<id,id,...>   who owns these files (email, banned)
//   PUT /api/admin/cloud-files {action: "delete", id}            remove a file   (audited)
//   PUT /api/admin/cloud-files {action: "flag", id, reason?}     mark for review (audited)
//   PUT /api/admin/cloud-files {action: "unflag", id}            clear the mark  (audited)
//
// Blocking a file type is a setting, so it goes through /api/admin/cloud-settings.
import { sendJson, readJsonBody, methodNotAllowed, isTrustedOrigin } from "../http.js";
import { requireAdminSession } from "../admin-core.js";
import { checkRateLimit } from "../rate-limit.js";
import { parseOwnersQuery, validateFileAction } from "../storage-file-schema.js";
import { ownersInfo, deleteFile, setFlag } from "../storage-file-core.js";

const NO_STORE = { "Cache-Control": "no-store" };

export default async function handler(req, res) {
  const method = req.method;
  if (!["GET", "PUT"].includes(method)) return methodNotAllowed(res, ["GET", "PUT"]);
  if (method !== "GET" && !isTrustedOrigin(req)) return sendJson(res, 403, { error: "Request rejected" });

  const admin = await requireAdminSession(req, res);
  if (!admin) return;

  const limit = await checkRateLimit(`admin-cloud-files:${admin.id}`, { max: method === "GET" ? 120 : 60, windowSeconds: 60 });
  if (!limit.allowed) {
    return sendJson(res, 429, { error: "Too many requests. Wait a moment." }, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  if (method === "GET") {
    const url = new URL(req.url, "http://localhost");
    return sendJson(res, 200, { owners: await ownersInfo(parseOwnersQuery(url.searchParams)) }, NO_STORE);
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }
  const parsed = validateFileAction(body);
  if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

  const result = parsed.action === "delete"
    ? await deleteFile(parsed.id, admin.id)
    : await setFlag(parsed.id, parsed.action === "flag", parsed.reason ?? null, admin.id);
  return sendJson(res, result.status, result.body, NO_STORE);
}
