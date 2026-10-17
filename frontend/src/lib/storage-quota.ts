// The quota engine: turns "what we know about a user" (their plan, extra
// storage, freeze/ban flags, manual limits) plus "what the admin settings say
// right now" into the limits that apply, and decides whether an upload is
// allowed. Pure — no env, no network — so it is safe on server and client and
// fully unit tested. This is the ONE copy of this logic; the gateway only
// returns raw facts (api/_lib/storage-quota-core.js).
//
// Order of precedence for a single upload, first failure wins:
//   maintenance -> banned -> frozen -> per-file limit -> free space
import { STORAGE_PLANS, DEFAULT_STORAGE_PLAN, isStoragePlanId, type StoragePlanId } from './storage-plans';
import { effectivePlan, maintenanceMessage, type EffectiveStorageSettings } from './storage-settings';
import { formatBytes } from './format';

// Raw per-user facts, exactly what GET /api/cloud/entitlement returns.
export interface UserEntitlement {
  plan: StoragePlanId;
  extraBytes: number;
  frozen: boolean;
  // null = follow the plan; a number = manual per-user value set by an admin.
  bytesQuotaOverride: number | null;
  maxUploadOverride: number | null;
  banned: boolean;
}

// A user with no stored row is on Starter with no extras and no flags.
export const DEFAULT_ENTITLEMENT: UserEntitlement = {
  plan: DEFAULT_STORAGE_PLAN,
  extraBytes: 0,
  frozen: false,
  bytesQuotaOverride: null,
  maxUploadOverride: null,
  banned: false,
};

// Keep in sync with api/_lib/storage-quota-schema.js (pinned by both tests).
export const CONTROL_KEYS = ['plan', 'extraBytes', 'frozen', 'bytesQuotaOverride', 'maxUploadOverride', 'banned', 'banReason'] as const;
export const BAN_REASON_MAX = 200;

const isFiniteNonNegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

// Defensive: this crossed the network. Anything malformed falls back to the
// safe default for THAT field, except `banned`/`frozen`, which only ever turn
// on from an explicit `true` (a garbled value must never silently lift a ban,
// so those two read strictly and a missing/garbled object is rejected by the
// caller as "could not verify").
export function parseEntitlement(raw: unknown): UserEntitlement | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.banned !== 'boolean' || typeof r.frozen !== 'boolean') return null;
  return {
    plan: typeof r.plan === 'string' && isStoragePlanId(r.plan) ? r.plan : DEFAULT_STORAGE_PLAN,
    extraBytes: isFiniteNonNegative(r.extraBytes) ? r.extraBytes : 0,
    frozen: r.frozen,
    bytesQuotaOverride: isFiniteNonNegative(r.bytesQuotaOverride) ? r.bytesQuotaOverride : null,
    maxUploadOverride: isFiniteNonNegative(r.maxUploadOverride) ? r.maxUploadOverride : null,
    banned: r.banned,
  };
}

export type BlockReason = 'maintenance' | 'banned' | 'frozen';

export interface UserQuota {
  plan: StoragePlanId;
  planLabel: string;
  // Total storage the user may hold: (override ?? plan quota) + extra.
  bytesQuota: number;
  // Largest single file: (override ?? plan limit), never above the global max.
  maxUploadBytes: number;
  extraBytes: number;
  frozen: boolean;
  banned: boolean;
  // Why new uploads are blocked outright, if they are.
  blockReason: BlockReason | null;
  // Short, user-safe sentence for blockReason (never includes admin notes).
  blockMessage: string | null;
}

export const BANNED_MESSAGE = 'Your Cloud storage access has been suspended. Contact support if you think this is a mistake.';
export const FROZEN_MESSAGE = 'Your storage is frozen, so new uploads are paused. Your files are safe. Contact support to unfreeze it.';

export function resolveUserQuota(entitlement: UserEntitlement, settings: EffectiveStorageSettings): UserQuota {
  const plan = effectivePlan(entitlement.plan, settings);
  const baseQuota = entitlement.bytesQuotaOverride ?? plan.bytesQuota;
  const bytesQuota = baseQuota + entitlement.extraBytes;
  const maxUploadBytes = Math.min(entitlement.maxUploadOverride ?? plan.maxUploadBytes, settings.globalMaxUploadBytes);

  let blockReason: BlockReason | null = null;
  let blockMessage: string | null = null;
  if (settings.maintenance.enabled) {
    blockReason = 'maintenance';
    blockMessage = maintenanceMessage(settings);
  } else if (entitlement.banned) {
    blockReason = 'banned';
    blockMessage = BANNED_MESSAGE;
  } else if (entitlement.frozen) {
    blockReason = 'frozen';
    blockMessage = FROZEN_MESSAGE;
  }

  return {
    plan: entitlement.plan,
    planLabel: STORAGE_PLANS[entitlement.plan].label,
    bytesQuota,
    maxUploadBytes,
    extraBytes: entitlement.extraBytes,
    frozen: entitlement.frozen,
    banned: entitlement.banned,
    blockReason,
    blockMessage,
  };
}

export type UploadDecision = { ok: true } | { ok: false; error: string };

// `bytesUsed` is the user's current total from the storage service.
export function checkUpload(quota: UserQuota, settings: EffectiveStorageSettings, fileSize: number, bytesUsed: number): UploadDecision {
  if (quota.blockMessage) return { ok: false, error: quota.blockMessage };

  if (fileSize > quota.maxUploadBytes) {
    const globalIsTheCap = settings.globalMaxUploadBytes < (settings.planQuotas[quota.plan]?.maxUploadBytes ?? Infinity);
    return {
      ok: false,
      error: globalIsTheCap
        ? `Uploads are limited to ${formatBytes(quota.maxUploadBytes)} per file right now.`
        : `File too large for your ${quota.planLabel} plan (max ${formatBytes(quota.maxUploadBytes)}). Upgrade for larger uploads.`,
    };
  }

  const free = Math.max(0, quota.bytesQuota - Math.max(0, bytesUsed));
  if (fileSize > free) {
    return {
      ok: false,
      error: free === 0
        ? `Your storage is full (${formatBytes(quota.bytesQuota)}). Delete files or add storage to upload more.`
        : `Not enough storage: this file is ${formatBytes(fileSize)} but you have ${formatBytes(free)} free of ${formatBytes(quota.bytesQuota)}.`,
    };
  }
  return { ok: true };
}

// Safe summary for the browser (no raw flags beyond what the UI must show).
export interface QuotaSummary {
  plan: StoragePlanId;
  planLabel: string;
  bytesQuota: number;
  maxUploadBytes: number;
  blocked: BlockReason | null;
  blockMessage: string | null;
}

export function summarizeQuota(quota: UserQuota): QuotaSummary {
  return {
    plan: quota.plan,
    planLabel: quota.planLabel,
    bytesQuota: quota.bytesQuota,
    maxUploadBytes: quota.maxUploadBytes,
    blocked: quota.blockReason,
    blockMessage: quota.blockMessage,
  };
}

// What /admin/cloud/users shows and edits for one user. Built on the server
// (storage-quota.server.ts) from the gateway's raw facts + the live settings.
export interface AdminUserControls {
  ok: boolean;
  error?: string;
  user?: { id: string; name: string; email: string };
  entitlement?: UserEntitlement;
  // Admin-only note. Never sent to the user's own pages.
  banReason?: string | null;
  // Live settings, so the form can preview limits while the admin edits.
  settings?: EffectiveStorageSettings;
  changed?: string[];
}

// The patch the admin form sends; the gateway validates every field again.
export type UserControlsPatch = Partial<{
  plan: StoragePlanId;
  extraBytes: number;
  frozen: boolean;
  bytesQuotaOverride: number | null;
  maxUploadOverride: number | null;
  banned: boolean;
  banReason: string | null;
}>;
