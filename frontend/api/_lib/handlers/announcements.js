import { sendJson, methodNotAllowed } from "../http.js";

export default function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  sendJson(res, 200, [
    { id: "1", title: "Weekly drop schedule updated", date: "2026-10-14" },
    { id: "2", title: "New members-only screening room", date: "2026-10-10" },
  ]);
}
