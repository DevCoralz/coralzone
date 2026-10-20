import { describe, it, expect } from 'vitest';
import {
  ADMIN_FILE_PAGE_SIZE, FLAG_REASON_MAX, FILE_SIZE_FILTERS, FILE_SORTS, FILE_FLAG_FILTERS, isSizeFilter, isSortId, isFlagFilter, minBytesFor,
  typeLabel, parseAdminFile, parseAdminFiles, parseOwners, attachOwners, ownerIdsOf, describeFile, parseTypeCounts, blockableTypes,
  groupBlockable, toggleBlocked, sameTypes, blockedListProblem, groupFullyBlocked,
} from './storage-files';
import { knownMimeTypes } from './storage-settings';

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const file = (over = {}) => ({ key: 'f1', name: 'a.zip', size: 10, mimeType: 'application/zip', kind: 'file', ownerId: 'u1', bucketId: null, createdAt: '2026-03-01T09:30:00', flagged: false, flagReason: null, ...over });

describe('constants match the gateway (api/_lib/storage-file.test.js pins the same values)', () => {
  it('values', () => {
    expect(ADMIN_FILE_PAGE_SIZE).toBe(25);
    expect(FLAG_REASON_MAX).toBe(200);
    expect(FILE_SORTS.map(s => s.id)).toEqual(['newest', 'oldest', 'largest', 'smallest']);
    expect(FILE_FLAG_FILTERS.map(s => s.id)).toEqual(['all', 'flagged']);
  });
});

describe('filters', () => {
  it('guards accept only known values', () => {
    expect(isSizeFilter('1gb')).toBe(true);
    expect(isSizeFilter('5tb')).toBe(false);
    expect(isSortId('largest')).toBe(true);
    expect(isSortId('size; drop')).toBe(false);
    expect(isFlagFilter('flagged')).toBe(true);
    expect(isFlagFilter('x')).toBe(false);
  });
  it('size presets map to bytes, "any" to none', () => {
    expect(minBytesFor('any')).toBeNull();
    expect(minBytesFor('100mb')).toBe(100 * MB);
    expect(minBytesFor('1gb')).toBe(GB);
    expect(FILE_SIZE_FILTERS.find(f => f.id === '2gb')?.minBytes).toBe(2 * GB);
  });
});

describe('type words', () => {
  it('names known types and shows unknown ones as they are', () => {
    expect(typeLabel('application/zip')).toBe('ZIP archive');
    expect(typeLabel('application/x-weird')).toBe('application/x-weird');
  });
  it('has a friendly name for every type the platform can store', () => {
    for (const known of knownMimeTypes()) expect(typeLabel(known.mimeType)).not.toBe(known.mimeType);
  });
});

describe('parsing files that crossed the network', () => {
  it('reads a good file and cleans junk values', () => {
    expect(parseAdminFile(file())?.name).toBe('a.zip');
    const odd = parseAdminFile(file({ size: -5, ownerId: '', flagged: 'yes', mimeType: 5 }));
    expect([odd?.size, odd?.ownerId, odd?.flagged, odd?.mimeType]).toEqual([0, null, false, '']);
  });
  it('rejects non files and skips them in lists', () => {
    expect(parseAdminFile(null)).toBeNull();
    expect(parseAdminFile({ key: 1 })).toBeNull();
    expect(parseAdminFiles([file(), { nope: 1 }, null]).length).toBe(1);
    expect(parseAdminFiles('x')).toEqual([]);
  });
  it('never carries fields it does not know, such as storage internals', () => {
    const parsed = parseAdminFile({ ...file(), tg_message_id: 99, secret: 'x' });
    expect(JSON.stringify(parsed).includes('tg_message')).toBe(false);
    expect(JSON.stringify(parsed).includes('secret')).toBe(false);
  });
});

describe('owners', () => {
  it('parse, attach by id, and leave unknown owners empty', () => {
    const owners = parseOwners([{ id: 'u1', name: 'Ada', email: 'a@x.com', banned: true }, { id: 5 }, null]);
    expect(owners.length).toBe(1);
    const rows = attachOwners([parseAdminFile(file())!, parseAdminFile(file({ key: 'f2', ownerId: 'gone' }))!, parseAdminFile(file({ key: 'f3', ownerId: null }))!], owners);
    expect(rows[0].owner?.email).toBe('a@x.com');
    expect(rows[0].owner?.banned).toBe(true);
    expect(rows[1].owner).toBeNull();
    expect(rows[2].owner).toBeNull();
  });
  it('lists each owner once for the lookup', () => {
    const files = parseAdminFiles([file(), file({ key: 'f2' }), file({ key: 'f3', ownerId: 'u2' }), file({ key: 'f4', ownerId: null })]);
    expect(ownerIdsOf(files)).toEqual(['u1', 'u2']);
  });
  it('describes a file in words', () => {
    expect(describeFile({ size: GB, mimeType: 'application/zip' })).toBe('1 GB · ZIP archive');
  });
});

describe('the blocked types list', () => {
  const counts = parseTypeCounts([{ mimeType: 'application/zip', files: 3, bytes: 900 }, { mimeType: 'application/x-old', files: 1, bytes: 5 }, { nope: 1 }]);
  it('parses counts and drops junk', () => {
    expect(counts.length).toBe(2);
    expect(parseTypeCounts([{ mimeType: 'a/b', files: -1, bytes: 'x' }])).toEqual([{ mimeType: 'a/b', files: 0, bytes: 0 }]);
    expect(parseTypeCounts(null)).toEqual([]);
  });
  it('lists every known type with its counts and blocked state, plus other types already stored', () => {
    const rows = blockableTypes(counts, ['application/zip']);
    const zip = rows.find(r => r.mimeType === 'application/zip')!;
    expect([zip.files, zip.bytes, zip.blocked, zip.label, zip.groupLabel]).toEqual([3, 900, true, 'ZIP archive', 'Archives']);
    expect(rows.find(r => r.mimeType === 'image/png')?.files).toBe(0);
    expect(rows.find(r => r.mimeType === 'image/png')?.blocked).toBe(false);
    const old = rows.find(r => r.mimeType === 'application/x-old')!;
    expect([old.groupId, old.files]).toEqual(['unlisted', 1]);
    expect(new Set(rows.map(r => r.mimeType)).size).toBe(rows.length);
  });
  it('groups in file group order, with unlisted types last', () => {
    const groups = groupBlockable(blockableTypes(counts, []));
    expect(groups[0].groupId).toBe('images');
    expect(groups[groups.length - 1].groupId).toBe('unlisted');
    expect(groups.find(g => g.groupId === 'archives')?.rows.length).toBe(4);
  });
  it('toggling keeps the list sorted and unique', () => {
    expect(toggleBlocked([], 'image/png', true)).toEqual(['image/png']);
    expect(toggleBlocked(['image/png'], 'application/zip', true)).toEqual(['application/zip', 'image/png']);
    expect(toggleBlocked(['image/png'], 'image/png', true)).toEqual(['image/png']);
    expect(toggleBlocked(['application/zip', 'image/png'], 'image/png', false)).toEqual(['application/zip']);
    expect(toggleBlocked([], 'image/png', false)).toEqual([]);
  });
  it('compares lists without caring about order', () => {
    expect(sameTypes(['a/b', 'c/d'], ['c/d', 'a/b'])).toBe(true);
    expect(sameTypes(['a/b'], [])).toBe(false);
    expect(sameTypes([], [])).toBe(true);
  });
  it('checks a list before sending', () => {
    expect(blockedListProblem(['application/zip'])).toBeNull();
    expect(blockedListProblem([])).toBeNull();
    expect(blockedListProblem(['zip'])).not.toBeNull();
    expect(blockedListProblem(['*/*'])).not.toBeNull();
    expect(blockedListProblem(Array.from({ length: 65 }, (_, i) => `a/b${i}`))).not.toBeNull();
  });
  it('notices when a whole group is blocked', () => {
    const groups = groupBlockable(blockableTypes([], []));
    const archives = groups.find(g => g.groupId === 'archives')!;
    expect(groupFullyBlocked(archives, [])).toBe(false);
    expect(groupFullyBlocked(archives, ['application/zip'])).toBe(false);
    expect(groupFullyBlocked(archives, archives.rows.map(r => r.mimeType))).toBe(true);
  });
});
