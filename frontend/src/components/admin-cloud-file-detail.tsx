import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Ban, Boxes, Flag, FlagOff, RefreshCw, ShieldOff, Trash2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { AdminCloudFilesTabs } from '@/components/admin-cloud-files-tabs';
import { formatBytes, formatDateTime } from '@/lib/format';
import { FLAG_REASON_MAX, toggleBlocked, typeLabel } from '@/lib/storage-files';
import { adminFileAction, adminGetFile, adminSetBlockedTypes, type AdminFileResult } from '@/lib/storage-files.functions';

type Ready = Extract<AdminFileResult, { ok: true }>;

// One file: what it is, whose it is, and the things an admin can do about it.
// The file itself is never opened here, so reviewing a harmful file cannot
// harm the admin. Every change is written to the admin log.
export function AdminCloudFileDetail({ fileId }: { fileId: string }) {
  const [data, setData] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [removed, setRemoved] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'block' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await adminGetFile({ data: fileId });
    if (result.ok) { setData(result); setError(null); setNotFound(false); }
    else { setError(result.error); setNotFound(Boolean(result.notFound)); }
    setLoading(false);
  }, [fileId]);

  useEffect(() => { void load(); }, [load]);

  const file = data?.file;

  // After a successful action. audited is false only when the log entry failed.
  function say(text: string, audited: boolean) {
    setNotice(audited ? text : `${text} The admin log entry could not be saved, so note it down yourself.`);
  }

  async function flag(on: boolean) {
    if (!file) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    const result = await adminFileAction({ data: { id: file.key, action: on ? 'flag' : 'unflag', reason: on ? reason : null } });
    setBusy(false);
    if (result.ok) { say(on ? 'Flagged for review.' : 'Flag cleared.', result.audited); setReason(''); await load(); }
    else setError(result.error);
  }

  async function removeFile() {
    if (!file) return;
    setConfirm(null);
    setBusy(true);
    setNotice(null);
    setError(null);
    const result = await adminFileAction({ data: { id: file.key, action: 'delete', reason: null } });
    setBusy(false);
    if (result.ok) { setRemoved(true); say('File removed.', result.audited); }
    else setError(result.error);
  }

  async function blockType() {
    if (!file || !data) return;
    setConfirm(null);
    setBusy(true);
    setNotice(null);
    setError(null);
    const result = await adminSetBlockedTypes({ data: toggleBlocked(data.blockedTypes, file.mimeType, true) });
    setBusy(false);
    if (result.ok) { setNotice(`${typeLabel(file.mimeType)} uploads are now blocked. Files already stored stay until you remove them.`); await load(); }
    else setError(result.error);
  }

  return <>
    <AdminCloudHeader
      title={file?.name ?? 'File'}
      description="One file: what it is, whose it is, and what you can do about it."
      actions={<Button variant="glass" onClick={() => void load()} disabled={loading || busy || removed} className="h-10 font-normal"><RefreshCw className={loading ? 'animate-spin' : ''} />Refresh</Button>}
    />
    <AdminCloudFilesTabs active="search" />
    <p className="-mt-2 mb-5 text-xs"><Link to="/admin/cloud/files" className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><ArrowLeft size={13} aria-hidden="true" />All files</Link></p>

    {error && !notFound && <p role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/15 px-4 py-2 text-xs text-destructive">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-lg border border-glass-border px-4 py-2 text-xs">{notice}</p>}

    {removed ? <p className="dashboard-panel p-6 text-sm text-muted-foreground">This file has been removed.</p>
      : loading && !file ? <p className="text-sm text-muted-foreground">Loading…</p>
      : notFound ? <p className="dashboard-panel p-6 text-sm text-muted-foreground">This file no longer exists.</p>
      : file && data && <div className="space-y-5">
        <section className="dashboard-panel grid gap-5 p-5 sm:grid-cols-2 sm:p-7">
          <div>
            <h3 className="font-display text-lg font-normal">File</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Type</dt><dd className="text-right">{typeLabel(file.mimeType)}<span className="block font-mono text-[11px] text-muted-foreground">{file.mimeType}</span></dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Size</dt><dd>{formatBytes(file.size)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Uploaded</dt><dd>{formatDateTime(file.createdAt)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Review</dt><dd className={file.flagged ? 'text-destructive' : ''}>{file.flagged ? 'Flagged' : 'Not flagged'}</dd></div>
              {file.flagged && file.flagReason && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Reason</dt><dd className="text-right">{file.flagReason}</dd></div>}
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">File id</dt><dd className="truncate font-mono text-xs">{file.key}</dd></div>
            </dl>
          </div>
          <div>
            <h3 className="font-display text-lg font-normal">Owner</h3>
            {file.owner ? <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Email</dt><dd className="truncate">{file.owner.email}</dd></div>
              {file.owner.name.trim() && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Name</dt><dd className="truncate">{file.owner.name}</dd></div>}
              {file.owner.banned && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Account</dt><dd className="text-destructive">Banned from Cloud</dd></div>}
            </dl> : <p className="mt-3 text-sm text-muted-foreground">{file.ownerId ? 'The owner no longer exists.' : 'This file has no owner.'}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {file.owner && <Button asChild variant="glass" className="h-9 font-normal"><Link to="/admin/cloud/users/$userId" params={{ userId: file.owner.id }}><UserRound />Open this user</Link></Button>}
              {file.bucketId ? <Button asChild variant="glass" className="h-9 font-normal"><Link to="/admin/cloud/buckets/$bucketId" params={{ bucketId: file.bucketId }}><Boxes />Open its bucket</Link></Button>
                : <p className="self-center text-xs text-muted-foreground">Not in a bucket</p>}
            </div>
          </div>
        </section>

        <section className="dashboard-panel p-5 sm:p-7" aria-labelledby="f-flag">
          <h3 id="f-flag" className="flex items-center gap-2 font-display text-lg font-normal"><Flag size={17} className="text-primary-glow" aria-hidden="true" />Review</h3>
          <p className="mt-2 text-sm text-muted-foreground">Flagging marks the file so you can find it again under Flagged. It does not change what the owner can do.</p>
          {file.flagged ? <Button variant="glass" onClick={() => void flag(false)} disabled={busy} className="mt-4 h-10 font-normal"><FlagOff />Clear flag</Button>
            : <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void flag(true); }}>
              <label className="block min-w-[200px] flex-1 text-xs text-muted-foreground">Reason (optional)
                <Input value={reason} onChange={event => setReason(event.target.value)} maxLength={FLAG_REASON_MAX} placeholder="e.g. Looks like malware" disabled={busy}
                  className="mt-2 rounded-full border-glass-border bg-transparent text-foreground" />
              </label>
              <Button type="submit" variant="crystal" disabled={busy} className="h-10 px-5 font-normal"><Flag />Flag this file</Button>
            </form>}
        </section>

        <section className="dashboard-panel p-5 sm:p-7" aria-labelledby="f-act">
          <h3 id="f-act" className="font-display text-lg font-normal">Remove or block</h3>
          <div className="mt-3 space-y-5">
            <div>
              <p className="text-sm text-muted-foreground">Removing deletes the file for good, and frees the owner's space. It cannot be undone.</p>
              <Button variant="glass" onClick={() => setConfirm('delete')} disabled={busy} className="mt-3 h-10 font-normal text-destructive"><Trash2 />Remove this file</Button>
            </div>
            <div className="border-t border-glass-border pt-5">
              <p className="text-sm text-muted-foreground">Blocking {typeLabel(file.mimeType)} stops everyone from uploading that type from now on. Files already stored stay.</p>
              <Button variant="glass" onClick={() => setConfirm('block')} disabled={busy || data.typeBlocked} className="mt-3 h-10 font-normal"><Ban />{data.typeBlocked ? 'This type is already blocked' : `Block ${typeLabel(file.mimeType)} uploads`}</Button>
              <p className="mt-2 text-xs text-muted-foreground">Several types at once, or unblocking, is on the <Link to="/admin/cloud/files/blocked-types" className="text-primary-glow underline-offset-4 hover:underline">Blocked types</Link> page.</p>
            </div>
          </div>
        </section>

        <AlertDialog open={confirm === 'delete'} onOpenChange={open => { if (!open) setConfirm(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove “{file.name}”?</AlertDialogTitle>
              <AlertDialogDescription>It is deleted from storage for good{file.owner ? ` and leaves ${file.owner.email}'s account` : ''}. This cannot be undone, and it is written to the admin log.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction onClick={() => void removeFile()}>Remove file</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={confirm === 'block'} onOpenChange={open => { if (!open) setConfirm(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Block {typeLabel(file.mimeType)} uploads?</AlertDialogTitle>
              <AlertDialogDescription>Nobody will be able to upload this type until you unblock it. Files already stored are not touched. You can undo this on the Blocked types page.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void blockType()}><ShieldOff />Block uploads</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>}
  </>;
}
