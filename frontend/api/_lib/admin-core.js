// Admin gate for gateway handlers. Mirrors the SSR-side getIsAdmin() in
// src/lib/admin.functions.ts: the verified session's email must equal the
// ADMIN_EMAIL env var. Differences, on purpose:
//   - the email must be VERIFIED, so nobody can claim the admin address by
//     registering it and skipping verification;
//   - anyone else gets the same 404 an unknown route would — the admin API's
//     existence is never confirmed to non-admins. (Signed-out callers get 401
//     so the UI can tell "not signed in" from "not allowed".)
import { sendJson } from "./http.js";
import { readSessionCookie } from "./security.js";
import { resolveSession } from "./auth-core.js";

// Resolves the admin user, or sends the error response itself and returns
// null — callers just `if (!admin) return;`.
export async function requireAdminSession(req, res) {
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();

  const cookie = readSessionCookie(req);
  if (!cookie) {
    sendJson(res, 401, { error: "Not signed in" });
    return null;
  }
  const session = await resolveSession(cookie.sessionId, cookie.token);
  if (!session) {
    sendJson(res, 401, { error: "Not signed in" });
    return null;
  }

  const isAdmin =
    adminEmail.length > 0 &&
    session.user.emailVerified &&
    session.user.email.trim().toLowerCase() === adminEmail;
  if (!isAdmin) {
    sendJson(res, 404, { error: "Not found" });
    return null;
  }
  return session.user;
}
