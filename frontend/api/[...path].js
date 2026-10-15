// Single serverless function for every /api/* route.
// Vercel Hobby allows max 12 functions; this keeps /api at exactly one.
// Real handlers live in /server/handlers (outside /api, so Vercel doesn't
// turn each one into its own function).
import { sendJson } from "../server/handlers/_lib/http.js";

const routes = {
  "activity": () => import("../server/handlers/activity.js"),
  "announcements": () => import("../server/handlers/announcements.js"),
  "stats": () => import("../server/handlers/stats.js"),
  "health": () => import("../server/handlers/health.js"),
  "admin/migrate": () => import("../server/handlers/admin/migrate.js"),
  "auth/google-callback": () => import("../server/handlers/auth/google-callback.js"),
  "auth/google": () => import("../server/handlers/auth/google.js"),
  "auth/login": () => import("../server/handlers/auth/login.js"),
  "auth/logout": () => import("../server/handlers/auth/logout.js"),
  "auth/me": () => import("../server/handlers/auth/me.js"),
  "auth/register": () => import("../server/handlers/auth/register.js"),
  "auth/resend-code": () => import("../server/handlers/auth/resend-code.js"),
  "auth/verify-email": () => import("../server/handlers/auth/verify-email.js"),
};

export default async function handler(req, res) {
  const pathname = new URL(req.url, "http://x").pathname;
  const key = pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
  const load = Object.hasOwn(routes, key) ? routes[key] : null;
  if (!load) return sendJson(res, 404, { error: "Not found" });
  try {
    const mod = await load();
    return await mod.default(req, res);
  } catch (err) {
    console.error(`[api/${key}]`, err);
    if (!res.headersSent) return sendJson(res, 500, { error: "Internal server error" });
  }
}
