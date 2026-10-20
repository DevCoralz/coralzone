// Pure logic for the admin Files and abuse pages, shared by the pages and the
// server functions. No env, no network. The storage service does the real
// filtering (and rejects bad filter values); the gateway checks every action.
// The constants here only drive the page, and storage-files.test.ts pins them
// to api/_lib/storage-file.test.js.
import { formatBytes } from './format';
import { FILE_GROUPS, MIME_TYPE_RE, STORAGE_SETTINGS_LIMITS, knownMimeTypes, type FileGroupId } from './storage-settings';

export const ADMIN_FILE_PAGE_SIZE = 25;
export const FLAG_REASON_MAX = 200;

const MB = 1024 * 1024;
const GB = 1024 * MB;

// ─── Filters ─────────────────────────────────────────────────────────────────

export type FileSizeFilter = 'any' | '100mb' | '500mb' | '1gb' | '2gb';
export type FileSortId = 'newest' | 'oldest' | 'largest' | 'smallest';
export type FileFlagFilter = 'all' | 'flagged';

export const FILE_SIZE_FILTERS: Array<{ id: FileSizeFilter; label: string; minBytes: number | null }> = [
  { id: 'any', label: 'Any size', minBytes: null },
  { id: '100mb', label: 'Over 100 MB', minBytes: 100 * MB },
  { id: '500mb', label: 'Over 500 MB', minBytes: 500 * MB },
  { id: '1gb', label: 'Over 1 GB', minBytes: 1 * GB },
  { id: '2gb', label: 'Over 2 GB', minBytes: 2 * GB },
];

export const FILE_SORTS: Array<{ id: FileSortId; label: string }> = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'largest', label: 'Largest first' },
  { id: 'smallest', label: 'Smallest first' },
];

export const FILE_FLAG_FILTERS: Array<{ id: FileFlagFilter; label: string }> = [
  { id: 'all', label: 'All files' },
  { id: 'flagged', label: 'Flagged' },
];

export function isSizeFilter(value: unknown): value is FileSizeFilter {
  return FILE_SIZE_FILTERS.some(item => item.id === value);
}
export function isSortId(value: unknown): value is FileSortId {
  return FILE_SORTS.some(item => item.id === value);
}
export function isFlagFilter(value: unknown): value is FileFlagFilter {
  return value === 'all' || value === 'flagged';
}

export function minBytesFor(filter: FileSizeFilter): number | null {
  return FILE_SIZE_FILTERS.find(item => item.id === filter)?.minBytes ?? null;
}

// ─── Words for a type ────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG image', 'image/png': 'PNG image', 'image/webp': 'WebP image', 'image/gif': 'GIF image',
  'image/x-icon': 'Icon', 'image/vnd.microsoft.icon': 'Icon',
  'video/mp4': 'MP4 video', 'video/webm': 'WebM video',
  'audio/mpeg': 'MP3 audio', 'audio/ogg': 'OGG audio', 'audio/flac': 'FLAC audio',
  'application/pdf': 'PDF document', 'application/vnd.ms-office': 'Older Office file',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'application/zip': 'ZIP archive', 'application/x-7z-compressed': '7z archive', 'application/vnd.rar': 'RAR archive', 'application/gzip': 'GZIP archive',
  'text/plain': 'Plain text', 'text/csv': 'CSV', 'application/json': 'JSON', 'text/markdown': 'Markdown',
  'application/octet-stream': 'Other binary file',
};

// A friendly name for a MIME type. Unknown types show as they are.
export function typeLabel(mimeType: string): string {
  return TYPE_LABELS[mimeType] ?? mimeType;
}

// ─── Files from the storage service ──────────────────────────────────────────

export interface AdminFile {
  key: string;
  name: string;
  size: number;
  mimeType: string;
  kind: string;
  ownerId: string | null;
  bucketId: string | null;
  createdAt: string | null;
  flagged: boolean;
  flagReason: string | null;
}

export interface FileOwner {
  id: string;
  name: string;
  email: string;
  banned: boolean;
}

export interface AdminFileRow extends AdminFile {
  // null when the person is gone, or the file has no owner.
  owner: FileOwner | null;
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const orNull = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

export function parseAdminFile(value: unknown): AdminFile | null {
  if (!isObject(value) || typeof value.key !== 'string' || typeof value.name !== 'string') return null;
  const size = typeof value.size === 'number' && Number.isFinite(value.size) && value.size >= 0 ? value.size : 0;
  return {
    key: value.key,
    name: value.name,
    size,
    mimeType: typeof value.mimeType === 'string' ? value.mimeType : '',
    kind: typeof value.kind === 'string' ? value.kind : '',
    ownerId: orNull(value.ownerId),
    bucketId: orNull(value.bucketId),
    createdAt: orNull(value.createdAt),
    flagged: value.flagged === true,
    flagReason: orNull(value.flagReason),
  };
}

export function parseAdminFiles(value: unknown): AdminFile[] {
  return (Array.isArray(value) ? value : []).map(parseAdminFile).filter((f): f is AdminFile => f !== null);
}

export function parseOwners(value: unknown): FileOwner[] {
  const out: FileOwner[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    if (!isObject(item) || typeof item.id !== 'string' || typeof item.email !== 'string') continue;
    out.push({ id: item.id, name: typeof item.name === 'string' ? item.name : '', email: item.email, banned: item.banned === true });
  }
  return out;
}

export function attachOwners(files: AdminFile[], owners: FileOwner[]): AdminFileRow[] {
  const byId = new Map(owners.map(owner => [owner.id, owner]));
  return files.map(file => ({ ...file, owner: file.ownerId ? byId.get(file.ownerId) ?? null : null }));
}

// The distinct owners on a page, to look up in one call.
export function ownerIdsOf(files: AdminFile[]): string[] {
  return [...new Set(files.map(f => f.ownerId).filter((id): id is string => Boolean(id)))];
}

export function describeFile(file: Pick<AdminFile, 'size' | 'mimeType'>): string {
  return `${formatBytes(file.size)} · ${typeLabel(file.mimeType)}`;
}

// ─── Types, counts and the blocked list ──────────────────────────────────────

export interface TypeCount {
  mimeType: string;
  files: number;
  bytes: number;
}

export function parseTypeCounts(value: unknown): TypeCount[] {
  const out: TypeCount[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    if (!isObject(item) || typeof item.mimeType !== 'string') continue;
    out.push({
      mimeType: item.mimeType,
      files: typeof item.files === 'number' && item.files >= 0 ? item.files : 0,
      bytes: typeof item.bytes === 'number' && item.bytes >= 0 ? item.bytes : 0,
    });
  }
  return out;
}

export interface BlockableType {
  mimeType: string;
  label: string;
  groupId: FileGroupId | 'unlisted';
  groupLabel: string;
  files: number;
  bytes: number;
  blocked: boolean;
}

// Every type the platform can store, plus any other type that already has
// files, each with its file count and whether it is blocked now. Grouped in the
// same order as the file groups, so the page reads the same as the settings.
export function blockableTypes(counts: TypeCount[], blocked: readonly string[]): BlockableType[] {
  const byType = new Map(counts.map(c => [c.mimeType, c]));
  const off = new Set(blocked);
  const rows: BlockableType[] = knownMimeTypes().map(known => ({
    mimeType: known.mimeType,
    label: typeLabel(known.mimeType),
    groupId: known.groupId,
    groupLabel: known.groupLabel,
    files: byType.get(known.mimeType)?.files ?? 0,
    bytes: byType.get(known.mimeType)?.bytes ?? 0,
    blocked: off.has(known.mimeType),
  }));
  const listed = new Set(rows.map(r => r.mimeType));
  for (const count of counts) {
    if (listed.has(count.mimeType)) continue;
    rows.push({ mimeType: count.mimeType, label: typeLabel(count.mimeType), groupId: 'unlisted', groupLabel: 'Other types in storage', files: count.files, bytes: count.bytes, blocked: off.has(count.mimeType) });
  }
  return rows;
}

// Rows grouped for display, in file group order.
export function groupBlockable(rows: BlockableType[]): Array<{ groupId: string; groupLabel: string; rows: BlockableType[] }> {
  const order: string[] = [...FILE_GROUPS.map(g => g.id), 'unlisted'];
  const groups = new Map<string, { groupId: string; groupLabel: string; rows: BlockableType[] }>();
  for (const row of rows) {
    const group = groups.get(row.groupId) ?? { groupId: row.groupId, groupLabel: row.groupLabel, rows: [] };
    group.rows.push(row);
    groups.set(row.groupId, group);
  }
  return order.filter(id => groups.has(id)).map(id => groups.get(id)!);
}

// Switching one type on or off in the list the page is editing. Sorted and
// unique, the same shape the gateway saves.
export function toggleBlocked(current: readonly string[], mimeType: string, blocked: boolean): string[] {
  const next = new Set(current);
  if (blocked) next.add(mimeType);
  else next.delete(mimeType);
  return [...next].sort();
}

export function sameTypes(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((item, index) => item === right[index]);
}

// Checks a list before it is sent: real MIME types only, and not too many.
export function blockedListProblem(list: readonly string[]): string | null {
  if (list.length > STORAGE_SETTINGS_LIMITS.blockedMimeTypesMax) return `Block at most ${STORAGE_SETTINGS_LIMITS.blockedMimeTypesMax} file types.`;
  if (!list.every(item => MIME_TYPE_RE.test(item))) return 'Each blocked type must be a MIME type such as application/zip.';
  return null;
}

// What a block would leave open, for the warning on the page: the groups the
// admin has allowed, and whether every type in them is now off.
export function groupFullyBlocked(group: { rows: BlockableType[] }, blocked: readonly string[]): boolean {
  const off = new Set(blocked);
  return group.rows.length > 0 && group.rows.every(row => off.has(row.mimeType));
}
