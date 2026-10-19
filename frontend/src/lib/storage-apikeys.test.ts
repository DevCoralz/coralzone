import { describe, it, expect } from 'vitest';
import {
  KEY_PREFIX, KEY_NAME_MAX, ADMIN_KEY_PAGE_SIZE, RATE_LIMIT_RANGE, API_RATE_DEFAULTS, KEY_STATUS_FILTERS, isKeyStatusFilter,
  apiKeyLimitFor, rateLimitFor, validateKeyName, canCreateKey, describeKeyLimit, parseApiKey, parseApiKeys, describeScope, describeLastUsed,
  describeRequests, maskedKey, parseRawAdminApiKey, toAdminKeyRow, parseRateLimitInput, keyPageCount,
} from './storage-apikeys';

const base = { id: 'k1', name: 'Website', prefix: 'cz_live_ab12', bucketId: null, bucketName: null, createdAt: null, lastUsedAt: null, requests: 4, revoked: false, revokedAt: null, rateLimitPerMinute: null };

describe('constants match the gateway (api/_lib/storage-apikey.test.js pins the same values)', () => {
  it('values', () => {
    expect(KEY_PREFIX).toBe('cz_live_');
    expect(KEY_NAME_MAX).toBe(60);
    expect(ADMIN_KEY_PAGE_SIZE).toBe(25);
    expect(RATE_LIMIT_RANGE).toEqual({ min: 1, max: 10000 });
    expect(API_RATE_DEFAULTS).toEqual({ starter: 60, pro: 300, scale: 1200 });
    expect(KEY_STATUS_FILTERS.map(f => f.id)).toEqual(['all', 'active', 'revoked']);
    expect(apiKeyLimitFor('starter')).toBe(1);
    expect(apiKeyLimitFor('pro')).toBe(5);
    expect(apiKeyLimitFor('scale')).toBeNull();
  });
});

describe('guards and limits', () => {
  it('status filter accepts only known values', () => {
    expect(isKeyStatusFilter('revoked')).toBe(true);
    expect(isKeyStatusFilter('deleted')).toBe(false);
    expect(isKeyStatusFilter(null)).toBe(false);
  });
  it('a custom rate limit wins, otherwise the plan default', () => {
    expect(rateLimitFor('pro', null)).toBe(300);
    expect(rateLimitFor('pro', 20)).toBe(20);
    expect(rateLimitFor('scale', 0)).toBe(1200);
  });
  it('the create button knows the plan limit', () => {
    expect(canCreateKey('starter', 0)).toEqual({ ok: true });
    const full = canCreateKey('starter', 1);
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.reason).toContain('Starter plan includes 1 API key');
    expect(canCreateKey('pro', 4)).toEqual({ ok: true });
    expect(canCreateKey('pro', 5).ok).toBe(false);
    expect(canCreateKey('scale', 9999)).toEqual({ ok: true });
    expect(describeKeyLimit('scale')).toBe('Unlimited keys');
    expect(describeKeyLimit('starter')).toBe('1 key');
    expect(describeKeyLimit('pro')).toBe('5 keys');
  });
});

describe('names', () => {
  it('tidies good names and refuses bad ones with a reason', () => {
    expect(validateKeyName('  Mobile   app ')).toEqual({ ok: true, name: 'Mobile app' });
    for (const bad of ['', '   ', 'x'.repeat(61), '../x', '<b>', '-lead']) expect(validateKeyName(bad).ok).toBe(false);
  });
});

describe('parsing keys that crossed the network', () => {
  it('reads a good key and drops junk fields to safe values', () => {
    const key = parseApiKey({ ...base, requests: -3, rateLimitPerMinute: 'fast', prefix: 'cz_live_ab12EXTRA' });
    expect(key?.requests).toBe(0);
    expect(key?.rateLimitPerMinute).toBeNull();
    expect(key?.prefix).toBe('cz_live_ab12');
  });
  it('rejects things that are not keys and skips them in lists', () => {
    expect(parseApiKey(null)).toBeNull();
    expect(parseApiKey({ id: 'x' })).toBeNull();
    expect(parseApiKeys([base, { nope: 1 }, null]).length).toBe(1);
    expect(parseApiKeys('nothing')).toEqual([]);
  });
  it('never carries a hash or secret even if one were sent', () => {
    const key = parseApiKey({ ...base, key_hash: 'leak', secret: 'cz_live_x' });
    expect(JSON.stringify(key).includes('leak')).toBe(false);
    expect(JSON.stringify(key).includes('secret')).toBe(false);
  });
});

describe('words for the pages', () => {
  it('describes scope, last use and requests', () => {
    expect(describeScope(base)).toBe('All buckets');
    expect(describeScope({ bucketId: 'b', bucketName: 'photos' })).toBe('Only photos');
    expect(describeScope({ bucketId: 'b', bucketName: null })).toBe('One bucket');
    expect(describeLastUsed(base)).toBe('Never used');
    expect(describeRequests(1)).toBe('1 request');
    expect(describeRequests(1500)).toBe('1,500 requests');
    expect(maskedKey('cz_live_ab12').startsWith('cz_live_ab12')).toBe(true);
    expect(maskedKey('cz_live_ab12').length).toBe(24);
  });
});

describe('admin rows', () => {
  const raw = { ...base, owner: { id: 'u1', email: 'a@x.com', name: 'A' }, plan: 'pro', ownerBanned: true };
  it('parses and works out the limit that applies', () => {
    const row = toAdminKeyRow(parseRawAdminApiKey(raw)!);
    expect(row.planLabel).toBe('Pro');
    expect(row.effectiveRateLimit).toBe(300);
    expect(row.customRateLimit).toBe(false);
    expect(row.ownerBanned).toBe(true);
    const custom = toAdminKeyRow(parseRawAdminApiKey({ ...raw, rateLimitPerMinute: 25 })!);
    expect([custom.effectiveRateLimit, custom.customRateLimit]).toEqual([25, true]);
  });
  it('rejects rows without an owner and falls back to Starter for an unknown plan', () => {
    expect(parseRawAdminApiKey(base)).toBeNull();
    expect(parseRawAdminApiKey({ ...raw, owner: { id: 1 } })).toBeNull();
    expect(parseRawAdminApiKey({ ...raw, plan: 'enterprise' })?.plan).toBe('starter');
  });
});

describe('the rate limit box', () => {
  it('empty means follow the plan, numbers must be whole and in range', () => {
    expect(parseRateLimitInput('')).toEqual({ ok: true, value: null });
    expect(parseRateLimitInput('  ')).toEqual({ ok: true, value: null });
    expect(parseRateLimitInput('120')).toEqual({ ok: true, value: 120 });
    expect(parseRateLimitInput('10000')).toEqual({ ok: true, value: 10000 });
    for (const bad of ['0', '10001', '-5', '1.5', 'abc', '1e3', '1,000', '9999999']) expect(parseRateLimitInput(bad).ok).toBe(false);
  });
});

describe('paging', () => {
  it('has at least one page', () => {
    expect(keyPageCount(0)).toBe(1);
    expect(keyPageCount(26)).toBe(2);
  });
});
