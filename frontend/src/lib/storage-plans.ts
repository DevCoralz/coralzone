// Single source of truth for CoralzOne Cloud's plan limits (₦ pricing,
// storage quota, max upload size). cloud.pricing.tsx, the Starter-default
// fallback in storage.functions.ts, and the future admin settings/billing
// pages all read from here instead of each hardcoding its own copy of these
// numbers — change a plan once, everywhere agrees.
//
// Scale's 4 GB max upload is the storage service's ceiling on a Telegram
// Premium session; on a standard session it's 2 GB. STORAGE_MAX_UPLOAD_MB
// in the coralz-storage service's own env is the actual enforced limit — if
// that's still 2000 (not yet upgraded), a Scale user's upload will be
// rejected by the service above 2 GB even though this table promises 4.
// Keep the two in sync when the Telegram account goes Premium.

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;
const TB = 1024 * GB;

export type StoragePlanId = 'starter' | 'pro' | 'scale';

export interface StoragePlan {
  id: StoragePlanId;
  label: string;
  priceMonthlyNgn: number;
  priceYearlyNgn: number;
  bytesQuota: number;
  maxUploadBytes: number;
  apiKeyLimit: number | null; // null = unlimited
  bandwidthBytesPerMonth: number;
  requestsPerMonth: number | null; // null = unlimited
}

export const STORAGE_PLANS: Record<StoragePlanId, StoragePlan> = {
  starter: {
    id: 'starter',
    label: 'Starter',
    priceMonthlyNgn: 2500,
    priceYearlyNgn: 24000,
    bytesQuota: 20 * GB,
    maxUploadBytes: 500 * MB,
    apiKeyLimit: 1,
    bandwidthBytesPerMonth: 100 * GB,
    requestsPerMonth: 100_000,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    priceMonthlyNgn: 9500,
    priceYearlyNgn: 91200,
    bytesQuota: 500 * GB,
    maxUploadBytes: 2 * GB,
    apiKeyLimit: 5,
    bandwidthBytesPerMonth: 1 * TB,
    requestsPerMonth: 1_000_000,
  },
  scale: {
    id: 'scale',
    label: 'Scale',
    priceMonthlyNgn: 29500,
    priceYearlyNgn: 283200,
    bytesQuota: 2 * TB,
    maxUploadBytes: 4 * GB,
    apiKeyLimit: null,
    bandwidthBytesPerMonth: 5 * TB,
    requestsPerMonth: null,
  },
};

export const EXTRA_STORAGE_NGN_PER_10GB = 1000;
export const EXTRA_STORAGE_UNIT_BYTES = 10 * GB;

export const DEFAULT_STORAGE_PLAN: StoragePlanId = 'starter';

export function isStoragePlanId(value: string): value is StoragePlanId {
  return value === 'starter' || value === 'pro' || value === 'scale';
}
