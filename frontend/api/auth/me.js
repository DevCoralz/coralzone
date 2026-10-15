import { sendJson, methodNotAllowed } from "../_lib/http.js";
import { readSessionCookie } from "../_lib/security.js";
import { resolveSession } from "../_lib/auth-core.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const cookie = readSessionCookie(req);
  if (!cookie) return sendJson(res, 401, { error: "Not signed in" });

  const session = await resolveSession(cookie.sessionId, cookie.token);
  if (!session) return sendJson(res, 401, { error: "Not signed in" });

  return sendJson(res, 200, { user: session.user });
}
