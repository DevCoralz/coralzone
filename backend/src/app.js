import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

// Health check — used by hosting platforms to confirm the API is up.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "coralzone-backend", time: new Date().toISOString() });
});

// Live statistics shown on the homepage.
app.get("/api/stats", (_req, res) => {
  res.json({
    members: 12840,
    moviesTracked: 3260,
    dropsThisWeek: 47,
    activeNow: 312,
  });
});

// Movie announcements feed.
app.get("/api/announcements", (_req, res) => {
  res.json([
    { id: "1", title: "Weekly drop schedule updated", date: "2026-10-14" },
    { id: "2", title: "New members-only screening room", date: "2026-10-10" },
  ]);
});

// Site activity heartbeat, backing SiteActivity.tsx.
//
// IN-MEMORY ONLY — fine on a single long-running Node process (Render,
// Railway, Fly, a VPS). On Vercel's Node runtime this process is a
// serverless function: no app.listen(), cold starts recycle the instance,
// and concurrent requests can land on different instances that don't share
// this Map. Counts will under-report and reset unpredictably in that
// environment. Swap lastSeenByVisitor for Upstash Redis (or Vercel KV) if
// you deploy this on Vercel and want accurate numbers.
const ONLINE_WINDOW_MS = 90_000;
const SWEEP_INTERVAL_MS = 60_000;
const lastSeenByVisitor = new Map(); // visitorId -> epoch ms
let totalUsers = 0; // no account system wired up yet — placeholder until auth lands

const VISITOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.post("/api/activity", (req, res) => {
  const visitorId = req.body?.visitorId;
  if (typeof visitorId !== "string" || !VISITOR_ID_RE.test(visitorId)) {
    return res.status(400).json({ error: "Invalid visitorId" });
  }
  const now = Date.now();
  lastSeenByVisitor.set(visitorId, now);

  let online = 0;
  for (const lastSeen of lastSeenByVisitor.values()) {
    if (now - lastSeen <= ONLINE_WINDOW_MS) online++;
  }

  res.json({ online, visitors: lastSeenByVisitor.size, users: totalUsers });
});

// Drop stale visitors so the map doesn't grow unbounded over a long-running process.
// Only meaningful on a persistent host — see note above for Vercel.
if (!process.env.VERCEL) {
  setInterval(() => {
    const cutoff = Date.now() - ONLINE_WINDOW_MS;
    for (const [visitorId, lastSeen] of lastSeenByVisitor) {
      if (lastSeen < cutoff) lastSeenByVisitor.delete(visitorId);
    }
  }, SWEEP_INTERVAL_MS).unref();
}

// 404 for unknown API routes.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

export default app;
