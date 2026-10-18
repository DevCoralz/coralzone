import { describe, it, expect } from 'vitest';
import {
  BUCKET_NAME_MAX, BUCKET_LIMITS, ADMIN_BUCKET_PAGE_SIZE, NEARLY_FULL_RATIO, validateBucketName, bucketLimitFor, describeBucketLimit,
  canCreateBucket, ownerFullness, isNearlyFull, formatPercent, toAdminRow, sortFullestFirst, describeUsage, pageCount,
  type RawAdminBucket,
} from './storage-buckets';
import { DEFAULT_ENTITLEMENT } from './storage-quota';
import { DEFAULT_STORAGE_SETTINGS } from './storage-settings';
import { STORAGE_PLANS } from './storage-plans';

const GB = 1024 ** 3;
const raw = (name: string, entitlement = {}): RawAdminBucket => ({
  id: `id-${name}`, name, frozen: false, createdAt: null, owner: { id: 'u1', email: 'a@x.com', name: 'A' },
  entitlement: { ...DEFAULT_ENTITLEMENT, ...entitlement },
});

describe('bucket constants match the gateway (api/_lib/storage-bucket.test.js pins the same values)', () => {
  it('values', () => {
    expect(BUCKET_NAME_MAX).toBe(60);
    expect(BUCKET_LIMITS).toEqual({ starter: 1, pro: null, scale: null });
    expect(ADMIN_BUCKET_PAGE_SIZE).toBe(25);
    expect(NEARLY_FULL_RATIO).toBe(0.8);
  });
});

describe('names', () => {
  it('accepts and tidies good names', () => {
    expect(validateBucketName('  My   App ')).toEqual({ ok: true, name: 'My App' });
    for (const good of ['a', 'photos-2026', 'v1.2 backup', 'Café Menu', '项目1']) expect(validateBucketName(good).ok).toBe(true);
  });
  it('refuses bad ones with a reason', () => {
    for (const bad of ['', '   ', 'x'.repeat(61), '../etc', 'a/b', '-lead', '.hidden', '<script>', 'emoji \u{1F600}']) {
      const result = validateBucketName(bad);
      expect(result.ok).toBe(false);
    }
  });
});

describe('plan limits', () => {
  it('Starter has one bucket, bigger plans are unlimited', () => {
    expect(bucketLimitFor('starter')).toBe(1);
    expect(bucketLimitFor('pro')).toBeNull();
    expect(describeBucketLimit('starter')).toBe('1 bucket');
    expect(describeBucketLimit('scale')).toBe('Unlimited buckets');
  });
  it('canCreateBucket gives a plan-specific reason when full', () => {
    expect(canCreateBucket('starter', 0)).toEqual({ ok: true });
    const full = canCreateBucket('starter', 1);
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.reason).toContain('Starter plan includes 1 bucket');
    expect(canCreateBucket('pro', 500)).toEqual({ ok: true });
  });
});

describe('fullness', () => {
  it('is the share of the owner\'s whole quota in use', () => {
    expect(ownerFullness(10 * GB, 20 * GB)).toBe(0.5);
    expect(ownerFullness(0, 20 * GB)).toBe(0);
    expect(ownerFullness(5, 0)).toBe(0);
    expect(ownerFullness(NaN, 10)).toBe(0);
    expect(ownerFullness(-5, 10)).toBe(0);
  });
  it('nearly full starts at exactly 80%', () => {
    expect(isNearlyFull(0.79999)).toBe(false);
    expect(isNearlyFull(0.8)).toBe(false); // over 80%, not 80% itself
    expect(isNearlyFull(0.8001)).toBe(true);
    expect(isNearlyFull(1.3)).toBe(true);
  });
  it('percent text', () => {
    expect(formatPercent(0.834)).toBe('83%');
    expect(formatPercent(1.5)).toBe('150%');
    expect(formatPercent(50)).toBe('999%+');
  });
});

describe('admin rows', () => {
  const settings = DEFAULT_STORAGE_SETTINGS;
  it('uses the owner\'s plan quota and flags nearly-full owners', () => {
    const starterQuota = STORAGE_PLANS.starter.bytesQuota;
    const row = toAdminRow(raw('docs'), { files: 3, bytes: 5 * GB }, starterQuota * 0.85, settings);
    expect(row.planLabel).toBe('Starter');
    expect(row.ownerQuotaBytes).toBe(starterQuota);
    expect(row.nearlyFull).toBe(true);
    expect(row.ownerRatio).toBeCloseTo(0.85);
  });
  it('extra storage and overrides raise the quota, so the same bytes are no longer nearly full', () => {
    const base = STORAGE_PLANS.starter.bytesQuota;
    const used = base * 0.85;
    expect(toAdminRow(raw('a', { extraBytes: base }), null, used, settings).nearlyFull).toBe(false);
    expect(toAdminRow(raw('b', { bytesQuotaOverride: base * 4 }), null, used, settings).nearlyFull).toBe(false);
  });
  it('unknown usage is never reported as nearly full', () => {
    const row = toAdminRow(raw('x'), null, null, settings);
    expect(row.nearlyFull).toBe(false);
    expect(row.ownerRatio).toBeNull();
    expect(describeUsage(row)).toBe('Usage unavailable');
  });
  it('shows why an owner is blocked, banned first', () => {
    expect(toAdminRow(raw('a', { frozen: true }), null, 0, settings).ownerBlock).toBe('frozen');
    expect(toAdminRow(raw('b', { banned: true, frozen: true }), null, 0, settings).ownerBlock).toBe('banned');
    expect(toAdminRow(raw('c'), null, 0, settings).ownerBlock).toBeNull();
  });
  it('sorts fullest owners first, unknown last', () => {
    const q = STORAGE_PLANS.starter.bytesQuota;
    const rows = [
      toAdminRow(raw('b-low'), null, q * 0.1, settings),
      toAdminRow(raw('unknown'), null, null, settings),
      toAdminRow(raw('a-high'), null, q * 0.9, settings),
    ];
    expect(sortFullestFirst(rows).map(r => r.name)).toEqual(['a-high', 'b-low', 'unknown']);
  });
  it('describes usage and pages', () => {
    expect(describeUsage(toAdminRow(raw('x'), { files: 1, bytes: 2 * GB }, 0, settings))).toBe('2 GB · 1 file');
    expect(pageCount(0)).toBe(1);
    expect(pageCount(25)).toBe(1);
    expect(pageCount(26)).toBe(2);
  });
});
