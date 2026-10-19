import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, KeyRound, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import {
  KEY_STATUS_FILTERS, describeLastUsed, describeRequests, describeScope, keyPageCount, maskedKey,
  type AdminApiKeyRow, type KeyStatusFilter,
} from '@/lib/storage-apikeys';
import { adminListApiKeys } from '@/lib/storage-apikeys.functions';

// Every key on the platform, newest first. An admin can open one to revoke it
// or change its rate limit, but can never see or copy the key itself.
export function AdminCloudApiKeys() {
  const [rows, setRows] = useState<AdminApiKeyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<KeyStatusFilter>('all');
  const [search, setSearch] = useState('');
  const [typed, setTyped] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Only the newest request may update the screen.
  const latest = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++latest.current;
    setLoading(true);
    const result = await adminListApiKeys({ data: { q: search, status, page } });
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
  }, [search, status, page]);

  useEffect(() => { void load(); }, [load]);

  // Search runs half a second after typing stops, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => { if (typed.trim() !== search) { setSearch(typed.trim()); setPage(1); } }, 500);
    return () => clearTimeout(timer);
  }, [typed, search]);

  const pages = keyPageCount(total, pageSize);
  const filtered = Boolean(search) || status !== 'all';

  return <>
    <AdminCloudHeader
      title="API keys"
      description="Keys across all users. Open one to see how it is used, slow it down or revoke it."
      actions={<Button variant="glass" onClick={() => void load()} disabled={loading} className="h-10 font-normal"><RefreshCw className={loading ? 'animate-spin' : ''} />Refresh</Button>}
    />

    <div className="relative min-w-[220px]">
      <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input value={typed} onChange={event => setTyped(event.target.value)} placeholder="Search key name, key prefix or owner email" aria-label="Search API keys"
        maxLength={100} autoComplete="off" spellCheck={false} className="rounded-full border-glass-border bg-transparent pl-10" />
    </div>
    <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Filter by status">
      {KEY_STATUS_FILTERS.map(item => (
        <Button key={item.id} variant={status === item.id ? 'crystal' : 'glass'} aria-pressed={status === item.id}
          onClick={() => { setStatus(item.id); setPage(1); }} className="h-9 px-4 text-xs font-normal">{item.label}</Button>
      ))}
    </div>

    {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/15 px-4 py-2 text-xs text-destructive">{error}</p>}

    <section className="dashboard-panel mt-4 overflow-hidden">
      <div className="flex items-center justify-between border-b border-glass-border p-5">
        <h3 className="font-display text-lg font-normal">{filtered ? 'Matching keys' : 'All keys'}</h3>
        <p className="text-xs text-muted-foreground">{total.toLocaleString('en-NG')} key{total === 1 ? '' : 's'}</p>
      </div>
      {loading && rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        : rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">{error ? 'Nothing to show.' : filtered ? 'No keys match.' : 'Nobody has made an API key yet.'}</p>
        : <ul className="divide-y divide-glass-border">
          {rows.map(row => (
            <li key={row.id}>
              <Link to="/admin/cloud/api-keys/$keyId" params={{ keyId: row.id }} className={`admin-row flex items-center gap-4 p-4 hover:bg-white/5 sm:px-6 ${row.revoked ? 'opacity-60' : ''}`}>
                <span className="dashboard-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"><KeyRound size={17} /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm"><span className="truncate">{row.name}</span>
                    {row.revoked && <span className="shrink-0 rounded-full border border-glass-border px-2 py-0.5 text-[10px] text-muted-foreground">Revoked</span>}
                    {row.customRateLimit && !row.revoked && <span className="shrink-0 rounded-full border border-primary-glow/50 px-2 py-0.5 text-[10px] text-primary-glow">{row.effectiveRateLimit.toLocaleString('en-NG')} a minute</span>}
                    {row.ownerBanned && <span className="shrink-0 rounded-full border border-destructive/40 px-2 py-0.5 text-[10px] text-destructive">Owner banned</span>}
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{maskedKey(row.prefix)}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{row.owner.email} · {row.planLabel} · {describeScope(row)}</p>
                </div>
                <div className="hidden shrink-0 text-right text-xs sm:block">
                  <p>{describeRequests(row.requests)}</p>
                  <p className="mt-1 text-muted-foreground">{describeLastUsed(row)}</p>
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
