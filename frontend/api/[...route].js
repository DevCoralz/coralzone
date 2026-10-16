// A single catch-all serverless function for the entire /api surface.
//
// Vercel's Hobby (free) plan caps a deployment at 12 serverless functions,
// and TanStack Start's own SSR entry already uses one. Giving every
// endpoint its own file (the more "idiomatic" Vercel layout) blew past
// that limit once auth was added. Routing everything through one
// `[...route].js` catch-all keeps this deployment at 2 functions total —
// this one, plus TanStack's — with room to add more endpoints later
// without hitting the cap again. Each handler below still lives in its
// own file under api/_lib/handlers/ and is unit-sized exactly like before;
// only the Vercel routing layer changed.
import { sendJson } from "./_lib/http.js";

import health from "./_lib/handlers/health.js";
import stats from "./_lib/handlers/stats.js";
import announcements from "./_lib/handlers/announcements.js";
import activity from "./_lib/handlers/activity.js";
import adminMigrate from "./_lib/handlers/admin-migrate.js";
import authRegister from "./_lib/handlers/auth-register.js";
import authVerifyEmail from "./_lib/handlers/auth-verify-email.js";
import authResendCode from "./_lib/handlers/auth-resend-code.js";
import authLogin from "./_lib/handlers/auth-login.js";
import authLogout from "./_lib/handlers/auth-logout.js";
import authMe from "./_lib/handlers/auth-me.js";
import authGoogle from "./_lib/handlers/auth-google.js";
import authGoogleCallback from "./_lib/handlers/auth-google-callback.js";

// Keyed by "<METHOD> /path" — each handler still checks req.method itself
// too (defense in depth / unit-testability), this table just decides
// which handler a request reaches.
const routes = {
  "GET /health": health,
  "GET /stats": stats,
  "GET /announcements": announcements,
  "POST /activity": activity,
  "GET /admin/migrate": adminMigrate,
  "POST /auth/register": authRegister,
  "POST /auth/verify-email": authVerifyEmail,
  "POST /auth/resend-code": authResendCode,
  "POST /auth/login": authLogin,
  "POST /auth/logout": authLogout,
  "GET /auth/me": authMe,
  "GET /auth/google": authGoogle,
  "GET /auth/google-callback": authGoogleCallback,
};

export default async function handler(req, res) {
  const segments = Array.isArray(req.query.route)
    ? req.query.route
    : req.query.route
      ? [req.query.route]
      : [];
  const path = `/${segments.join("/")}`;
  const match = routes[`${req.method} ${path}`];

  if (!match) {
    return sendJson(res, 404, { error: "Not found" });
  }

  return match(req, res);
}
