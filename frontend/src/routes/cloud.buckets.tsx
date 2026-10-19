import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Boxes, Plus, RefreshCw, Snowflake, Pencil, Trash2, Check, X, FolderOpen, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { dashboardHead } from '@/lib/dashboard-head';
import { getBrandMetadata } from '@/lib/brand.functions';
import { formatBytes } from '@/lib/format';
import { BUCKET_NAME_MAX, SELECTED_BUCKET_KEY, canCreateBucket, describeBucketLimit, validateBucketName, type MyBucket } from '@/lib/storage-buckets';
import type { StoragePlanId } from '@/lib/storage-plans';
import { listMyBuckets, createMyBucket, renameMyBucket, deleteMyBucket } from '@/lib/storage-buckets.functions';

export const Route = createFileRoute('/cloud/buckets')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Buckets', 'Organise your Cloud files into buckets.', '/cloud/buckets', loaderData?.origin),
  component: Page,
});

type Notice = { kind: 'success' | 'error'; text: string } | null;

function Page() {
  const [loading, setLoading] = useState(true);
  const [buckets, setBuckets] = useState<MyBucket[]>([]);
  const [plan, setPlan] = useState<StoragePlanId>('starter');
  const [planLabel, setPlanLabel] = useState('Starter');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [usageAvailable, setUsageAvailable] = useState(true);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<MyBucket | null>(null);

  async function refresh() {
    setLoading(true);
    const result = await listMyBuckets();
    if (result.ok) {
      setBuckets(result.buckets);
      setPlan(result.plan);
      setPlanLabel(result.planLabel);
      setUsageAvailable(result.usageAvailable);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  const nameCheck = validateBucketName(name);
  const createCheck = canCreateBucket(plan, buckets.length);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!nameCheck.ok || !createCheck.ok || creating) return;
    setCreating(true);
    setNotice(null);
    const result = await createMyBucket({ data: name });
    setCreating(false);
    if (result.ok) {
      setName('');
      setNotice({ kind: 'success', text: `Created “${result.bucket.name}”.` });
      await refresh();
    } else {
      setNotice({ kind: 'error', text: result.error });
    }
  }

  async function handleRename(bucket: MyBucket) {
    if (!renaming) return;
    const check = validateBucketName(renaming.value);
    if (!check.ok) { setNotice({ kind: 'error', text: check.error }); return; }
    if (check.name === bucket.name) { setRenaming(null); return; }
    setBusyId(bucket.id);
    const result = await renameMyBucket({ data: { id: bucket.id, name: check.name } });
    setBusyId(null);
    if (result.ok) { setRenaming(null); setNotice({ kind: 'success', text: 'Renamed.' }); await refresh(); }
    else setNotice({ kind: 'error', text: result.error });
  }

  async function confirmDelete() {
    const bucket = toDelete;
    if (!bucket) return;
    setToDelete(null);
    setBusyId(bucket.id);
    const result = await deleteMyBucket({ data: bucket.id });
    setBusyId(null);
    if (result.ok) { setNotice({ kind: 'success', text: `Deleted “${bucket.name}”.` }); await refresh(); }
    else setNotice({ kind: 'error', text: result.error ?? 'Could not delete the bucket.' });
  }

  function open(bucket: MyBucket) {
    try { window.localStorage.setItem(SELECTED_BUCKET_KEY, bucket.id); } catch { /* storage unavailable */ }
  }

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-normal sm:text-4xl">Buckets</h1>
        <p className="mt-1 text-xs text-muted-foreground">{planLabel} plan · {describeBucketLimit(plan)}. Buckets share your storage space.</p>
      </div>
      <Button variant="glass" onClick={refresh} disabled={loading} className="h-11 w-11 p-0" aria-label="Refresh"><RefreshCw className={loading ? 'animate-spin' : ''} /></Button>
    </div>

    {notice && <div role="status" className={`mt-5 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${notice.kind === 'success' ? 'border-online/40 bg-online/15 text-online' : 'border-destructive/40 bg-destructive/15 text-destructive'}`}>
      <span className="min-w-0 flex-1">{notice.text}</span>
      <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100"><X size={14} /></button>
    </div>}

    <form onSubmit={handleCreate} className="dashboard-panel mt-5 p-4 sm:p-5">
      <label htmlFor="bucket-name" className="text-sm">New bucket</label>
      <div className="mt-2 flex flex-wrap gap-2">
        <Input id="bucket-name" value={name} onChange={event => setName(event.target.value)} maxLength={BUCKET_NAME_MAX + 20}
          placeholder="e.g. Website images" autoComplete="off" disabled={!createCheck.ok}
          className="min-w-0 flex-1 rounded-full border-glass-border bg-transparent" aria-describedby="bucket-hint" />
        <Button type="submit" variant="crystal" disabled={!nameCheck.ok || !createCheck.ok || creating} className="h-10 px-5 font-normal"><Plus />{creating ? 'Creating' : 'Create'}</Button>
      </div>
      <p id="bucket-hint" className="mt-2 text-xs text-muted-foreground">
        {!createCheck.ok ? createCheck.reason : name && !nameCheck.ok ? nameCheck.error : 'Letters, numbers, spaces, dots, dashes and underscores.'}
      </p>
      {!createCheck.ok && <Button asChild variant="glass" className="mt-3 h-9 font-normal"><Link to="/cloud/pricing">See plans</Link></Button>}
    </form>

    <section className="dashboard-panel mt-5 overflow-hidden">
      {loadError ? <p role="alert" className="p-6 text-sm text-destructive">{loadError}</p>
        : loading && buckets.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Loading</p>
        : buckets.length === 0 ? <div className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="dashboard-icon flex h-12 w-12 items-center justify-center rounded-lg"><Boxes size={20} /></span>
          <p className="text-sm text-muted-foreground">No buckets yet. Your files can live without one, or you can group them here.</p>
        </div>
        : <ul className="divide-y divide-glass-border">
          {buckets.map(bucket => {
            const editing = renaming?.id === bucket.id;
            return (
              <li key={bucket.id} className="flex items-center gap-4 p-4 sm:px-6">
                <span className="dashboard-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">{bucket.frozen ? <Snowflake size={17} /> : <Boxes size={17} />}</span>
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <form onSubmit={event => { event.preventDefault(); handleRename(bucket); }} className="flex gap-2">
                      <Input value={renaming.value} onChange={event => setRenaming({ id: bucket.id, value: event.target.value })} autoFocus aria-label="New bucket name"
                        className="h-9 min-w-0 flex-1 rounded-full border-glass-border bg-transparent" />
                      <Button type="submit" variant="glass" size="icon" className="h-9 w-9 shrink-0 rounded-lg" aria-label="Save name" disabled={busyId === bucket.id}><Check size={15} /></Button>
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-lg" aria-label="Cancel rename" onClick={() => setRenaming(null)}><X size={15} /></Button>
                    </form>
                  ) : <>
                    <p className="flex items-center gap-2 text-sm"><span className="truncate">{bucket.name}</span>
                      {bucket.frozen && <span className="shrink-0 rounded-full border border-glass-border px-2 py-0.5 text-[10px] text-muted-foreground">Frozen</span>}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{usageAvailable ? `${bucket.files.toLocaleString('en-NG')} file${bucket.files === 1 ? '' : 's'} · ${formatBytes(bucket.bytes)}` : 'Size unavailable'}</p>
                  </>}
                </div>
                {!editing && (busyId === bucket.id ? <RefreshCw size={16} className="mr-2 shrink-0 animate-spin text-muted-foreground" /> : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-lg" aria-label={`Actions for ${bucket.name}`}><MoreVertical size={16} /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem asChild><Link to="/cloud/storage" onClick={() => open(bucket)}><FolderOpen size={15} />Open files</Link></DropdownMenuItem>
                      <DropdownMenuItem disabled={bucket.frozen} onSelect={() => setRenaming({ id: bucket.id, value: bucket.name })}><Pencil size={15} />Rename</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem disabled={bucket.frozen} onSelect={() => setToDelete(bucket)} className="text-destructive focus:text-destructive"><Trash2 size={15} />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ))}
              </li>
            );
          })}
        </ul>}
    </section>

    <AlertDialog open={toDelete !== null} onOpenChange={open => { if (!open) setToDelete(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{toDelete?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {toDelete && toDelete.files > 0
              ? `It still holds ${toDelete.files} file${toDelete.files === 1 ? '' : 's'}. Delete those from Storage first; a bucket can only be deleted when it is empty.`
              : 'The bucket is empty, so no files are lost. API keys limited to this bucket are revoked. This cannot be undone.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDelete} disabled={Boolean(toDelete && toDelete.files > 0)}>Delete bucket</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
