// Server-only: loads the signed-in user's quota. Lives in a `.server.ts`
// module because it reaches the gateway through getRequest() — see the note at
// the top of storage-settings.server.ts. Import it ONLY from inside
// createServerFn handlers.
import { callGateway, loadEffectiveSettings } from "./storage-settings.server";
import { parseEntitlement, resolveUserQuota, type AdminUserControls, type UserControlsPatch, type UserQuota } from "./storage-quota";
import type { EffectiveStorageSettings } from "./storage-settings";

export interface QuotaContext {
  settings: EffectiveStorageSettings;
  quota: UserQuota;
}

// Fails CLOSED: if the entitlement can't be read or parsed we return null and
// the caller refuses the action. (Settings, by contrast, fail to defaults so
// an outage never blocks everyone; a ban or freeze must not be skippable by
// making the lookup fail.)
export async function loadMyQuota(): Promise<QuotaContext | null> {
  try {
    const [settings, response] = await Promise.all([loadEffectiveSettings(), callGateway("/api/cloud/entitlement")]);
    if (!response.ok) return null;
    const body = (await response.json()) as { entitlement?: unknown };
    const entitlement = parseEntitlement(body.entitlement);
    if (!entitlement) return null;
    return { settings, quota: resolveUserQuota(entitlement, settings) };
  } catch (error) {
    console.error("[storage-quota] could not load entitlement:", error);
    return null;
  }
}

export const QUOTA_UNAVAILABLE = "We could not verify your storage plan right now. Please try again in a moment.";

// --- Admin: look up / change one user's controls ---------------------------
// Both go through the gateway, which does the real admin check, validation,
// transaction and audit-log write. These just shape the response.

const UNREACHABLE = "Could not reach the controls service.";

async function readAdminControls(response: Response): Promise<AdminUserControls> {
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON error body */
  }
  if (!response.ok) {
    return { ok: false, error: typeof body.error === "string" ? body.error.slice(0, 200) : UNREACHABLE };
  }
  const entitlement = parseEntitlement(body.entitlement);
  const user = body.user as Record<string, unknown> | undefined;
  if (!entitlement || !user || typeof user.id !== "string" || typeof user.email !== "string") {
    return { ok: false, error: UNREACHABLE };
  }
  return {
    ok: true,
    user: { id: user.id, name: typeof user.name === "string" ? user.name : "", email: user.email },
    entitlement,
    banReason: typeof body.banReason === "string" ? body.banReason : null,
    settings: await loadEffectiveSettings(),
    changed: Array.isArray(body.changed) ? body.changed.filter((k): k is string => typeof k === "string") : undefined,
  };
}

export async function fetchAdminControls(user: string): Promise<AdminUserControls> {
  try {
    return await readAdminControls(await callGateway(`/api/admin/cloud-user-controls?user=${encodeURIComponent(user)}`));
  } catch (error) {
    console.error("[storage-quota] admin lookup failed:", error);
    return { ok: false, error: UNREACHABLE };
  }
}

export async function saveAdminControls(user: string, patch: UserControlsPatch): Promise<AdminUserControls> {
  try {
    return await readAdminControls(
      await callGateway("/api/admin/cloud-user-controls", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user, patch }),
      }),
    );
  } catch (error) {
    console.error("[storage-quota] admin update failed:", error);
    return { ok: false, error: UNREACHABLE };
  }
}
