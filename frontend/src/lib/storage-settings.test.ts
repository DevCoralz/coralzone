import { describe, it, expect } from 'vitest';
import {
  ALL_FILE_GROUP_IDS, DEFAULT_STORAGE_SETTINGS, STORAGE_SETTINGS_LIMITS, FILE_GROUPS,
  resolveStorageSettings, effectivePlan, allowedMimeTypes, maintenanceMessage, DEFAULT_MAINTENANCE_MESSAGE,
} from './storage-settings';
import { STORAGE_PLANS } from './storage-plans';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

describe('storage settings', () => {
  it('matches the gateway validator constants', () => {
    expect([...ALL_FILE_GROUP_IDS]).toEqual(['images', 'video', 'audio', 'documents', 'archives', 'text_data', 'other']);
    expect(STORAGE_SETTINGS_LIMITS.globalMaxUploadBytes.max).toBe(4 * GB);
    expect(STORAGE_SETTINGS_LIMITS.planBytesQuota.max).toBe(100 * 1024 * GB);
    expect(STORAGE_SETTINGS_LIMITS.maintenanceMessageMax).toBe(200);
  });

  it('empty or garbage input resolves to the defaults', () => {
    for (const raw of [undefined, null, 5, 'x', [], {}]) {
      expect(resolveStorageSettings(raw)).toEqual(DEFAULT_STORAGE_SETTINGS);
    }
  });

  it('defaults agree with storage-plans.ts', () => {
    expect(DEFAULT_STORAGE_SETTINGS.planQuotas.pro.bytesQuota).toBe(STORAGE_PLANS.pro.bytesQuota);
    expect(DEFAULT_STORAGE_SETTINGS.globalMaxUploadBytes).toBe(STORAGE_PLANS.scale.maxUploadBytes);
  });

  it('applies valid overrides and ignores invalid fields independently', () => {
    const s = resolveStorageSettings({
      globalMaxUploadBytes: 2 * GB,
      extraStoragePriceNgn: -5, // invalid -> default
      allowedFileGroups: ['images', 'bogus'],
      maintenance: { enabled: true, message: 'Back soon' },
    });
    expect(s.globalMaxUploadBytes).toBe(2 * GB);
    expect(s.extraStoragePriceNgn).toBe(DEFAULT_STORAGE_SETTINGS.extraStoragePriceNgn);
    expect(s.allowedFileGroups).toEqual(['images']);
    expect(s.maintenance).toEqual({ enabled: true, message: 'Back soon' });
  });

  it('rejects a plan whose max upload exceeds its quota', () => {
    const s = resolveStorageSettings({ planQuotas: { starter: { bytesQuota: 1 * GB, maxUploadBytes: 2 * GB } } });
    expect(s.planQuotas.starter).toEqual(DEFAULT_STORAGE_SETTINGS.planQuotas.starter);
  });

  it('an empty group list falls back to all groups (never blocks everything)', () => {
    expect(resolveStorageSettings({ allowedFileGroups: [] }).allowedFileGroups).toEqual([...ALL_FILE_GROUP_IDS]);
  });

  it('effectivePlan caps a plan upload at the global ceiling', () => {
    const s = resolveStorageSettings({ globalMaxUploadBytes: 1 * GB });
    expect(effectivePlan('scale', s).maxUploadBytes).toBe(1 * GB);
    expect(effectivePlan('starter', s).maxUploadBytes).toBe(500 * MB);
    expect(effectivePlan('scale', s).priceMonthlyNgn).toBe(STORAGE_PLANS.scale.priceMonthlyNgn);
  });

  it('allowedMimeTypes unions the selected groups only', () => {
    const mimes = allowedMimeTypes(['images']);
    expect(mimes).toContain('image/png');
    expect(mimes).not.toContain('video/mp4');
    expect(allowedMimeTypes(ALL_FILE_GROUP_IDS).length).toBe(new Set(FILE_GROUPS.flatMap(g => g.mimeTypes)).size);
  });

  it('maintenanceMessage falls back to the default text', () => {
    expect(maintenanceMessage(resolveStorageSettings({ maintenance: { enabled: true, message: '   ' } }))).toBe(DEFAULT_MAINTENANCE_MESSAGE);
  });
});
