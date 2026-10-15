import { sendJson, methodNotAllowed } from "./_lib/http.js";

// Site activity heartbeat, backing SiteActivity.tsx.
//
// IN-MEMORY ONLY — fine while this stays a single warm instance, but
// Vercel's Node runtime can spin up several instances under load that
// don't share this Map, so counts can under-report. Swap
// lastSeenByVisitor for Upstash Redis / Vercel KV if you need accurate
// numbers across instances.
const ONLINE_WINDOW_MS = 90_000;
const globalForActivity = globalThis;
const lastSeenByVisitor = (globalForActivity.__coralzoneLastSeen ??= new Map());
let totalUsers = 0; // real account count isn't wired up to this endpoint yet

const VISITOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const visitorId = req.body?.visitorId;
  if (typeof visitorId !== "string" || !VISITOR_ID_RE.test(visitorId)) {
    return sendJson(res, 400, { error: "Invalid visitorId" });
  }

  const now = Date.now();
  lastSeenByVisitor.set(visitorId, now);

  // Opportunistic sweep so the map doesn't grow unbounded on a long-lived
  // warm instance.
  for (const [id, lastSeen] of lastSeenByVisitor) {
    if (now - lastSeen > ONLINE_WINDOW_MS * 4) lastSeenByVisitor.delete(id);
  }

  let online = 0;
  for (const lastSeen of lastSeenByVisitor.values()) {
    if (now - lastSeen <= ONLINE_WINDOW_MS) online++;
  }

  sendJson(res, 200, { online, visitors: lastSeenByVisitor.size, users: totalUsers });
}
