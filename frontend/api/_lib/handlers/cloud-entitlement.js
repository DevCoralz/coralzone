// GET /api/cloud/entitlement — the SIGNED-IN user's own raw storage
// entitlement (plan, extra storage, frozen, manual limits, banned). Used by
// the SSR server functions to decide uploads/downloads; the limits that
// apply right now are derived from it in src/lib/storage-quota.ts.
// Never returns a ban reason, and never accepts a user id: it is always the
// verified session's own user.
import { sendJson, methodNotAllowed } from "../http.js";
import { readSessionCookie } from "../security.js";
import { resolveSession } from "../auth-core.js";
import { getEntitlement } from "../storage-quota-core.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const cookie = readSessionCookie(req);
  if (!cookie) return sendJson(res, 401, { error: "Not signed in" });
  const session = await resolveSession(cookie.sessionId, cookie.token);
  if (!session) return sendJson(res, 401, { error: "Not signed in" });

  const entitlement = await getEntitlement(session.user.id);
  if (!entitlement) return sendJson(res, 401, { error: "Not signed in" });
  return sendJson(res, 200, { entitlement }, { "Cache-Control": "no-store" });
}
