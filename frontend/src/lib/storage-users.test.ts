import { describe, it, expect } from 'vitest';
import {
  ADMIN_USER_PAGE_SIZE, USER_STATUS_FILTERS, USER_PLAN_FILTERS, isStatusFilter, isPlanFilter, parseRawAdminUser, toAdminUserRow,
  describeUserUsage, displayName, parseUserOverview, outsideBuckets, bucketLabel, toUserOverview, pageCountFor,
  type UserBucketRow,
} from './storage-users';
import { DEFAULT_ENTITLEMENT } from './storage-quota';
import { DEFAULT_STORAGE_SETTINGS } from './storage-settings';
import { STORAGE_PLANS } from './storage-plans';

const GB = 1024 ** 3;
const starterQuota = STORAGE_PLANS.starter.bytesQuota;
const entitlement = { plan: 'starter', extraBytes: 0, frozen: false, bytesQuotaOverride: null, maxUploadOverride: null, banned: false };
const rawUser = (over = {}) => ({ id: 'u1', name: 'Ada', email: 'ada@x.com', createdAt: null, bucketCount: 2, entitlement, ...over });

describe('constants match the gateway (api/_lib/storage-user.test.js pins the same values)', () => {
  it('values', () => {
    expect(ADMIN_USER_PAGE_SIZE).toBe(25);
    expect(USER_STATUS_FILTERS.map(f => f.id)).toEqual(['all', 'frozen', 'banned']);
    expect(USER_PLAN_FILTERS.map(f => f.id)).toEqual(['all', 'starter', 'pro', 'scale']);
  });
});

describe('filter guards', () => {
  it('accept only known values', () => {
    expect(isStatusFilter('banned')).toBe(true);
    expect(isStatusFilter('everyone')).toBe(false);
    expect(isStatusFilter(undefined)).toBe(false);
    expect(isPlanFilter('pro')).toBe(true);
    expect(isPlanFilter('all')).toBe(true);
    expect(isPlanFilter('enterprise')).toBe(false);
    expect(isPlanFilter('__proto__')).toBe(false);
  });
});

describe('parsing what crossed the network', () => {
  it('reads a good user and rejects broken ones', () => {
    const user = parseRawAdminUser(rawUser());
    expect(user?.email).toBe('ada@x.com');
    expect(user?.bucketCount).toBe(2);
    expect(parseRawAdminUser(null)).toBeNull();
    expect(parseRawAdminUser({ id: 'u1' })).toBeNull();
    expect(parseRawAdminUser(rawUser({ entitlement: { plan: 'pro' } }))).toBeNull();
  });
  it('treats junk counts as zero instead of passing them on', () => {
    expect(parseRawAdminUser(rawUser({ bucketCount: -5 }))?.bucketCount).toBe(0);
    expect(parseRawAdminUser(rawUser({ bucketCount: 'lots' }))?.bucketCount).toBe(0);
    expect(parseRawAdminUser(rawUser({ name: 42 }))?.name).toBe('');
  });
});

describe('list rows', () => {
  const raw = () => parseRawAdminUser(rawUser())!;
  it('works out fullness from the owner\'s whole allowance', () => {
    const row = toAdminUserRow(raw(), { bytes: starterQuota / 2, files: 10 }, DEFAULT_STORAGE_SETTINGS);
    expect(row.ratio).toBe(0.5);
    expect(row.nearlyFull).toBe(false);
    expect(row.planLabel).toBe('Starter');
  });
  it('flags only strictly above 80 percent', () => {
    expect(toAdminUserRow(raw(), { bytes: starterQuota * 0.8, files: 1 }, DEFAULT_STORAGE_SETTINGS).nearlyFull).toBe(false);
    expect(toAdminUserRow(raw(), { bytes: starterQuota * 0.81, files: 1 }, DEFAULT_STORAGE_SETTINGS).nearlyFull).toBe(true);
  });
  it('says unknown, not zero, when the storage service could not be reached', () => {
    const row = toAdminUserRow(raw(), null, DEFAULT_STORAGE_SETTINGS);
    expect(row.ownerBytes).toBeNull();
    expect(row.ratio).toBeNull();
    expect(row.nearlyFull).toBe(false);
    expect(describeUserUsage(row)).toBe('Usage unavailable');
  });
  it('shows ban before freeze, and extra storage raises the quota', () => {
    const both = parseRawAdminUser(rawUser({ entitlement: { ...entitlement, banned: true, frozen: true, extraBytes: 10 * GB } }))!;
    const row = toAdminUserRow(both, { bytes: 0, files: 0 }, DEFAULT_STORAGE_SETTINGS);
    expect(row.block).toBe('banned');
    expect(row.quotaBytes).toBe(starterQuota + 10 * GB);
  });
  it('describes usage with or without a file count', () => {
    const withFiles = toAdminUserRow(raw(), { bytes: GB, files: 1 }, DEFAULT_STORAGE_SETTINGS);
    expect(describeUserUsage(withFiles)).toBe('1 GB of 20 GB · 1 file');
    const noFiles = toAdminUserRow(raw(), { bytes: GB, files: null }, DEFAULT_STORAGE_SETTINGS);
    expect(describeUserUsage(noFiles)).toBe('1 GB of 20 GB');
  });
  it('falls back to the email when there is no name', () => {
    expect(displayName({ name: '  ', email: 'a@x.com' })).toBe('a@x.com');
    expect(displayName({ name: 'Ada', email: 'a@x.com' })).toBe('Ada');
  });
});

describe('overview', () => {
  const overview = (over = {}) => ({
    user: { id: 'u1', name: 'Ada', email: 'ada@x.com', createdAt: '2026-01-01T00:00:00.000Z' },
    entitlement, banReason: null,
    buckets: [{ id: 'b1', name: 'photos', frozen: false, createdAt: null }, { id: 'b2', name: 'docs', frozen: true, createdAt: null }],
    apiKeys: { total: 2, active: 1, requests: 30, list: [{ id: 'k1', name: 'Site', prefix: 'cz_live_ab12', revoked: false, requests: 30 }, { nope: true }] },
    recentActions: [{ id: 'l1', summary: 'Froze uploads', by: 'boss@x.com', at: null }],
    ...over,
  });
  it('parses a good overview and skips broken buckets and actions', () => {
    const parsed = parseUserOverview(overview({ buckets: [{ id: 'b1', name: 'ok' }, { id: 5 }, null], recentActions: [{ id: 1 }, { id: 'l2', summary: 'x'.repeat(500) }] }));
    expect(parsed?.buckets.length).toBe(1);
    expect(parsed?.recentActions.length).toBe(1);
    expect(parsed?.recentActions[0].summary.length).toBe(140);
    expect(parsed?.apiKeys.list.length).toBe(1);
    expect(parseUserOverview({})).toBeNull();
    expect(parseUserOverview(overview({ entitlement: null }))).toBeNull();
  });
  it('hides the ban reason unless the user is banned', () => {
    const quiet = toUserOverview(parseUserOverview(overview({ banReason: 'old note' }))!, null, null, DEFAULT_STORAGE_SETTINGS);
    expect(quiet.banReason).toBeNull();
    const banned = toUserOverview(parseUserOverview(overview({ banReason: 'spam', entitlement: { ...entitlement, banned: true } }))!, null, null, DEFAULT_STORAGE_SETTINGS);
    expect(banned.banReason).toBe('spam');
    expect(banned.blockReason).toBe('banned');
  });
  it('attaches usage to each bucket, zero when the service answered but listed none', () => {
    const usage = new Map([['b1', { files: 3, bytes: 300 }]]);
    const built = toUserOverview(parseUserOverview(overview())!, usage, { bytes: 300, files: 3 }, DEFAULT_STORAGE_SETTINGS);
    expect(built.buckets.map(b => b.usage)).toEqual([{ files: 3, bytes: 300 }, { files: 0, bytes: 0 }]);
    expect(built.bucketLimit).toBe(1);
    expect(built.outside).toBeNull();
  });
  it('leaves usage unknown when the storage service is down', () => {
    const built = toUserOverview(parseUserOverview(overview())!, null, null, DEFAULT_STORAGE_SETTINGS);
    expect(built.buckets.every(b => b.usage === null)).toBe(true);
    expect(built.ownerBytes).toBeNull();
    expect(built.outside).toBeNull();
  });
});

describe('space outside buckets', () => {
  const bucket = (bytes: number, files: number): UserBucketRow => ({ id: 'b', name: 'b', frozen: false, createdAt: null, usage: { bytes, files } });
  it('is what the owner holds beyond their buckets', () => {
    expect(outsideBuckets({ bytes: 1000, files: 10 }, [bucket(600, 6)])).toEqual({ bytes: 400, files: 4 });
  });
  it('is null when everything sits in a bucket', () => {
    expect(outsideBuckets({ bytes: 600, files: 6 }, [bucket(600, 6)])).toBeNull();
    expect(outsideBuckets({ bytes: 0, files: 0 }, [])).toBeNull();
  });
  it('keeps the bytes even when the file count is not known', () => {
    expect(outsideBuckets({ bytes: 1000, files: null }, [bucket(600, 6)])).toEqual({ bytes: 400, files: null });
  });
  it('never goes negative and stays quiet when any number is unknown', () => {
    expect(outsideBuckets({ bytes: 100, files: 1 }, [bucket(600, 6)])).toBeNull();
    expect(outsideBuckets(null, [bucket(1, 1)])).toBeNull();
    expect(outsideBuckets({ bytes: 5, files: 1 }, [{ ...bucket(0, 0), usage: null }])).toBeNull();
  });
});

describe('file locations in words', () => {
  const buckets = [{ id: 'b1', name: 'photos', frozen: false, createdAt: null }];
  it('names the bucket, or says why it cannot', () => {
    expect(bucketLabel('b1', buckets)).toBe('photos');
    expect(bucketLabel(null, buckets)).toBe('No bucket');
    expect(bucketLabel('gone', buckets)).toBe('Unknown bucket');
  });
});

describe('paging', () => {
  it('always has at least one page', () => {
    expect(pageCountFor(0)).toBe(1);
    expect(pageCountFor(25)).toBe(1);
    expect(pageCountFor(26)).toBe(2);
    expect(pageCountFor(-4)).toBe(1);
  });
});

it('the entitlement default is what a brand new user gets', () => {
  expect(DEFAULT_ENTITLEMENT.plan).toBe('starter');
});
