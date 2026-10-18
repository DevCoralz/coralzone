import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Ban, ChevronLeft, ChevronRight, RefreshCw, Search, Snowflake, TriangleAlert, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { formatPercent } from '@/lib/storage-buckets';
import {
  USER_PLAN_FILTERS, USER_STATUS_FILTERS, describeUserUsage, displayName, pageCountFor,
  type AdminUserRow, type UserPlanFilter, type UserStatusFilter,
} from '@/lib/storage-users';
import { adminListCloudUsers } from '@/lib/storage-users.functions';

// The list of everyone, newest accounts first. Search runs in the database;
// sizes come from the storage service for just the people on this page.
export function AdminCloudUsers() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<UserStatusFilter>('all');
  const [plan, setPlan] = useState<UserPlanFilter>('all');
  const [search, setSearch] = useState('');
  const [typed, setTyped] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usageAvailable, setUsageAvailable] = useState(true);
  // Only the newest request may update the screen, so a slow older one
  // cannot overwrite the results of a newer filter.
  const latest = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++latest.current;
    setLoading(true);
    const result = await adminListCloudUsers({ data: { q: search, status, plan, page } });
    if (ticket !== latest.current) return;
    if (result.ok) {
      setRows(result.rows);
      setTotal(result.total);
      setPageSize(result.pageSize);
      setUsageAvailable(result.usageAvailable);
      setError(null);
    } else {
      setRows([]);
      setError(result.error);
    }
    setLoading(false);
  }, [search, status, plan, page]);

  useEffect(() => { void load(); }, [load]);

  // Search runs half a second after typing stops, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => { if (typed.trim() !== search) { setSearch(typed.trim()); setPage(1); } }, 500);
    return () => clearTimeout(timer);
  }, [typed, search]);

  const pages = pageCountFor(total, pageSize);
  const filtered = Boolean(search) || status !== 'all' || plan !== 'all';

  return <>
    <AdminCloudHeader
      title="Users and usage"
      description="Everyone on CoralzOne. Open a person to see their buckets, space and files, or to cap, freeze or ban them."
      actions={<Button variant="glass" onClick={() => void load()} disabled={loading} className="h-10 font-normal"><RefreshCw className={loading ? 'animate-spin' : ''} />Refresh</Button>}
    />

    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1">
        <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={typed} onChange={event => setTyped(event.target.value)} placeholder="Search name, email or user id" aria-label="Search users"
          maxLength={100} autoComplete="off" spellCheck={false} className="rounded-full border-glass-border bg-transparent pl-10" />
      </div>
    </div>

    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
        {USER_STATUS_FILTERS.map(item => (
          <Button key={item.id} variant={status === item.id ? 'crystal' : 'glass'} aria-pressed={status === item.id}
            onClick={() => { setStatus(item.id); setPage(1); }} className="h-9 px-4 text-xs font-normal">{item.label}</Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by plan">
        {USER_PLAN_FILTERS.map(item => (
          <Button key={item.id} variant={plan === item.id ? 'crystal' : 'glass'} aria-pressed={plan === item.id}
            onClick={() => { setPlan(item.id); setPage(1); }} className="h-9 px-4 text-xs font-normal">{item.label}</Button>
        ))}
      </div>
    </div>

    {!usageAvailable && !error && <p role="status" className="mt-4 flex items-center gap-2 rounded-lg border border-glass-border px-4 py-2 text-xs text-muted-foreground">
      <TriangleAlert size={14} aria-hidden="true" />The storage service could not be reached, so sizes and file counts are not shown.
    </p>}
    {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/15 px-4 py-2 text-xs text-destructive">{error}</p>}

    <section className="dashboard-panel mt-4 overflow-hidden">
      <div className="flex items-center justify-between border-b border-glass-border p-5">
        <h3 className="font-display text-lg font-normal">{filtered ? 'Matching users' : 'All users'}</h3>
        <p className="text-xs text-muted-foreground">{total.toLocaleString('en-NG')} user{total === 1 ? '' : 's'}</p>
      </div>
      {loading && rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        : rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">{error ? 'Nothing to show.' : filtered ? 'No users match.' : 'Nobody has signed up yet.'}</p>
        : <ul className="divide-y divide-glass-border">
          {rows.map(row => (
            <li key={row.id}>
              <Link to="/admin/cloud/users/$userId" params={{ userId: row.id }} className="admin-row flex items-center gap-4 p-4 hover:bg-white/5 sm:px-6">
                <span className="dashboard-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                  {row.block === 'banned' ? <Ban size={17} /> : row.block === 'frozen' ? <Snowflake size={17} /> : <UserRound size={17} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm">
                    <span className="truncate">{displayName(row)}</span>
                    <span className="shrink-0 rounded-full border border-glass-border px-2 py-0.5 text-[10px] text-muted-foreground">{row.planLabel}</span>
                    {row.block && <span className="shrink-0 rounded-full border border-destructive/40 px-2 py-0.5 text-[10px] text-destructive">{row.block === 'banned' ? 'Banned' : 'Frozen'}</span>}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {row.name.trim() ? `${row.email} · ` : ''}{row.bucketCount} bucket{row.bucketCount === 1 ? '' : 's'} · {describeUserUsage(row)}
                  </p>
                </div>
                <div className="hidden shrink-0 text-right text-xs sm:block">
                  {row.ratio === null ? <span className="text-muted-foreground">Unknown</span>
                    : <p className={row.nearlyFull ? 'text-destructive' : ''}>{formatPercent(row.ratio)} full</p>}
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
