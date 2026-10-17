// Server functions for the admin-editable Cloud storage settings.
//
// The settings live in MySQL, which — like the session check in
// auth-session.functions.ts — is only ever reached through the /api gateway
// (api/_lib/handlers/*), never directly from the SSR runtime. So these
// functions are thin: they call the gateway on this same origin, forwarding
// the caller's cookie, and the gateway does the real auth + validation.
//   getEffectiveStorageSettings  — public read (pricing page, upload checks)
//   adminGetStorageSettings      — admin: overrides + effective + last saved
//   adminUpdateStorageSettings   — admin: partial update, audited
import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "./admin.functions";
import { callGateway, loadEffectiveSettings } from "./storage-settings.server";
import { resolveStorageSettings, type EffectiveStorageSettings, type StorageSettingsOverrides } from "./storage-settings";

const SETTING_KEYS = ["globalMaxUploadBytes", "extraStoragePriceNgn", "allowedFileGroups", "planQuotas", "maintenance"] as const;

export const getEffectiveStorageSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<EffectiveStorageSettings> => loadEffectiveSettings(),
);

export interface AdminStorageSettings {
  ok: boolean;
  error?: string;
  overrides: StorageSettingsOverrides;
  effective: EffectiveStorageSettings;
  updatedAt: string | null;
}

async function readAdminResponse(response: Response): Promise<AdminStorageSettings> {
  let body: { overrides?: StorageSettingsOverrides; updatedAt?: string | null; error?: string } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    /* non-JSON error body */
  }
  const overrides = response.ok && body.overrides ? body.overrides : {};
  return {
    ok: response.ok,
    error: response.ok ? undefined : typeof body.error === "string" ? body.error.slice(0, 200) : "Could not reach the settings service.",
    overrides,
    effective: resolveStorageSettings(overrides),
    updatedAt: response.ok ? (body.updatedAt ?? null) : null,
  };
}

export const adminGetStorageSettings = createServerFn({ method: "GET" }).handler(async (): Promise<AdminStorageSettings> => {
  await requireAdmin();
  try {
    return await readAdminResponse(await callGateway("/api/admin/cloud-settings"));
  } catch (error) {
    console.error("[storage-settings] admin read failed:", error);
    return { ok: false, error: "Could not reach the settings service.", overrides: {}, effective: resolveStorageSettings({}), updatedAt: null };
  }
});

// `patch` is { <setting>: value | null }; null resets that setting to its
// default. Only known keys are forwarded; the gateway validates every value.
export const adminUpdateStorageSettings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Send an object of settings to change.");
    const out: Record<string, unknown> = {};
    for (const key of SETTING_KEYS) {
      if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = (input as Record<string, unknown>)[key];
    }
    if (Object.keys(out).length === 0) throw new Error("No settings to change.");
    return out;
  })
  .handler(async ({ data }): Promise<AdminStorageSettings> => {
    await requireAdmin();
    try {
      return await readAdminResponse(
        await callGateway("/api/admin/cloud-settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        }),
      );
    } catch (error) {
      console.error("[storage-settings] admin update failed:", error);
      return { ok: false, error: "Could not reach the settings service.", overrides: {}, effective: resolveStorageSettings({}), updatedAt: null };
    }
  });
