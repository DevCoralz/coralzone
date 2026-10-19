// Pure logic for Cloud API keys, shared by the pages and the server functions.
// No env, no network. The gateway (api/_lib/storage-apikey-schema.js) does the
// real checking; this copy of the rules only gives quick feedback, and
// storage-apikeys.test.ts pins the two together.
import { STORAGE_PLANS, isStoragePlanId, type StoragePlanId } from './storage-plans';
import { formatDateTime } from './format';

export const KEY_PREFIX = 'cz_live_';
export const KEY_NAME_MAX = 60;
export const ADMIN_KEY_PAGE_SIZE = 25;
export const RATE_LIMIT_RANGE = { min: 1, max: 10_000 } as const;

// Requests a minute for one key when an admin has set nothing custom.
// Keep in sync with API_RATE_DEFAULTS in api/_lib/storage-apikey-schema.js.
export const API_RATE_DEFAULTS: Record<StoragePlanId, number> = { starter: 60, pro: 300, scale: 1200 };

export type KeyStatusFilter = 'all' | 'active' | 'revoked';

export const KEY_STATUS_FILTERS: Array<{ id: KeyStatusFilter; label: string }> = [
  { id: 'all', label: 'All keys' },
  { id: 'active', label: 'Active' },
  { id: 'revoked', label: 'Revoked' },
];

export function isKeyStatusFilter(value: unknown): value is KeyStatusFilter {
  return value === 'all' || value === 'active' || value === 'revoked';
}

// Active keys a plan includes. null means unlimited. The plan table is the
// one source for this number.
export function apiKeyLimitFor(plan: StoragePlanId): number | null {
  return STORAGE_PLANS[plan].apiKeyLimit;
}

export function rateLimitFor(plan: StoragePlanId, custom: number | null): number {
  return custom !== null && Number.isSafeInteger(custom) && custom >= RATE_LIMIT_RANGE.min ? custom : API_RATE_DEFAULTS[plan];
}

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;

export type NameCheck = { ok: true; name: string } | { ok: false; error: string };

export function validateKeyName(input: string): NameCheck {
  const name = input.replace(/\s+/g, ' ').trim();
  if (name.length === 0) return { ok: false, error: 'Give the key a name.' };
  if (name.length > KEY_NAME_MAX) return { ok: false, error: `Key names can be at most ${KEY_NAME_MAX} characters.` };
  if (!NAME_RE.test(name)) return { ok: false, error: 'Use letters, numbers, spaces, dots, dashes and underscores, starting with a letter or number.' };
  return { ok: true, name };
}

// For the button state only; the gateway enforces the same rule in a transaction.
export function canCreateKey(plan: StoragePlanId, activeKeys: number): { ok: true } | { ok: false; reason: string } {
  const limit = apiKeyLimitFor(plan);
  if (limit !== null && activeKeys >= limit) {
    return { ok: false, reason: `Your ${STORAGE_PLANS[plan].label} plan includes ${limit} API key${limit === 1 ? '' : 's'}. Revoke one or upgrade to add more.` };
  }
  return { ok: true };
}

export function describeKeyLimit(plan: StoragePlanId): string {
  const limit = apiKeyLimitFor(plan);
  return limit === null ? 'Unlimited keys' : `${limit} key${limit === 1 ? '' : 's'}`;
}

// ─── A key as the pages see it ───────────────────────────────────────────────

export interface ApiKey {
  id: string;
  name: string;
  // The first characters only. The full key is shown once, when it is made.
  prefix: string;
  bucketId: string | null;
  bucketName: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  requests: number;
  revoked: boolean;
  revokedAt: string | null;
  rateLimitPerMinute: number | null;
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const orNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export function parseApiKey(value: unknown): ApiKey | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.prefix !== 'string') return null;
  const requests = typeof value.requests === 'number' && Number.isFinite(value.requests) && value.requests >= 0 ? value.requests : 0;
  const limit = typeof value.rateLimitPerMinute === 'number' && Number.isSafeInteger(value.rateLimitPerMinute) && value.rateLimitPerMinute >= RATE_LIMIT_RANGE.min ? value.rateLimitPerMinute : null;
  return {
    id: value.id,
    name: value.name,
    prefix: value.prefix.slice(0, 12),
    bucketId: orNull(value.bucketId),
    bucketName: orNull(value.bucketName),
    createdAt: orNull(value.createdAt),
    lastUsedAt: orNull(value.lastUsedAt),
    requests,
    revoked: value.revoked === true,
    revokedAt: orNull(value.revokedAt),
    rateLimitPerMinute: limit,
  };
}

export function parseApiKeys(value: unknown): ApiKey[] {
  return (Array.isArray(value) ? value : []).map(parseApiKey).filter((k): k is ApiKey => k !== null);
}

// What a key may reach, in words.
export function describeScope(key: Pick<ApiKey, 'bucketId' | 'bucketName'>): string {
  if (!key.bucketId) return 'All buckets';
  return key.bucketName ? `Only ${key.bucketName}` : 'One bucket';
}

export function describeLastUsed(key: Pick<ApiKey, 'lastUsedAt'>): string {
  return key.lastUsedAt ? formatDateTime(key.lastUsedAt) : 'Never used';
}

export function describeRequests(requests: number): string {
  return `${requests.toLocaleString('en-NG')} request${requests === 1 ? '' : 's'}`;
}

// How the key shows in a list: the short prefix and a fixed tail, so it is
// obvious this is not the whole key.
export function maskedKey(prefix: string): string {
  return `${prefix}${'•'.repeat(12)}`;
}

// ─── Admin rows ──────────────────────────────────────────────────────────────

// What the gateway returns for one key in the admin list.
export interface RawAdminApiKey extends ApiKey {
  owner: { id: string; email: string; name: string };
  plan: StoragePlanId;
  ownerBanned: boolean;
}

export interface AdminApiKeyRow extends RawAdminApiKey {
  planLabel: string;
  // The limit that applies right now, and whether an admin set it by hand.
  effectiveRateLimit: number;
  customRateLimit: boolean;
}

export function parseRawAdminApiKey(value: unknown): RawAdminApiKey | null {
  const key = parseApiKey(value);
  if (!key || !isObject(value) || !isObject(value.owner)) return null;
  const owner = value.owner;
  if (typeof owner.id !== 'string' || typeof owner.email !== 'string') return null;
  return {
    ...key,
    owner: { id: owner.id, email: owner.email, name: typeof owner.name === 'string' ? owner.name : '' },
    plan: typeof value.plan === 'string' && isStoragePlanId(value.plan) ? value.plan : 'starter',
    ownerBanned: value.ownerBanned === true,
  };
}

export function toAdminKeyRow(raw: RawAdminApiKey): AdminApiKeyRow {
  return {
    ...raw,
    planLabel: STORAGE_PLANS[raw.plan].label,
    effectiveRateLimit: rateLimitFor(raw.plan, raw.rateLimitPerMinute),
    customRateLimit: raw.rateLimitPerMinute !== null,
  };
}

// Text typed into the rate limit box: a whole number in range, or empty for
// "follow the plan". Returns the value to send, or an error to show.
export function parseRateLimitInput(text: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  const range = `Enter a whole number from ${RATE_LIMIT_RANGE.min} to ${RATE_LIMIT_RANGE.max.toLocaleString('en-NG')}, or leave it empty to follow the plan.`;
  if (!/^\d{1,6}$/.test(trimmed)) return { ok: false, error: range };
  const value = Number(trimmed);
  return value >= RATE_LIMIT_RANGE.min && value <= RATE_LIMIT_RANGE.max ? { ok: true, value } : { ok: false, error: range };
}

export function keyPageCount(total: number, pageSize = ADMIN_KEY_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}
