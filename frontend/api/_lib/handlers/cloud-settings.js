// GET /api/cloud/settings — the admin-saved overrides for Cloud storage
// (limits, plan quotas, extra-storage price, allowed file groups,
// maintenance flag). Public on purpose: nothing here is secret (the pricing
// page shows the same numbers) and the upload path needs it. Callers merge
// it over the built-in defaults in src/lib/storage-settings.ts.
import { sendJson, methodNotAllowed } from "../http.js";
import { loadOverrides } from "../storage-settings-core.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const { overrides } = await loadOverrides();
  return sendJson(res, 200, { overrides }, { "Cache-Control": "no-store" });
}
