import { sendJson, methodNotAllowed } from "./_lib/http.js";

// Live statistics shown on the homepage. Placeholder figures until these
// are wired up to real counts — unrelated to the new auth tables.
export default function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  sendJson(res, 200, {
    members: 12840,
    moviesTracked: 3260,
    dropsThisWeek: 47,
    activeNow: 312,
  });
}
