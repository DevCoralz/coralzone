import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 4000;

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

// 404 for unknown API routes.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`CoralZone backend listening on port ${PORT}`);
});
