import { describe, it, expect } from 'vitest';
import {
  CONTROL_KEYS, BAN_REASON_MAX, DEFAULT_ENTITLEMENT, BANNED_MESSAGE, FROZEN_MESSAGE,
  parseEntitlement, resolveUserQuota, checkUpload, summarizeQuota, type UserEntitlement,
} from './storage-quota';
import { DEFAULT_STORAGE_SETTINGS, resolveStorageSettings } from './storage-settings';
import { STORAGE_PLANS } from './storage-plans';

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const settings = DEFAULT_STORAGE_SETTINGS;
const ent = (patch: Partial<UserEntitlement> = {}): UserEntitlement => ({ ...DEFAULT_ENTITLEMENT, ...patch });
const quotaOf = (patch: Partial<UserEntitlement> = {}, s = settings) => resolveUserQuota(ent(patch), s);

describe('storage quota engine', () => {
  it('matches the gateway validator constants', () => {
    expect([...CONTROL_KEYS]).toEqual(['plan', 'extraBytes', 'frozen', 'bytesQuotaOverride', 'maxUploadOverride', 'banned', 'banReason']);
    expect(BAN_REASON_MAX).toBe(200);
  });

  it('a user with no stored row is on Starter defaults', () => {
    const q = quotaOf();
    expect(q.plan).toBe('starter');
    expect(q.bytesQuota).toBe(STORAGE_PLANS.starter.bytesQuota);
    expect(q.maxUploadBytes).toBe(STORAGE_PLANS.starter.maxUploadBytes);
    expect(q.blockReason).toBeNull();
  });

  it('plan limits come from the live admin settings', () => {
    const custom = resolveStorageSettings({ planQuotas: { starter: { bytesQuota: 50 * GB, maxUploadBytes: 1 * GB }, pro: { bytesQuota: 500 * GB, maxUploadBytes: 2 * GB }, scale: { bytesQuota: 2048 * GB, maxUploadBytes: 4 * GB } } });
    const q = quotaOf({}, custom);
    expect(q.bytesQuota).toBe(50 * GB);
    expect(q.maxUploadBytes).toBe(1 * GB);
  });

  it('extra storage adds on top of the plan or the override', () => {
    expect(quotaOf({ plan: 'pro', extraBytes: 10 * GB }).bytesQuota).toBe(STORAGE_PLANS.pro.bytesQuota + 10 * GB);
    expect(quotaOf({ bytesQuotaOverride: 5 * GB, extraBytes: 10 * GB }).bytesQuota).toBe(15 * GB);
  });

  it('manual upload override replaces the plan limit but never exceeds the global max', () => {
    expect(quotaOf({ maxUploadOverride: 100 * MB }).maxUploadBytes).toBe(100 * MB);
    const capped = resolveStorageSettings({ globalMaxUploadBytes: 1 * GB });
    expect(quotaOf({ plan: 'scale', maxUploadOverride: 4 * GB }, capped).maxUploadBytes).toBe(1 * GB);
    expect(quotaOf({ plan: 'scale' }, capped).maxUploadBytes).toBe(1 * GB);
  });

  describe('block order: maintenance -> banned -> frozen', () => {
    const maint = resolveStorageSettings({ maintenance: { enabled: true, message: 'Back soon' } });
    it('maintenance wins over everything', () => {
      const q = quotaOf({ banned: true, frozen: true }, maint);
      expect(q.blockReason).toBe('maintenance');
      expect(q.blockMessage).toBe('Back soon');
    });
    it('banned wins over frozen', () => {
      expect(quotaOf({ banned: true, frozen: true }).blockReason).toBe('banned');
      expect(quotaOf({ banned: true }).blockMessage).toBe(BANNED_MESSAGE);
    });
    it('frozen blocks on its own', () => {
      expect(quotaOf({ frozen: true }).blockReason).toBe('frozen');
      expect(quotaOf({ frozen: true }).blockMessage).toBe(FROZEN_MESSAGE);
    });
  });

  describe('checkUpload', () => {
    it('allows a file within limits and free space', () => {
      expect(checkUpload(quotaOf(), settings, 10 * MB, 0)).toEqual({ ok: true });
    });
    it('refuses everything when blocked, using the user-safe message', () => {
      const r = checkUpload(quotaOf({ banned: true }), settings, 1, 0);
      expect(r).toEqual({ ok: false, error: BANNED_MESSAGE });
    });
    it('refuses a file over the per-file limit and points to an upgrade', () => {
      const r = checkUpload(quotaOf(), settings, 600 * MB, 0);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/Starter plan.*500 MB.*Upgrade/);
    });
    it('says "right now" when the global ceiling is the cap', () => {
      const capped = resolveStorageSettings({ globalMaxUploadBytes: 100 * MB });
      const r = checkUpload(quotaOf({}, capped), capped, 200 * MB, 0);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/limited to 100 MB per file right now/);
    });
    it('refuses when the file does not fit in the free space', () => {
      const q = quotaOf();
      const r = checkUpload(q, settings, 400 * MB, q.bytesQuota - 100 * MB);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/Not enough storage/);
    });
    it('reports a full account distinctly', () => {
      const q = quotaOf();
      const r = checkUpload(q, settings, 1, q.bytesQuota);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/storage is full/);
    });
    it('accepts a file that exactly fills the remaining space', () => {
      const q = quotaOf({ bytesQuotaOverride: 1 * GB, maxUploadOverride: 500 * MB });
      expect(checkUpload(q, settings, 500 * MB, 524 * MB)).toEqual({ ok: true });
    });
    it('treats a negative or odd "used" value as zero used, not extra space', () => {
      const q = quotaOf({ bytesQuotaOverride: 1 * GB });
      expect(checkUpload(q, settings, 1 * GB + 1, -5 * GB).ok).toBe(false);
    });
  });

  describe('parseEntitlement', () => {
    it('parses a good payload', () => {
      expect(parseEntitlement({ plan: 'pro', extraBytes: 5, frozen: false, bytesQuotaOverride: null, maxUploadOverride: 7, banned: false }))
        .toEqual({ plan: 'pro', extraBytes: 5, frozen: false, bytesQuotaOverride: null, maxUploadOverride: 7, banned: false });
    });
    it('rejects anything that could hide a ban or freeze', () => {
      for (const bad of [null, undefined, 5, 'x', [], {}, { banned: false }, { banned: 'false', frozen: false }, { banned: false, frozen: 0 }]) {
        expect(parseEntitlement(bad)).toBeNull();
      }
    });
    it('falls back per-field for harmless garbage', () => {
      expect(parseEntitlement({ plan: 'gold', extraBytes: -1, frozen: false, banned: true, bytesQuotaOverride: 'x', maxUploadOverride: NaN }))
        .toEqual({ plan: 'starter', extraBytes: 0, frozen: false, bytesQuotaOverride: null, maxUploadOverride: null, banned: true });
    });
  });

  it('summary exposes no raw flags beyond the block reason', () => {
    const s = summarizeQuota(quotaOf({ plan: 'pro', frozen: true }));
    expect(s).toEqual({ plan: 'pro', planLabel: 'Pro', bytesQuota: STORAGE_PLANS.pro.bytesQuota, maxUploadBytes: STORAGE_PLANS.pro.maxUploadBytes, blocked: 'frozen', blockMessage: FROZEN_MESSAGE });
  });
});
