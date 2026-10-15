import { sendJson, methodNotAllowed } from "./_lib/http.js";

export default function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  sendJson(res, 200, { status: "ok", service: "coralzone", time: new Date().toISOString() });
}
