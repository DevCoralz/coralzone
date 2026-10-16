import { sendJson, methodNotAllowed } from "../http.js";

export default function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  sendJson(res, 200, { status: "ok", service: "coralzone", time: new Date().toISOString() });
}
