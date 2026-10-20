// Rules for the admin file actions: what a request may contain and how a file
// action reads in the admin log. Hand written, no dependencies, so
// `node --test` can run it. The files themselves live in the storage service;
// this only checks what the gateway is asked to do to them.
import { isUuid } from "./storage-quota-schema.js";

export const FLAG_REASON_MAX = 200;
export const OWNERS_PER_REQUEST_MAX = 100;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function cleanReason(input) {
  if (typeof input !== "string") return null;
  const text = input.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, FLAG_REASON_MAX);
  return text.length > 0 ? text : null;
}

// Body of PUT /api/admin/cloud-files
//   { action: "delete", id }
//   { action: "flag", id, reason? }
//   { action: "unflag", id }
export function validateFileAction(body) {
  if (!isPlainObject(body)) return { ok: false, error: "Send an action." };
  if (!isUuid(body.id)) return { ok: false, error: "Unknown file." };
  const id = body.id.toLowerCase();
  if (body.action === "delete") return { ok: true, action: "delete", id };
  if (body.action === "unflag") return { ok: true, action: "unflag", id };
  if (body.action === "flag") {
    if (body.reason !== undefined && body.reason !== null && typeof body.reason !== "string") {
      return { ok: false, error: "The reason must be text." };
    }
    return { ok: true, action: "flag", id, reason: cleanReason(body.reason) };
  }
  return { ok: false, error: "Unknown action." };
}

// Query of GET /api/admin/cloud-files?owners=<id,id,...>. Unknown ids are
// dropped, duplicates collapse, and the list is capped.
export function parseOwnersQuery(params) {
  const raw = params.get("owners") ?? "";
  const ids = [];
  for (const part of raw.split(",")) {
    const id = part.trim().toLowerCase();
    if (isUuid(id) && !ids.includes(id)) ids.push(id);
    if (ids.length >= OWNERS_PER_REQUEST_MAX) break;
  }
  return ids;
}
