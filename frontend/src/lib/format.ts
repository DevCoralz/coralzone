// Shared display formatters. Pure, no env access — safe on server and client.

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;
const TB = GB * 1024;

// Whole numbers print without decimals (20 GB, 2 TB); others keep up to
// `digits` places (1.5 GB).
const trim = (value: number, digits: number) => String(parseFloat(value.toFixed(digits)));

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= TB) return `${trim(bytes / TB, 2)} TB`;
  if (bytes >= GB) return `${trim(bytes / GB, 2)} GB`;
  if (bytes >= MB) return `${trim(bytes / MB, 1)} MB`;
  if (bytes >= KB) return `${trim(bytes / KB, 1)} KB`;
  return `${Math.round(bytes)} B`;
}

export function formatCount(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('en-NG') : '—';
}

export function formatNgn(amountNaira: number): string {
  return `₦${amountNaira.toLocaleString('en-NG')}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}
