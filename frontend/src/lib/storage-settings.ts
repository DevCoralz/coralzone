// Admin-editable Cloud storage settings: types, built-in defaults, and the
// pure functions that turn "what an admin saved" into "what applies right
// now". Safe on server and client (no env access, no network).
//
// Flow: /admin/cloud/settings saves overrides -> storage_settings table ->
// GET /api/cloud/settings -> resolveStorageSettings() merges them over the
// defaults below -> upload checks, the pricing page and the admin form all
// read the merged result. An empty table is a valid state: everything falls
// back to storage-plans.ts.
//
// STORAGE_SETTINGS_LIMITS, FILE_GROUPS' ids and the plan ids mirror
// api/_lib/storage-settings-schema.js (the authoritative validator);
// api/_lib/storage-settings.test.js and storage-settings.test.ts pin them.
import { STORAGE_PLANS, EXTRA_STORAGE_NGN_PER_10GB, type StoragePlanId, type StoragePlan } from './storage-plans';

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const STORAGE_SETTINGS_LIMITS = {
  globalMaxUploadBytes: { min: 1 * MB, max: 4 * GB },
  extraStoragePriceNgn: { min: 0, max: 1_000_000 },
  planBytesQuota: { min: 1 * GB, max: 100 * 1024 * GB },
  planMaxUploadBytes: { min: 1 * MB, max: 4 * GB },
  maintenanceMessageMax: 200,
  blockedMimeTypesMax: 64,
} as const;

// Same shape the gateway accepts (api/_lib/storage-settings-schema.js).
export const MIME_TYPE_RE = /^[a-z0-9][a-z0-9.+-]{0,60}\/[a-z0-9][a-z0-9.+-]{0,60}$/;

export type FileGroupId = 'images' | 'video' | 'audio' | 'documents' | 'archives' | 'text_data' | 'other';

export interface FileGroup {
  id: FileGroupId;
  label: string;
  description: string;
  mimeTypes: readonly string[];
  // Shown as a caution in the admin form: these groups are the usual
  // vehicles for abuse, so turning them off is a common, deliberate choice.
  caution?: string;
}

// The storage service verifies every upload by magic bytes (not filename or
// claimed type) and also has its own hard allow-list; a group here can only
// ever NARROW what that service accepts, never widen it.
export const FILE_GROUPS: readonly FileGroup[] = [
  { id: 'images', label: 'Images', description: 'JPEG, PNG, WebP, GIF, ICO', mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon'] },
  { id: 'video', label: 'Video', description: 'MP4, WebM', mimeTypes: ['video/mp4', 'video/webm'] },
  { id: 'audio', label: 'Audio', description: 'MP3, OGG, FLAC', mimeTypes: ['audio/mpeg', 'audio/ogg', 'audio/flac'] },
  {
    id: 'documents', label: 'Documents', description: 'PDF, Word, Excel, PowerPoint',
    mimeTypes: [
      'application/pdf', 'application/vnd.ms-office',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
  },
  { id: 'archives', label: 'Archives', description: 'ZIP, 7z, RAR, GZIP', mimeTypes: ['application/zip', 'application/x-7z-compressed', 'application/vnd.rar', 'application/gzip'], caution: 'Archives can hide anything. Turn off if abuse becomes a problem.' },
  { id: 'text_data', label: 'Text & data', description: 'TXT, CSV, JSON, Markdown', mimeTypes: ['text/plain', 'text/csv', 'application/json', 'text/markdown'] },
  { id: 'other', label: 'Other binary files', description: 'Any file the service cannot classify more precisely', mimeTypes: ['application/octet-stream'], caution: 'Includes executables and unknown formats. Turn off to reject anything unrecognised.' },
] as const;

export const ALL_FILE_GROUP_IDS: readonly FileGroupId[] = FILE_GROUPS.map(group => group.id);

export interface PlanLimits {
  bytesQuota: number;
  maxUploadBytes: number;
}

export interface MaintenanceSetting {
  enabled: boolean;
  message: string;
}

// What the API stores: only settings an admin explicitly saved.
export interface StorageSettingsOverrides {
  globalMaxUploadBytes?: number;
  extraStoragePriceNgn?: number;
  allowedFileGroups?: FileGroupId[];
  blockedMimeTypes?: string[];
  planQuotas?: Record<StoragePlanId, PlanLimits>;
  maintenance?: MaintenanceSetting;
}

// Overrides merged over defaults — every field present.
export interface EffectiveStorageSettings {
  globalMaxUploadBytes: number;
  extraStoragePriceNgn: number;
  allowedFileGroups: FileGroupId[];
  // Individual types switched off by an admin, on top of the groups.
  blockedMimeTypes: string[];
  planQuotas: Record<StoragePlanId, PlanLimits>;
  maintenance: MaintenanceSetting;
}

export const DEFAULT_MAINTENANCE_MESSAGE = 'Cloud storage is under maintenance. Please try again shortly.';

export const DEFAULT_STORAGE_SETTINGS: EffectiveStorageSettings = {
  globalMaxUploadBytes: STORAGE_PLANS.scale.maxUploadBytes,
  extraStoragePriceNgn: EXTRA_STORAGE_NGN_PER_10GB,
  allowedFileGroups: [...ALL_FILE_GROUP_IDS],
  blockedMimeTypes: [],
  planQuotas: {
    starter: { bytesQuota: STORAGE_PLANS.starter.bytesQuota, maxUploadBytes: STORAGE_PLANS.starter.maxUploadBytes },
    pro: { bytesQuota: STORAGE_PLANS.pro.bytesQuota, maxUploadBytes: STORAGE_PLANS.pro.maxUploadBytes },
    scale: { bytesQuota: STORAGE_PLANS.scale.bytesQuota, maxUploadBytes: STORAGE_PLANS.scale.maxUploadBytes },
  },
  maintenance: { enabled: false, message: '' },
};

const PLAN_IDS: readonly StoragePlanId[] = ['starter', 'pro', 'scale'];

function isIntIn(value: unknown, range: { min: number; max: number }): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= range.min && value <= range.max;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Defensive on purpose: the input crossed the network, so every field is
// re-checked and anything malformed silently falls back to its default —
// a bad or missing value can never take uploads down.
export function resolveStorageSettings(raw: unknown): EffectiveStorageSettings {
  const result: EffectiveStorageSettings = {
    globalMaxUploadBytes: DEFAULT_STORAGE_SETTINGS.globalMaxUploadBytes,
    extraStoragePriceNgn: DEFAULT_STORAGE_SETTINGS.extraStoragePriceNgn,
    allowedFileGroups: [...DEFAULT_STORAGE_SETTINGS.allowedFileGroups],
    blockedMimeTypes: [],
    planQuotas: {
      starter: { ...DEFAULT_STORAGE_SETTINGS.planQuotas.starter },
      pro: { ...DEFAULT_STORAGE_SETTINGS.planQuotas.pro },
      scale: { ...DEFAULT_STORAGE_SETTINGS.planQuotas.scale },
    },
    maintenance: { ...DEFAULT_STORAGE_SETTINGS.maintenance },
  };
  if (!isObject(raw)) return result;

  if (isIntIn(raw.globalMaxUploadBytes, STORAGE_SETTINGS_LIMITS.globalMaxUploadBytes)) {
    result.globalMaxUploadBytes = raw.globalMaxUploadBytes;
  }
  if (isIntIn(raw.extraStoragePriceNgn, STORAGE_SETTINGS_LIMITS.extraStoragePriceNgn)) {
    result.extraStoragePriceNgn = raw.extraStoragePriceNgn;
  }
  if (Array.isArray(raw.allowedFileGroups)) {
    const groups = ALL_FILE_GROUP_IDS.filter(id => (raw.allowedFileGroups as unknown[]).includes(id));
    if (groups.length > 0) result.allowedFileGroups = [...groups];
  }
  if (Array.isArray(raw.blockedMimeTypes)) {
    const blocked = (raw.blockedMimeTypes as unknown[]).filter((item): item is string => typeof item === 'string' && MIME_TYPE_RE.test(item.toLowerCase()));
    result.blockedMimeTypes = [...new Set(blocked.map(item => item.toLowerCase()))].sort().slice(0, STORAGE_SETTINGS_LIMITS.blockedMimeTypesMax);
  }
  if (isObject(raw.planQuotas)) {
    for (const id of PLAN_IDS) {
      const plan = raw.planQuotas[id];
      if (
        isObject(plan) &&
        isIntIn(plan.bytesQuota, STORAGE_SETTINGS_LIMITS.planBytesQuota) &&
        isIntIn(plan.maxUploadBytes, STORAGE_SETTINGS_LIMITS.planMaxUploadBytes) &&
        plan.maxUploadBytes <= plan.bytesQuota
      ) {
        result.planQuotas[id] = { bytesQuota: plan.bytesQuota, maxUploadBytes: plan.maxUploadBytes };
      }
    }
  }
  if (isObject(raw.maintenance) && typeof raw.maintenance.enabled === 'boolean' && typeof raw.maintenance.message === 'string') {
    result.maintenance = { enabled: raw.maintenance.enabled, message: raw.maintenance.message.slice(0, STORAGE_SETTINGS_LIMITS.maintenanceMessageMax) };
  }
  return result;
}

// A plan as it applies right now: static facts (price, key limit, bandwidth)
// from storage-plans.ts, quota and upload cap from the settings. A single
// upload can never exceed the global ceiling, whatever the plan says.
export function effectivePlan(id: StoragePlanId, settings: EffectiveStorageSettings): StoragePlan {
  const base = STORAGE_PLANS[id];
  const limits = settings.planQuotas[id];
  return {
    ...base,
    bytesQuota: limits.bytesQuota,
    maxUploadBytes: Math.min(limits.maxUploadBytes, settings.globalMaxUploadBytes),
  };
}

// The types an upload may be, as the storage service wants them: the allowed
// groups, minus any single type an admin has blocked. Empty means every type
// is off, and the caller must refuse the upload (the service would reject an
// empty list).
export function allowedMimeTypes(groups: readonly FileGroupId[], blocked: readonly string[] = []): string[] {
  const wanted = new Set(groups);
  const off = new Set(blocked);
  const mimes = FILE_GROUPS.filter(group => wanted.has(group.id)).flatMap(group => group.mimeTypes);
  return [...new Set(mimes)].filter(mime => !off.has(mime));
}

// Every type this platform can store, with the group it belongs to, for pages
// that list them (the blocked types page).
export function knownMimeTypes(): Array<{ mimeType: string; groupId: FileGroupId; groupLabel: string }> {
  const seen = new Set<string>();
  const out: Array<{ mimeType: string; groupId: FileGroupId; groupLabel: string }> = [];
  for (const group of FILE_GROUPS) {
    for (const mimeType of group.mimeTypes) {
      if (seen.has(mimeType)) continue;
      seen.add(mimeType);
      out.push({ mimeType, groupId: group.id, groupLabel: group.label });
    }
  }
  return out;
}

export function maintenanceMessage(settings: EffectiveStorageSettings): string {
  return settings.maintenance.message.trim() || DEFAULT_MAINTENANCE_MESSAGE;
}
