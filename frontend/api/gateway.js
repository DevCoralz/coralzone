// A single serverless function for the entire /api surface.
//
// Vercel's Hobby (free) plan caps a deployment at 12 serverless functions,
// and TanStack Start's own SSR entry already uses one. Giving every
// endpoint its own file blew past that limit once auth was added.
//
// This project's build (TanStack Start's nitro "vercel" preset) generates
// its own `.vercel/output` directly rather than leaving plain zero-config
// detection to Vercel, which made a `[...route].js`-style dynamic
// filename unreliable here — it isn't a convention nitro's own build
// knows about. vercel.json's rewrite below is the explicit, Vercel-native
// fix: every request under /api/* is rewritten to this one plainly-named
// function with the original path passed as ?route=..., so there's no
// filesystem routing magic for the build to possibly drop. See
// /frontend/vercel.json.
//
// Each handler still lives in its own file under api/_lib/handlers/ and
// is unit-sized exactly like before; only the routing layer changed.
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
import cloudSettings from "./_lib/handlers/cloud-settings.js";
import adminCloudSettings from "./_lib/handlers/admin-cloud-settings.js";

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
  "GET /cloud/settings": cloudSettings,
  "GET /admin/cloud-settings": adminCloudSettings,
  "PUT /admin/cloud-settings": adminCloudSettings,
};

// Recognizable messages from our own config-validation checks (missing
// env vars, bad DATABASE_URL, etc. — see db.js, security.js, mailer.js).
// Safe to show verbatim: they never contain request data, only which
// setting is missing. Anything else (a raw driver error, say) is logged
// server-side only and the client gets a generic message instead — a
// mysql2 connection error can embed a hostname and that's not something
// to hand back over HTTP.
const SAFE_ERROR_PREFIXES = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "Email delivery is not configured",
];

function isSafeToShow(message) {
  return SAFE_ERROR_PREFIXES.some((prefix) => message.startsWith(prefix));
}

export default async function handler(req, res) {
  // vercel.json rewrites /api/<anything> to /api/gateway?route=<anything>
  // (a single string — this is a rewrite's capture group, not a
  // filesystem catch-all segment, so it's never an array).
  const routeParam = Array.isArray(req.query.route) ? req.query.route[0] : req.query.route;
  const path = `/${(routeParam || "").replace(/^\/+/, "")}`;
  const match = routes[`${req.method} ${path}`];

  if (!match) {
    return sendJson(res, 404, { error: "Not found" });
  }

  try {
    await match(req, res);
  } catch (error) {
    // A handler throwing (vs. returning a JSON error itself) means it hit
    // something unexpected — most often a missing/misconfigured env var
    // the first time this is deployed. Without this, Vercel's own crash
    // page (not JSON) reaches the client, which is why that page shows a
    // bare "Something went wrong" with no clue what broke. Always log the
    // full error so it's visible in Vercel's function logs either way.
    console.error(`[api] ${req.method} ${path} failed:`, error);
    if (!res.headersSent) {
      const message = error instanceof Error && isSafeToShow(error.message)
        ? `Server misconfigured: ${error.message}`
        : "Something went wrong on our end. Check the Vercel function logs for details.";
      sendJson(res, 500, { error: message });
    }
  }
}
