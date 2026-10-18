// Server functions for the admin Users and usage pages.
//
// Who owns what: CoralzOne's database knows the people (plan, freeze, ban,
// buckets, admin history), read through the gateway. The storage service knows
// the files, so sizes and counts come from it. These functions combine the two.
// Changing a user (plan, freeze, ban) is not here: that is in
// storage-quota.functions.ts and goes through the audited gateway route.
//
// Every function checks the caller is the admin itself, because each one has
// its own HTTP endpoint and the page guard alone would not protect it.
import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "./admin.functions";
import { mapFileRow, type StorageFile } from "./storage.functions";
import { loadEffectiveSettings } from "./storage-settings.server";
import { STORAGE_PREFIX, storageFetch } from "./storage-service.server";
import { fetchUsage, gateway, errorOf, type UsageMaps } from "./storage-buckets.server";
import {
  ADMIN_USER_PAGE_SIZE, isPlanFilter, isStatusFilter, parseRawAdminUser, parseUserOverview, toAdminUserRow, toUserOverview,
  type AdminUserOverview, type AdminUserRow, type OwnerUsage, type RawAdminUser,
} from "./storage-users";

const UUID_LIKE = /^[0-9a-f-]{36}$/i;
const NEWEST_FILES = 20;

function cleanUserId(input: unknown): string {
  if (typeof input !== "string" || !UUID_LIKE.test(input.trim())) throw new Error("A user id is required");
  return input.trim().toLowerCase();
}

// What the storage service holds for one owner. null when it could not be asked.
function ownerUsage(usage: UsageMaps | null, ownerId: string): OwnerUsage | null {
  if (!usage) return null;
  return { bytes: usage.owners.get(ownerId) ?? 0, files: usage.ownerFiles.has(ownerId) ? usage.ownerFiles.get(ownerId) ?? 0 : null };
}

// ─── The list ────────────────────────────────────────────────────────────────

export type AdminUserList =
  | { ok: true; rows: AdminUserRow[]; total: number; page: number; pageSize: number; usageAvailable: boolean }
  | { ok: false; error: string };

export const adminListCloudUsers = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const page = typeof v.page === "number" && Number.isInteger(v.page) && v.page >= 1 && v.page <= 100_000 ? v.page : 1;
    return {
      q: typeof v.q === "string" ? v.q.slice(0, 100) : "",
      status: isStatusFilter(v.status) ? v.status : "all",
      plan: isPlanFilter(v.plan) ? v.plan : "all",
      page,
    };
  })
  .handler(async ({ data }): Promise<AdminUserList> => {
    await requireAdmin();
    const params = new URLSearchParams({
      q: data.q, status: data.status, plan: data.plan,
      limit: String(ADMIN_USER_PAGE_SIZE), offset: String((data.page - 1) * ADMIN_USER_PAGE_SIZE),
    });
    const reply = await gateway(`/api/admin/cloud-users?${params.toString()}`);
    const raw = Array.isArray(reply.body.users) ? reply.body.users.map(parseRawAdminUser).filter((u): u is RawAdminUser => u !== null) : null;
    if (!reply.ok || !raw) return { ok: false, error: errorOf(reply) };

    const [settings, usage] = await Promise.all([loadEffectiveSettings(), fetchUsage([], raw.map(u => u.id))]);
    return {
      ok: true,
      rows: raw.map(u => toAdminUserRow(u, ownerUsage(usage, u.id), settings)),
      total: Number(reply.body.total ?? raw.length),
      page: data.page,
      pageSize: ADMIN_USER_PAGE_SIZE,
      usageAvailable: usage !== null,
    };
  });

// ─── One user ────────────────────────────────────────────────────────────────

export type AdminUserOverviewResult =
  | { ok: true; overview: AdminUserOverview; files: StorageFile[]; storageOnline: boolean }
  | { ok: false; error: string; notFound?: boolean };

export const adminGetCloudUserOverview = createServerFn({ method: "POST" })
  .inputValidator(cleanUserId)
  .handler(async ({ data }): Promise<AdminUserOverviewResult> => {
    await requireAdmin();
    const reply = await gateway(`/api/admin/cloud-users?id=${encodeURIComponent(data)}`);
    if (reply.status === 404) return { ok: false, error: "User not found.", notFound: true };
    const raw = reply.ok ? parseUserOverview(reply.body) : null;
    if (!raw) return { ok: false, error: errorOf(reply) };

    const [settings, usage, listing] = await Promise.all([
      loadEffectiveSettings(),
      fetchUsage(raw.buckets.map(b => b.id), [raw.user.id]),
      storageFetch<{ files: Array<Record<string, unknown>> }>(`${STORAGE_PREFIX}/files?limit=${NEWEST_FILES}&owner_id=${encodeURIComponent(raw.user.id)}`),
    ]);
    return {
      ok: true,
      overview: toUserOverview(raw, usage ? usage.buckets : null, ownerUsage(usage, raw.user.id), settings),
      files: (listing.data?.files ?? []).map(mapFileRow),
      storageOnline: usage !== null && listing.ok,
    };
  });
