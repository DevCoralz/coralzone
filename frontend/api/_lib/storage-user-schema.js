// Validation and wording for the admin Users and usage pages. Written by hand
// with no dependencies so `node --test` can run it. This is the real check;
// src/lib/storage-users.ts only copies the constants for the page, and both
// test suites pin them together.
import { ADMIN_LIST_LIMIT, ADMIN_SEARCH_MAX } from "./storage-bucket-schema.js";
import { PLAN_IDS } from "./storage-settings-schema.js";

export const USER_STATUSES = ["all", "frozen", "banned"];
export const USER_PLAN_FILTERS = ["all", ...PLAN_IDS];
export const USER_LIST_LIMIT = ADMIN_LIST_LIMIT;

// Query string of GET /api/admin/cloud-users. Bad values fall back to the
// defaults instead of failing: this is a read only list.
export function parseUserListQuery(params) {
  const rawQ = (params.get("q") ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const q = rawQ.slice(0, ADMIN_SEARCH_MAX);
  const status = USER_STATUSES.includes(params.get("status")) ? params.get("status") : "all";
  const plan = USER_PLAN_FILTERS.includes(params.get("plan")) ? params.get("plan") : "all";
  const limitRaw = Number(params.get("limit"));
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1 ? Math.min(limitRaw, USER_LIST_LIMIT.max) : USER_LIST_LIMIT.default;
  const offsetRaw = Number(params.get("offset"));
  const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 && offsetRaw <= 1_000_000 ? offsetRaw : 0;
  return { q, status, plan, limit, offset };
}

// What each control means in plain words, for the "recent admin actions" list.
const CONTROL_PHRASES = {
  plan: () => "changed the plan",
  extraBytes: () => "changed extra storage",
  bytesQuotaOverride: () => "changed the storage override",
  maxUploadOverride: () => "changed the upload limit override",
  banReason: () => "changed the ban reason",
  frozen: (change) => (change?.to === true ? "froze uploads" : "unfroze uploads"),
  banned: (change) => (change?.to === true ? "banned the user" : "lifted the ban"),
};

const SUMMARY_MAX = 140;

function sentence(parts) {
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// One short line for an audit log row. The raw details are never sent to the
// page: only this summary is, so a long or odd log entry cannot flood the UI.
export function summarizeAction(action, detailsText) {
  if (action !== "cloud.user.controls.update") {
    return String(action ?? "").replace(/[^\w. ]/g, "").slice(0, SUMMARY_MAX) || "Admin action";
  }
  let changes = null;
  try {
    const parsed = JSON.parse(String(detailsText ?? ""));
    changes = parsed && typeof parsed === "object" ? parsed.changes : null;
  } catch {
    changes = null;
  }
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return "Changed storage controls";
  const parts = Object.keys(changes)
    .filter((key) => Object.prototype.hasOwnProperty.call(CONTROL_PHRASES, key))
    .map((key) => CONTROL_PHRASES[key](changes[key]));
  return parts.length > 0 ? sentence(parts).slice(0, SUMMARY_MAX) : "Changed storage controls";
}
