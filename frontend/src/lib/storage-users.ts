// Pure logic for the admin Users and usage pages, shared by the pages and the
// server functions. No env, no network. The gateway (api/_lib/storage-user-schema.js)
// does the real filtering; this copy of the constants only drives the page, and
// storage-users.test.ts pins the two together.
import { STORAGE_PLANS, isStoragePlanId, type StoragePlanId } from './storage-plans';
import { parseEntitlement, resolveUserQuota, type BlockReason, type UserEntitlement } from './storage-quota';
import { bucketLimitFor, isNearlyFull, ownerFullness, type Bucket, type BucketUsage } from './storage-buckets';
import type { EffectiveStorageSettings } from './storage-settings';
import { formatBytes } from './format';

export const ADMIN_USER_PAGE_SIZE = 25;

export type UserStatusFilter = 'all' | 'frozen' | 'banned';
export type UserPlanFilter = 'all' | StoragePlanId;

export const USER_STATUS_FILTERS: Array<{ id: UserStatusFilter; label: string }> = [
  { id: 'all', label: 'All users' },
  { id: 'frozen', label: 'Frozen' },
  { id: 'banned', label: 'Banned' },
];

export const USER_PLAN_FILTERS: Array<{ id: UserPlanFilter; label: string }> = [
  { id: 'all', label: 'Any plan' },
  { id: 'starter', label: 'Starter' },
  { id: 'pro', label: 'Pro' },
  { id: 'scale', label: 'Scale' },
];

export function isStatusFilter(value: unknown): value is UserStatusFilter {
  return value === 'all' || value === 'frozen' || value === 'banned';
}

export function isPlanFilter(value: unknown): value is UserPlanFilter {
  return value === 'all' || (typeof value === 'string' && isStoragePlanId(value));
}

// What the storage service says one owner holds. files is null when the
// service is an older build that only reports bytes.
export interface OwnerUsage {
  bytes: number;
  files: number | null;
}

// ─── The list ────────────────────────────────────────────────────────────────

// What the gateway returns for one user in the list.
export interface RawAdminUser {
  id: string;
  name: string;
  email: string;
  createdAt: string | null;
  bucketCount: number;
  entitlement: UserEntitlement;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  createdAt: string | null;
  bucketCount: number;
  planLabel: string;
  // null means the storage service could not be reached, so the number is unknown.
  ownerBytes: number | null;
  ownerFiles: number | null;
  quotaBytes: number;
  ratio: number | null;
  nearlyFull: boolean;
  block: 'banned' | 'frozen' | null;
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const asCount = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0);
const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

export function parseRawAdminUser(value: unknown): RawAdminUser | null {
  if (!isObject(value)) return null;
  const entitlement = parseEntitlement(value.entitlement);
  if (typeof value.id !== 'string' || typeof value.email !== 'string' || !entitlement) return null;
  return {
    id: value.id,
    name: asText(value.name),
    email: value.email,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : null,
    bucketCount: asCount(value.bucketCount),
    entitlement,
  };
}

export function toAdminUserRow(raw: RawAdminUser, usage: OwnerUsage | null, settings: EffectiveStorageSettings): AdminUserRow {
  const quota = resolveUserQuota(raw.entitlement, settings);
  const ratio = usage === null ? null : ownerFullness(usage.bytes, quota.bytesQuota);
  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    createdAt: raw.createdAt,
    bucketCount: raw.bucketCount,
    planLabel: quota.planLabel,
    ownerBytes: usage === null ? null : usage.bytes,
    ownerFiles: usage === null ? null : usage.files,
    quotaBytes: quota.bytesQuota,
    ratio,
    nearlyFull: ratio !== null && isNearlyFull(ratio),
    // Maintenance is site wide, not about this person, so it is not shown here.
    block: raw.entitlement.banned ? 'banned' : raw.entitlement.frozen ? 'frozen' : null,
  };
}

export function describeUserUsage(row: AdminUserRow): string {
  if (row.ownerBytes === null) return 'Usage unavailable';
  const files = row.ownerFiles === null ? '' : ` · ${row.ownerFiles.toLocaleString('en-NG')} file${row.ownerFiles === 1 ? '' : 's'}`;
  return `${formatBytes(row.ownerBytes)} of ${formatBytes(row.quotaBytes)}${files}`;
}

export function displayName(user: { name: string; email: string }): string {
  return user.name.trim() || user.email;
}

// ─── One user ────────────────────────────────────────────────────────────────

export interface ApiKeySummary {
  total: number;
  active: number;
  requests: number;
}

export interface UserAction {
  id: string;
  summary: string;
  by: string | null;
  at: string | null;
}

// What the gateway returns for one user's overview.
export interface RawUserOverview {
  user: { id: string; name: string; email: string; createdAt: string | null };
  entitlement: UserEntitlement;
  banReason: string | null;
  buckets: Bucket[];
  apiKeys: ApiKeySummary;
  recentActions: UserAction[];
}

export function parseUserOverview(value: unknown): RawUserOverview | null {
  if (!isObject(value) || !isObject(value.user)) return null;
  const entitlement = parseEntitlement(value.entitlement);
  const u = value.user;
  if (typeof u.id !== 'string' || typeof u.email !== 'string' || !entitlement) return null;

  const buckets: Bucket[] = [];
  for (const item of Array.isArray(value.buckets) ? value.buckets : []) {
    if (!isObject(item) || typeof item.id !== 'string' || typeof item.name !== 'string') continue;
    buckets.push({ id: item.id, name: item.name, frozen: item.frozen === true, createdAt: typeof item.createdAt === 'string' ? item.createdAt : null });
  }
  const keys = isObject(value.apiKeys) ? value.apiKeys : {};
  const actions: UserAction[] = [];
  for (const item of Array.isArray(value.recentActions) ? value.recentActions : []) {
    if (!isObject(item) || typeof item.id !== 'string' || typeof item.summary !== 'string') continue;
    actions.push({ id: item.id, summary: item.summary.slice(0, 140), by: typeof item.by === 'string' ? item.by : null, at: typeof item.at === 'string' ? item.at : null });
  }
  return {
    user: { id: u.id, name: asText(u.name), email: u.email, createdAt: typeof u.createdAt === 'string' ? u.createdAt : null },
    entitlement,
    banReason: typeof value.banReason === 'string' ? value.banReason : null,
    buckets,
    apiKeys: { total: asCount(keys.total), active: asCount(keys.active), requests: asCount(keys.requests) },
    recentActions: actions,
  };
}

export interface UserBucketRow extends Bucket {
  usage: BucketUsage | null;
}

// Files and bytes the owner has that sit in no bucket (older uploads from
// before buckets existed, for example). null when there are none or the
// numbers are not known.
export interface OutsideBuckets {
  bytes: number;
  files: number | null;
}

export function outsideBuckets(owner: OwnerUsage | null, buckets: UserBucketRow[]): OutsideBuckets | null {
  if (owner === null || buckets.some(b => b.usage === null)) return null;
  const inBytes = buckets.reduce((sum, b) => sum + (b.usage?.bytes ?? 0), 0);
  const inFiles = buckets.reduce((sum, b) => sum + (b.usage?.files ?? 0), 0);
  const bytes = Math.max(0, owner.bytes - inBytes);
  const files = owner.files === null ? null : Math.max(0, owner.files - inFiles);
  if (bytes === 0 && (files === null || files === 0)) return null;
  return { bytes, files };
}

// Where a file sits, in words. A bucket id nobody knows any more means the
// bucket was deleted after the file was listed, so say so rather than guess.
export function bucketLabel(bucketId: string | null, buckets: Bucket[]): string {
  if (!bucketId) return 'No bucket';
  return buckets.find(b => b.id === bucketId)?.name ?? 'Unknown bucket';
}

export interface AdminUserOverview {
  user: RawUserOverview['user'];
  planLabel: string;
  banned: boolean;
  frozen: boolean;
  blockReason: BlockReason | null;
  banReason: string | null;
  bytesQuota: number;
  maxUploadBytes: number;
  // null means the storage service could not be reached.
  ownerBytes: number | null;
  ownerFiles: number | null;
  ratio: number | null;
  nearlyFull: boolean;
  bucketLimit: number | null;
  buckets: UserBucketRow[];
  outside: OutsideBuckets | null;
  apiKeys: ApiKeySummary;
  recentActions: UserAction[];
}

export function toUserOverview(raw: RawUserOverview, bucketUsage: Map<string, BucketUsage> | null, owner: OwnerUsage | null, settings: EffectiveStorageSettings): AdminUserOverview {
  const quota = resolveUserQuota(raw.entitlement, settings);
  const buckets: UserBucketRow[] = raw.buckets.map(b => ({ ...b, usage: bucketUsage ? bucketUsage.get(b.id) ?? { files: 0, bytes: 0 } : null }));
  const ratio = owner === null ? null : ownerFullness(owner.bytes, quota.bytesQuota);
  return {
    user: raw.user,
    planLabel: STORAGE_PLANS[raw.entitlement.plan].label,
    banned: raw.entitlement.banned,
    frozen: raw.entitlement.frozen,
    blockReason: quota.blockReason,
    banReason: raw.entitlement.banned ? raw.banReason : null,
    bytesQuota: quota.bytesQuota,
    maxUploadBytes: quota.maxUploadBytes,
    ownerBytes: owner === null ? null : owner.bytes,
    ownerFiles: owner === null ? null : owner.files,
    ratio,
    nearlyFull: ratio !== null && isNearlyFull(ratio),
    bucketLimit: bucketLimitFor(raw.entitlement.plan),
    buckets,
    outside: outsideBuckets(owner, buckets),
    apiKeys: raw.apiKeys,
    recentActions: raw.recentActions,
  };
}

export function pageCountFor(total: number, pageSize = ADMIN_USER_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}
