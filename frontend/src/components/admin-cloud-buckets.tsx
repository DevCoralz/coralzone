import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Boxes, ChevronLeft, ChevronRight, RefreshCw, Search, Snowflake, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { formatBytes } from '@/lib/format';
import { describeUsage, formatPercent, pageCount, NEARLY_FULL_RATIO, NEARLY_FULL_SCAN_CAP, type AdminBucketRow } from '@/lib/storage-buckets';
import { adminListBuckets } from '@/lib/storage-buckets.functions';

type Filter = 'all' | 'frozen' | 'full';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'frozen', label: 'Frozen' },
  { id: 'full', label: `Owner over ${Math.round(NEARLY_FULL_RATIO * 100)}% full` },
];

export function AdminCloudBuckets() {
  const [rows, setRows] = useState<AdminBucketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [typed, setTyped] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usageAvailable, setUsageAvailable] = useState(true);
  const [truncated, setTruncated] = useState(false);
  // Only the newest request may update the screen, so a slow older one
  // can't overwrite a newer filter's results.
  const latest = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++latest.current;
    setLoading(true);
    const result = await adminListBuckets({ data: { q: search, frozenOnly: filter === 'frozen', nearlyFull: filter === 'full', page } });
    if (ticket !== latest.current) return;
    if (result.ok) {
      setRows(result.rows);
      setTotal(result.total);
      setPageSize(result.pageSize);
      setUsageAvailable(result.usageAvailable);
      setTruncated(result.truncated);
      setError(null);
    } else {
      setRows([]);
      setError(result.error);
    }
    setLoading(false);
  }, [search, filter, page]);

  useEffect(() => { load(); }, [load]);

  // Search runs half a second after typing stops, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => { if (typed.trim() !== search) { setSearch(typed.trim()); setPage(1); } }, 500);
    return () => clearTimeout(timer);
  }, [typed, search]);

  const pages = pageCount(total, pageSize);

  return <>
    <AdminCloudHeader
      title="Buckets"
      description="Every bucket across all users. Open one to see its files, freeze it or delete it."
      actions={<Button variant="glass" onClick={load} disabled={loading} className="h-10 font-normal"><RefreshCw className={loading ? 'animate-spin' : ''} />Refresh</Button>}
    />

    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1">
        <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={typed} onChange={event => setTyped(event.target.value)} placeholder="Search bucket name or owner email" aria-label="Search buckets"
          maxLength={100} className="rounded-full border-glass-border bg-transparent pl-10" />
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter buckets">
        {FILTERS.map(item => (
          <Button key={item.id} variant={filter === item.id ? 'crystal' : 'glass'} aria-pressed={filter === item.id}
            onClick={() => { setFilter(item.id); setPage(1); }} className="h-10 px-4 text-xs font-normal">{item.label}</Button>
        ))}
      </div>
    </div>

    {filter === 'full' && <p className="mt-3 text-xs text-muted-foreground">
      A bucket has no size cap of its own: buckets share their owner's storage. This view lists buckets whose owner is using {Math.round(NEARLY_FULL_RATIO * 100)}% or more of their allowance, fullest first.
      {truncated && ` Only the newest ${NEARLY_FULL_SCAN_CAP.toLocaleString('en-NG')} buckets were checked.`}
    </p>}

    {!usageAvailable && !error && <p role="status" className="mt-4 flex items-center gap-2 rounded-lg border border-glass-border px-4 py-2 text-xs text-muted-foreground">
      <TriangleAlert size={14} aria-hidden="true" />The storage service could not be reached, so sizes and file counts are not shown.
    </p>}
    {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/15 px-4 py-2 text-xs text-destructive">{error}</p>}

    <section className="dashboard-panel mt-4 overflow-hidden">
      <div className="flex items-center justify-between border-b border-glass-border p-5">
        <h3 className="font-display text-lg font-normal">{filter === 'frozen' ? 'Frozen buckets' : filter === 'full' ? 'Owners nearly full' : 'All buckets'}</h3>
        <p className="text-xs text-muted-foreground">{total.toLocaleString('en-NG')} bucket{total === 1 ? '' : 's'}</p>
      </div>
      {loading && rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        : rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">{error ? 'Nothing to show.' : search || filter !== 'all' ? 'No buckets match.' : 'No buckets have been created yet.'}</p>
        : <ul className="divide-y divide-glass-border">
          {rows.map(row => (
            <li key={row.id}>
              <Link to="/admin/cloud/buckets/$bucketId" params={{ bucketId: row.id }} className="admin-row flex items-center gap-4 p-4 hover:bg-white/5 sm:px-6">
                <span className="dashboard-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">{row.frozen ? <Snowflake size={17} /> : <Boxes size={17} />}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm"><span className="truncate">{row.name}</span>
                    {row.frozen && <span className="shrink-0 rounded-full border border-glass-border px-2 py-0.5 text-[10px] text-muted-foreground">Frozen</span>}
                    {row.ownerBlock && <span className="shrink-0 rounded-full border border-destructive/40 px-2 py-0.5 text-[10px] text-destructive">Owner {row.ownerBlock}</span>}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{row.owner.email} · {row.planLabel} · {describeUsage(row)}</p>
                </div>
                <div className="hidden shrink-0 text-right text-xs sm:block">
                  {row.ownerRatio === null ? <span className="text-muted-foreground">—</span> : <>
                    <p className={row.nearlyFull ? 'text-destructive' : ''}>{formatPercent(row.ownerRatio)} of owner's space</p>
                    <p className="mt-1 text-muted-foreground">{formatBytes(row.ownerBytes ?? 0)} of {formatBytes(row.ownerQuotaBytes)}</p>
                  </>}
                </div>
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
