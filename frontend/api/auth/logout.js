import { sendJson, methodNotAllowed, isTrustedOrigin } from "../_lib/http.js";
import { readSessionCookie, clearSessionCookie } from "../_lib/security.js";
import { revokeSession } from "../_lib/auth-core.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!isTrustedOrigin(req)) return sendJson(res, 403, { error: "Request rejected" });

  const cookie = readSessionCookie(req);
  if (cookie) {
    await revokeSession(cookie.sessionId).catch((error) => {
      console.error("[auth/logout] failed to revoke session:", error);
    });
  }

  return sendJson(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
}
