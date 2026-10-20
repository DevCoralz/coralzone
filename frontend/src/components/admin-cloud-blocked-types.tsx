import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, TriangleAlert, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { AdminCloudFilesTabs } from '@/components/admin-cloud-files-tabs';
import { formatBytes, formatCount } from '@/lib/format';
import { blockedListProblem, groupBlockable, groupFullyBlocked, sameTypes, toggleBlocked, typeLabel, type BlockableType } from '@/lib/storage-files';
import { adminGetBlockedTypes, adminSetBlockedTypes } from '@/lib/storage-files.functions';

// Which file types people may upload. Switch a type on to block it. Changes
// are staged until you save, then apply to new uploads within seconds.
export function AdminCloudBlockedTypes() {
  const [types, setTypes] = useState<BlockableType[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [draft, setDraft] = useState<string[]>([]);
  const [countsAvailable, setCountsAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await adminGetBlockedTypes();
    if (result.ok) {
      setTypes(result.types);
      setSaved(result.blocked);
      setDraft(result.blocked);
      setCountsAvailable(result.countsAvailable);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const dirty = !sameTypes(draft, saved);
  const problem = blockedListProblem(draft);
  const groups = useMemo(() => groupBlockable(types), [types]);
  const added = draft.filter(item => !saved.includes(item));

  async function save() {
    setConfirm(false);
    setSaving(true);
    setNotice(null);
    setError(null);
    const result = await adminSetBlockedTypes({ data: draft });
    setSaving(false);
    if (result.ok) {
      setSaved(result.blocked);
      setDraft(result.blocked);
      setNotice('Saved. New uploads follow this list within a few seconds. The change is in the admin log.');
    } else {
      setError(result.error);
    }
  }

  // Blocking more types gets a second look; unblocking does not need one.
  const requestSave = () => (added.length > 0 ? setConfirm(true) : void save());

  return <>
    <AdminCloudHeader
      title="Blocked types"
      description="Choose which kinds of file nobody can upload. Switch a type on to block it."
      actions={<Button variant="glass" onClick={() => void load()} disabled={loading || saving} className="h-10 font-normal"><RefreshCw className={loading ? 'animate-spin' : ''} />Reload</Button>}
    />
    <AdminCloudFilesTabs active="types" />

    {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/15 px-4 py-2 text-xs text-destructive">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-lg border border-glass-border px-4 py-2 text-xs">{notice}</p>}
    {!countsAvailable && !loading && <p role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-glass-border px-4 py-2 text-xs text-muted-foreground"><TriangleAlert size={14} aria-hidden="true" />The storage service could not be reached, so file counts are not shown.</p>}

    <p className="mb-5 text-sm text-muted-foreground">Blocking stops new uploads only. Files already stored stay until you remove them from the Search files page. The big switches for whole groups, like archives or video, are in the Cloud settings.</p>

    {loading && types.length === 0 ? <p className="text-sm text-muted-foreground">Loading…</p>
      : <div className="space-y-5">
        {groups.map(group => (
          <section key={group.groupId} className="dashboard-panel overflow-hidden" aria-label={group.groupLabel}>
            <div className="border-b border-glass-border p-5">
              <h3 className="font-display text-lg font-normal">{group.groupLabel}</h3>
              {groupFullyBlocked(group, draft) && <p role="status" className="mt-2 flex items-center gap-2 text-xs text-primary-glow"><TriangleAlert size={13} aria-hidden="true" />Every type here is blocked, so nobody can upload any of them.</p>}
            </div>
            <ul className="divide-y divide-glass-border">
              {group.rows.map(row => {
                const on = draft.includes(row.mimeType);
                const id = `blk-${row.mimeType.replace(/[^a-z0-9]/g, '-')}`;
                return (
                  <li key={row.mimeType} className="flex items-center justify-between gap-4 p-4 sm:px-6">
                    <div className="min-w-0">
                      <p id={id} className="text-sm">{typeLabel(row.mimeType)}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground"><span className="font-mono">{row.mimeType}</span>{countsAvailable ? ` · ${formatCount(row.files)} file${row.files === 1 ? '' : 's'}${row.files > 0 ? `, ${formatBytes(row.bytes)}` : ''}` : ''}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className={`text-xs ${on ? 'text-destructive' : 'text-muted-foreground'}`}>{on ? 'Blocked' : 'Allowed'}</span>
                      <Switch checked={on} onCheckedChange={checked => setDraft(toggleBlocked(draft, row.mimeType, checked))} aria-labelledby={id} disabled={saving} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {problem && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/15 px-4 py-2 text-xs text-destructive">{problem}</p>}
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-glass-border p-3 backdrop-blur" style={{ background: 'var(--dashboard-deep)' }}>
          <Button variant="crystal" onClick={requestSave} disabled={!dirty || Boolean(problem) || saving} className="h-10 px-5 font-normal"><Save />{saving ? 'Saving…' : 'Save changes'}</Button>
          <Button variant="glass" onClick={() => { setDraft(saved); setNotice(null); }} disabled={!dirty || saving} className="h-10 font-normal"><Undo2 />Discard</Button>
          <p className="ml-auto text-xs text-muted-foreground">{draft.length === 0 ? 'Nothing is blocked.' : `${draft.length} type${draft.length === 1 ? '' : 's'} blocked.`}</p>
        </div>
      </div>}

    <AlertDialog open={confirm} onOpenChange={setConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Block {added.length} more type{added.length === 1 ? '' : 's'}?</AlertDialogTitle>
          <AlertDialogDescription>{added.map(typeLabel).join(', ')}. Nobody will be able to upload {added.length === 1 ? 'it' : 'them'} until you unblock. Files already stored are not touched.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void save()}>Save and block</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
