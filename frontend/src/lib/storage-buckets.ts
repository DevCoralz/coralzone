// Pure logic for Cloud buckets, shared by the pages and the server functions:
// names, plan limits, and how "nearly full" is worked out for the admin list.
// No env, no network. The AUTHORITATIVE name and limit checks run in the
// gateway (api/_lib/storage-bucket-schema.js); this copy only gives instant
// feedback, and storage-buckets.test.ts pins the two together.
import { STORAGE_PLANS, type StoragePlanId } from './storage-plans';
import { resolveUserQuota, type UserEntitlement } from './storage-quota';
import type { EffectiveStorageSettings } from './storage-settings';
import { formatBytes } from './format';

export const BUCKET_NAME_MAX = 60;

// localStorage key: the Buckets page sets it, the Storage page reads it, so
// "Open files" lands on that bucket.
export const SELECTED_BUCKET_KEY = 'cloudone-selected-bucket';

// Buckets ("projects") each plan includes. null = unlimited.
// Keep in sync with BUCKET_LIMITS in api/_lib/storage-bucket-schema.js.
export const BUCKET_LIMITS: Record<StoragePlanId, number | null> = { starter: 1, pro: null, scale: null };

export const ADMIN_BUCKET_PAGE_SIZE = 25;
// "Nearly full" starts here (the 80% in the admin brief).
export const NEARLY_FULL_RATIO = 0.8;
// The nearly-full view has to look at every bucket, so it reads at most this many.
export const NEARLY_FULL_SCAN_CAP = 1000;

export interface Bucket {
  id: string;
  name: string;
  frozen: boolean;
  createdAt: string | null;
}

export interface BucketUsage {
  files: number;
  bytes: number;
}

export type MyBucket = Bucket & BucketUsage;

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;

export type NameCheck = { ok: true; name: string } | { ok: false; error: string };

export function validateBucketName(input: string): NameCheck {
  const name = input.replace(/\s+/g, ' ').trim();
  if (name.length === 0) return { ok: false, error: 'Give the bucket a name.' };
  if (name.length > BUCKET_NAME_MAX) return { ok: false, error: `Bucket names can be at most ${BUCKET_NAME_MAX} characters.` };
  if (!NAME_RE.test(name)) return { ok: false, error: 'Use letters, numbers, spaces, dots, dashes and underscores, starting with a letter or number.' };
  return { ok: true, name };
}

export function bucketLimitFor(plan: StoragePlanId): number | null {
  // null means unlimited, so `??` would wrongly turn it into the Starter limit.
  return Object.prototype.hasOwnProperty.call(BUCKET_LIMITS, plan) ? BUCKET_LIMITS[plan] : BUCKET_LIMITS.starter;
}

export function describeBucketLimit(plan: StoragePlanId): string {
  const limit = bucketLimitFor(plan);
  return limit === null ? 'Unlimited buckets' : `${limit} bucket${limit === 1 ? '' : 's'}`;
}

export type CreateCheck = { ok: true } | { ok: false; reason: string };

// For the button state only; the gateway enforces the same rule in a transaction.
export function canCreateBucket(plan: StoragePlanId, currentCount: number): CreateCheck {
  const limit = bucketLimitFor(plan);
  if (limit !== null && currentCount >= limit) {
    return { ok: false, reason: `Your ${STORAGE_PLANS[plan].label} plan includes ${limit} bucket${limit === 1 ? '' : 's'}. Upgrade to create more.` };
  }
  return { ok: true };
}

// How much of the owner's whole allowance is in use (0 when they have none).
// A bucket has no cap of its own: buckets share the owner's quota, so this is
// the number that says "this bucket's owner is running out of room".
export function ownerFullness(ownerBytes: number, ownerQuotaBytes: number): number {
  if (!Number.isFinite(ownerBytes) || !Number.isFinite(ownerQuotaBytes) || ownerQuotaBytes <= 0) return 0;
  return Math.max(0, ownerBytes) / ownerQuotaBytes;
}

export const isNearlyFull = (ratio: number): boolean => ratio >= NEARLY_FULL_RATIO;

export function formatPercent(ratio: number): string {
  const pct = Math.round(ratio * 100);
  return pct > 999 ? '999%+' : `${pct}%`;
}

// --- admin rows --------------------------------------------------------------

// What the gateway returns for one bucket in the admin list.
export interface RawAdminBucket extends Bucket {
  owner: { id: string; email: string; name: string };
  entitlement: UserEntitlement;
}

export interface AdminBucketRow extends Bucket {
  owner: { id: string; email: string; name: string };
  planLabel: string;
  // null = the storage service could not be reached, so the number is unknown.
  usage: BucketUsage | null;
  ownerBytes: number | null;
  ownerQuotaBytes: number;
  ownerRatio: number | null;
  nearlyFull: boolean;
  ownerBlock: 'banned' | 'frozen' | null;
}

export function toAdminRow(raw: RawAdminBucket, usage: BucketUsage | null, ownerBytes: number | null, settings: EffectiveStorageSettings): AdminBucketRow {
  const quota = resolveUserQuota(raw.entitlement, settings);
  const ratio = ownerBytes === null ? null : ownerFullness(ownerBytes, quota.bytesQuota);
  return {
    id: raw.id,
    name: raw.name,
    frozen: raw.frozen,
    createdAt: raw.createdAt,
    owner: raw.owner,
    planLabel: quota.planLabel,
    usage,
    ownerBytes,
    ownerQuotaBytes: quota.bytesQuota,
    ownerRatio: ratio,
    nearlyFull: ratio !== null && isNearlyFull(ratio),
    // maintenance is site-wide, not about this owner, so it is not shown here
    ownerBlock: raw.entitlement.banned ? 'banned' : raw.entitlement.frozen ? 'frozen' : null,
  };
}

// Fullest owners first, then by name, so the worst cases are at the top.
export function sortFullestFirst(rows: AdminBucketRow[]): AdminBucketRow[] {
  return [...rows].sort((a, b) => (b.ownerRatio ?? -1) - (a.ownerRatio ?? -1) || a.name.localeCompare(b.name));
}

export function describeUsage(row: AdminBucketRow): string {
  if (!row.usage) return 'Usage unavailable';
  return `${formatBytes(row.usage.bytes)} · ${row.usage.files.toLocaleString('en-NG')} file${row.usage.files === 1 ? '' : 's'}`;
}

export function pageCount(total: number, pageSize = ADMIN_BUCKET_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}
