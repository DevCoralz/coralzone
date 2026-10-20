import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, File as FileIcon, Film, Flag, Image as ImageIcon, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { AdminCloudFilesTabs } from '@/components/admin-cloud-files-tabs';
import { formatDateTime } from '@/lib/format';
import { knownMimeTypes } from '@/lib/storage-settings';
import { pageCountFor } from '@/lib/storage-users';
import {
  FILE_FLAG_FILTERS, FILE_SIZE_FILTERS, FILE_SORTS, describeFile, isFlagFilter, isSizeFilter, isSortId, typeLabel,
  type AdminFileRow, type FileFlagFilter, type FileSizeFilter, type FileSortId,
} from '@/lib/storage-files';
import { adminSearchFiles } from '@/lib/storage-files.functions';

// The styled Select cannot hold an empty value, so "every type" is this word.
const ALL_TYPES = 'all';

// Every file on the platform. Search the name, then narrow by type, size or
// flag. Open a file to flag it, remove it or block its type.
export function AdminCloudFiles() {
  const [rows, setRows] = useState<AdminFileRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [mimeType, setMimeType] = useState(ALL_TYPES);
  const [size, setSize] = useState<FileSizeFilter>('any');
  const [sort, setSort] = useState<FileSortId>('newest');
  const [flagged, setFlagged] = useState<FileFlagFilter>('all');
  const [search, setSearch] = useState('');
  const [typed, setTyped] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Only the newest request may update the screen.
  const latest = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++latest.current;
    setLoading(true);
    const result = await adminSearchFiles({ data: { q: search, mimeType, size, flagged, sort, page } });
    if (ticket !== latest.current) return;
    if (result.ok) {
      setRows(result.rows);
      setTotal(result.total);
      setPageSize(result.pageSize);
      setError(null);
    } else {
      setRows([]);
      setError(result.error);
    }
    setLoading(false);
  }, [search, mimeType, size, flagged, sort, page]);

  useEffect(() => { void load(); }, [load]);

  // Search runs half a second after typing stops, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => { if (typed.trim() !== search) { setSearch(typed.trim()); setPage(1); } }, 500);
    return () => clearTimeout(timer);
  }, [typed, search]);

  const pages = pageCountFor(total, pageSize);
  const filtered = Boolean(search) || mimeType !== ALL_TYPES || size !== 'any' || flagged !== 'all';
  const known = knownMimeTypes();
  const groups = [...new Set(known.map(k => k.groupLabel))];

  return <>
    <AdminCloudHeader
      title="Files and abuse"
      description="Find any file on the platform. Flag it, remove it, or block its type."
      actions={<Button variant="glass" onClick={() => void load()} disabled={loading} className="h-10 font-normal"><RefreshCw className={loading ? 'animate-spin' : ''} />Refresh</Button>}
    />
    <AdminCloudFilesTabs active="search" />

    <div className="relative min-w-[220px]">
      <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input value={typed} onChange={event => setTyped(event.target.value)} placeholder="Search file names, for example .zip" aria-label="Search file names"
        maxLength={100} autoComplete="off" spellCheck={false} className="rounded-full border-glass-border bg-transparent pl-10" />
    </div>

    <div className="mt-3 flex flex-wrap gap-2">
      <Select value={mimeType} onValueChange={value => { setMimeType(value); setPage(1); }}>
        <SelectTrigger aria-label="File type" className="h-10 w-auto min-w-[160px] rounded-full border-glass-border bg-transparent px-4 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_TYPES}>All types</SelectItem>
          {groups.map(group => (
            <SelectGroup key={group}>
              <SelectLabel>{group}</SelectLabel>
              {known.filter(k => k.groupLabel === group).map(k => <SelectItem key={k.mimeType} value={k.mimeType}>{typeLabel(k.mimeType)}</SelectItem>)}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <Select value={size} onValueChange={value => { if (isSizeFilter(value)) { setSize(value); setPage(1); } }}>
        <SelectTrigger aria-label="File size" className="h-10 w-auto min-w-[140px] rounded-full border-glass-border bg-transparent px-4 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{FILE_SIZE_FILTERS.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={sort} onValueChange={value => { if (isSortId(value)) { setSort(value); setPage(1); } }}>
        <SelectTrigger aria-label="Sort order" className="h-10 w-auto min-w-[140px] rounded-full border-glass-border bg-transparent px-4 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{FILE_SORTS.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Filter by flag">
      {FILE_FLAG_FILTERS.map(item => (
        <Button key={item.id} variant={flagged === item.id ? 'crystal' : 'glass'} aria-pressed={flagged === item.id}
          onClick={() => { if (isFlagFilter(item.id)) { setFlagged(item.id); setPage(1); } }} className="h-9 px-4 text-xs font-normal">{item.label}</Button>
      ))}
    </div>

    {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/15 px-4 py-2 text-xs text-destructive">{error}</p>}

    <section className="dashboard-panel mt-4 overflow-hidden">
      <div className="flex items-center justify-between border-b border-glass-border p-5">
        <h3 className="font-display text-lg font-normal">{filtered ? 'Matching files' : 'All files'}</h3>
        <p className="text-xs text-muted-foreground">{total.toLocaleString('en-NG')} file{total === 1 ? '' : 's'}</p>
      </div>
      {loading && rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        : rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">{error ? 'Nothing to show.' : filtered ? 'No files match.' : 'Nobody has uploaded a file yet.'}</p>
        : <ul className="divide-y divide-glass-border">
          {rows.map(row => (
            <li key={row.key}>
              <Link to="/admin/cloud/files/$fileId" params={{ fileId: row.key }} className="admin-row flex items-center gap-4 p-4 hover:bg-white/5 sm:px-6">
                <span className="dashboard-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                  {row.kind === 'image' ? <ImageIcon size={17} /> : row.kind === 'video' ? <Film size={17} /> : <FileIcon size={17} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm"><span className="truncate">{row.name}</span>
                    {row.flagged && <span className="flex shrink-0 items-center gap-1 rounded-full border border-destructive/40 px-2 py-0.5 text-[10px] text-destructive"><Flag size={10} aria-hidden="true" />Flagged</span>}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{describeFile(row)} · {row.owner ? row.owner.email : row.ownerId ? 'Unknown owner' : 'No owner'}</p>
                </div>
                <p className="hidden shrink-0 text-xs text-muted-foreground sm:block">{formatDateTime(row.createdAt)}</p>
                <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>}
      {pages > 1 && <div className="flex items-center justify-between border-t border-glass-border p-4 text-xs">
        <Button variant="glass" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} className="h-9 font-normal"><ChevronLeft />Previous</Button>
        <span className="text-muted-foreground">Page {page} of {pages}</span>
        <Button variant="glass" disabled={page >= pages || loading} onClick={() => setPage(page + 1)} className="h-9 font-normal">Next<ChevronRight /></Button>
      </div>}
    </section>
  </>;
}
