import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { RefreshCw, Snowflake, Sun, Trash2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { formatBytes, formatDateTime } from '@/lib/format';
import { describeUsage, formatPercent } from '@/lib/storage-buckets';
import {
  adminGetBucketDetail, adminSetBucketFrozen, adminEmptyBucketStep, adminRemoveBucket, type AdminBucketDetail,
} from '@/lib/storage-buckets.functions';

type Ready = Extract<AdminBucketDetail, { ok: true }>;

export function AdminCloudBucketDetail({ bucketId }: { bucketId: string }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [progress, setProgress] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await adminGetBucketDetail({ data: bucketId });
    if (result.ok) { setDetail(result); setError(null); }
    else { setError(result.error); setNotFound(Boolean(result.notFound)); }
    setLoading(false);
  }, [bucketId]);

  useEffect(() => { load(); }, [load]);

  async function toggleFrozen() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    const result = await adminSetBucketFrozen({ data: { id: bucketId, frozen: !detail.row.frozen } });
    setBusy(false);
    if (!result.ok) setError(result.error ?? 'Could not change the bucket.');
    await load();
  }

  // Empties the bucket 50 files at a time (each call is short, so no serverless
  // time limit can interrupt it), then removes the bucket itself. Safe to
  // re-run after a failure: it continues with whatever is left.
  async function deleteBucket() {
    setBusy(true);
    setError(null);
    let removedFiles = 0;
    try {
      for (let guard = 0; guard < 2000; guard++) {
        const step = await adminEmptyBucketStep({ data: bucketId });
        if (!step.ok) throw new Error(step.error ?? 'Could not delete the files.');
        removedFiles += step.deleted;
        setProgress(`Deleted ${removedFiles.toLocaleString('en-NG')} file${removedFiles === 1 ? '' : 's'}${step.remaining ? `, ${step.remaining.toLocaleString('en-NG')} to go` : ''}…`);
        if (step.remaining === 0) break;
        if (step.deleted === 0) throw new Error('No progress was made emptying the bucket. Try again.');
      }
      const removed = await adminRemoveBucket({ data: { id: bucketId, filesDeleted: removedFiles } });
      if (!removed.ok) throw new Error(removed.error ?? 'Could not remove the bucket.');
      await navigate({ to: '/admin/cloud/buckets' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the bucket.');
      setConfirmOpen(false);
      setTypedName('');
      await load();
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const row = detail?.row;

  return <>
    <AdminCloudHeader
      title={row?.name ?? 'Bucket'}
      description="One bucket: who owns it, what is in it, and what you can do about it."
      actions={<Button variant="glass" onClick={load} disabled={loading || busy} className="h-10 font-normal"><RefreshCw className={loading ? 'animate-spin' : ''} />Refresh</Button>}
    />
    <p className="-mt-3 mb-5 text-xs"><Link to="/admin/cloud/buckets" className="text-muted-foreground hover:text-foreground">← All buckets</Link></p>

    {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/15 px-4 py-2 text-xs text-destructive">{error}</p>}
    {progress && <p role="status" className="mb-4 rounded-lg border border-glass-border px-4 py-2 text-xs">{progress}</p>}

    {loading && !row ? <p className="text-sm text-muted-foreground">Loading…</p>
      : notFound ? <p className="dashboard-panel p-6 text-sm text-muted-foreground">This bucket no longer exists.</p>
      : row && detail && <>
        <section className="dashboard-panel grid gap-5 p-5 sm:grid-cols-2 sm:p-7">
          <div>
            <h3 className="font-display text-lg font-normal">Bucket</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Status</dt><dd>{row.frozen ? 'Frozen: no new uploads' : 'Active'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Created</dt><dd>{formatDateTime(row.createdAt)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Holds</dt><dd>{describeUsage(row)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Bucket id</dt><dd className="truncate font-mono text-xs">{row.id}</dd></div>
            </dl>
          </div>
          <div>
            <h3 className="font-display text-lg font-normal">Owner</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Email</dt><dd className="truncate">{row.owner.email}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Plan</dt><dd>{row.planLabel}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Space used</dt><dd className={row.nearlyFull ? 'text-destructive' : ''}>
                {row.ownerBytes === null || row.ownerRatio === null ? '—' : `${formatBytes(row.ownerBytes)} of ${formatBytes(row.ownerQuotaBytes)} (${formatPercent(row.ownerRatio)})`}</dd></div>
              {row.ownerBlock && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Account</dt><dd className="text-destructive">{row.ownerBlock === 'banned' ? 'Banned from Cloud' : 'Storage frozen'}</dd></div>}
            </dl>
            <Button asChild variant="glass" className="mt-4 h-9 font-normal"><Link to="/admin/cloud/users"><UserRound />Manage this user</Link></Button>
            <p className="mt-2 text-xs text-muted-foreground">On the Users page, look the user up by email to cap, freeze or ban them.</p>
          </div>
        </section>

        <section className="dashboard-panel mt-5 p-5 sm:p-7">
          <h3 className="font-display text-lg font-normal">Actions</h3>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="glass" onClick={toggleFrozen} disabled={busy} className="h-10 font-normal">
              {row.frozen ? <><Sun />Unfreeze bucket</> : <><Snowflake />Freeze bucket</>}
            </Button>
            <Button variant="glass" onClick={() => { setTypedName(''); setConfirmOpen(true); }} disabled={busy} className="h-10 font-normal text-destructive"><Trash2 />Delete bucket and files</Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Freezing stops uploads into this bucket (its files stay downloadable) and stops the owner renaming or deleting it. Every change is written to the admin log.</p>
        </section>

        <section className="dashboard-panel mt-5 overflow-hidden">
          <div className="flex items-center justify-between border-b border-glass-border p-5">
            <h3 className="font-display text-lg font-normal">Files</h3>
            <p className="text-xs text-muted-foreground">
              {detail.storageOnline ? `Newest ${detail.filesShown}${row.usage && row.usage.files > detail.filesShown ? ` of ${row.usage.files.toLocaleString('en-NG')}` : ''}` : 'Storage service unreachable'}
            </p>
          </div>
          {detail.files.length === 0 ? <p className="p-6 text-sm text-muted-foreground">{detail.storageOnline ? 'This bucket is empty.' : 'Files cannot be listed right now.'}</p>
            : <ul className="divide-y divide-glass-border">
              {detail.files.map(file => (
                <li key={file.key} className="admin-row p-4 sm:px-6">
                  <p className="truncate text-sm">{file.name || file.key}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{formatBytes(file.size)}{file.contentType ? ` · ${file.contentType}` : ''}{file.updatedAt ? ` · ${formatDateTime(file.updatedAt)}` : ''}</p>
                </li>
              ))}
            </ul>}
          <p className="border-t border-glass-border p-4 text-xs text-muted-foreground">Removing single files and blocking file types arrives with “Files &amp; abuse”.</p>
        </section>

        <AlertDialog open={confirmOpen} onOpenChange={open => { if (!busy) setConfirmOpen(open); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{row.name}” and everything in it?</AlertDialogTitle>
              <AlertDialogDescription>
                {row.usage ? `This permanently deletes ${row.usage.files.toLocaleString('en-NG')} file${row.usage.files === 1 ? '' : 's'} (${formatBytes(row.usage.bytes)}) belonging to ${row.owner.email}, then the bucket. It cannot be undone.` : 'This permanently deletes every file in the bucket, then the bucket. It cannot be undone.'}
                {' '}Type the bucket name to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input value={typedName} onChange={event => setTypedName(event.target.value)} aria-label="Type the bucket name to confirm" autoComplete="off"
              className="rounded-full border-glass-border bg-transparent" />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
              <Button onClick={deleteBucket} disabled={busy || typedName.trim() !== row.name} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {busy ? 'Deleting…' : 'Delete everything'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>}
  </>;
}
