// Server functions for the per-user Cloud controls on /admin/cloud/users.
// Thin on purpose: every one re-checks the caller is the admin (a server
// function has its own HTTP endpoint, so the page's route guard alone is not
// enough), then hands off to the gateway, which validates, writes in a
// transaction and records the change in the admin log.
import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "./admin.functions";
import { fetchAdminControls, saveAdminControls } from "./storage-quota.server";
import { CONTROL_KEYS, type AdminUserControls, type UserControlsPatch } from "./storage-quota";

function cleanUserRef(input: unknown): string {
  if (typeof input !== "string" || !input.trim() || input.trim().length > 254) throw new Error("Enter a user's email address or id.");
  return input.trim();
}

// POST, not GET: an email in a query string ends up in access logs.
export const adminLookupUserControls = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => cleanUserRef(input))
  .handler(async ({ data }): Promise<AdminUserControls> => {
    await requireAdmin();
    return fetchAdminControls(data);
  });

export const adminUpdateUserControls = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Send a user and the changes to make.");
    const { user, patch } = input as { user?: unknown; patch?: unknown };
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("No changes to apply.");
    const out: Record<string, unknown> = {};
    for (const key of CONTROL_KEYS) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) out[key] = (patch as Record<string, unknown>)[key];
    }
    if (Object.keys(out).length === 0) throw new Error("No changes to apply.");
    return { user: cleanUserRef(user), patch: out as UserControlsPatch };
  })
  .handler(async ({ data }): Promise<AdminUserControls> => {
    await requireAdmin();
    return saveAdminControls(data.user, data.patch);
  });
