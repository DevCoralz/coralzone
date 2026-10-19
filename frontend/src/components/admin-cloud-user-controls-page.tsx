import { useCallback, useEffect, useState } from 'react';
import { Ban, KeyRound, RefreshCw, ShieldCheck, Snowflake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { AdminCloudUserTabs } from '@/components/admin-cloud-user-tabs';
import { AdminUserControlsPanel } from '@/components/admin-user-cloud-controls';
import { STORAGE_PLANS } from '@/lib/storage-plans';
import { displayName } from '@/lib/storage-users';
import type { AdminUserControls } from '@/lib/storage-quota';
import { adminLookupUserControls } from '@/lib/storage-quota.functions';
import { adminRevokeAllUserKeys } from '@/lib/storage-apikeys.functions';

// The page around the controls: loads the user, shows who it is, then hands
// the editable part to the panel. Reloading remounts the panel on purpose,
// so it always starts from what is really saved.
export function AdminCloudUserControlsPage({ userId }: { userId: string }) {
  const [data, setData] = useState<AdminUserControls | null>(null);
  const [loading, setLoading] = useState(true);
  const [round, setRound] = useState(0);
  const [confirmKeys, setConfirmKeys] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyNotice, setKeyNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setData(await adminLookupUserControls({ data: userId }));
    setRound(n => n + 1);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  // Revokes every active key this person has. Their files are not touched.
  async function revokeAllKeys() {
    setConfirmKeys(false);
    setKeyBusy(true);
    setKeyNotice(null);
    const result = await adminRevokeAllUserKeys({ data: userId });
    setKeyBusy(false);
    if (result.ok) setKeyNotice({ kind: 'ok', text: result.revoked === 0 ? 'This user had no active keys.' : `Revoked ${result.revoked} key${result.revoked === 1 ? '' : 's'}. They stopped working straight away.` });
    else setKeyNotice({ kind: 'error', text: result.error });
  }

  const entitlement = data?.ok ? data.entitlement : undefined;
  const user = data?.ok ? data.user : undefined;

  return <>
    <AdminCloudHeader
      title={user ? `Controls for ${displayName(user)}` : 'User controls'}
      description="Change this person's plan, limits and access. Every change is written to the admin log."
      actions={<Button variant="glass" onClick={() => void load()} disabled={loading} className="h-10 font-normal"><RefreshCw className={loading ? 'animate-spin' : ''} />Reload</Button>}
    />
    <AdminCloudUserTabs userId={userId} active="controls" />

    {loading && !data ? <p className="text-sm text-muted-foreground">Loading…</p>
      : data && !data.ok ? <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/15 px-4 py-2 text-xs text-destructive">{data.error ?? 'Could not load this user.'}</p>
      : data && user && entitlement && <>
        <section className="dashboard-panel mb-6 flex flex-wrap items-center justify-between gap-3 p-5 sm:p-7" aria-label="Selected user">
          <div className="min-w-0">
            <p className="truncate text-base font-normal">{displayName(user)}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
            <span className="rounded-full border border-glass-border px-3 py-1 text-muted-foreground">{STORAGE_PLANS[entitlement.plan].label}</span>
            {entitlement.frozen && <span className="flex items-center gap-1 rounded-full border border-primary-glow/50 px-3 py-1 text-primary-glow"><Snowflake size={11} aria-hidden="true" />Frozen</span>}
            {entitlement.banned && <span className="flex items-center gap-1 rounded-full border border-destructive/50 px-3 py-1 text-destructive"><Ban size={11} aria-hidden="true" />Banned</span>}
            {!entitlement.frozen && !entitlement.banned && <span className="flex items-center gap-1 rounded-full border border-glass-border px-3 py-1 text-muted-foreground"><ShieldCheck size={11} aria-hidden="true" />Active</span>}
          </div>
        </section>
        <AdminUserControlsPanel key={round} initial={data} />

        <section className="dashboard-panel mt-6 p-5 sm:p-7" aria-labelledby="c-keys">
          <h3 id="c-keys" className="flex items-center gap-2 font-display text-lg font-normal"><KeyRound size={17} className="text-primary-glow" aria-hidden="true" />API keys</h3>
          <p className="mt-2 text-sm text-muted-foreground">Revoke every active key this person has, for example if their keys were leaked. They can make new ones, unless you ban them. Their files stay as they are.</p>
          {keyNotice && <p role={keyNotice.kind === 'error' ? 'alert' : 'status'} className={`mt-4 rounded-lg border px-4 py-2 text-xs ${keyNotice.kind === 'error' ? 'border-destructive/40 bg-destructive/15 text-destructive' : 'border-glass-border text-muted-foreground'}`}>{keyNotice.text}</p>}
          <Button variant="glass" onClick={() => setConfirmKeys(true)} disabled={keyBusy} className="mt-4 h-10 font-normal text-destructive"><Ban />{keyBusy ? 'Revoking…' : 'Revoke all keys'}</Button>
        </section>

        <AlertDialog open={confirmKeys} onOpenChange={setConfirmKeys}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke all of {user.email}'s API keys?</AlertDialogTitle>
              <AlertDialogDescription>Every active key stops working straight away and cannot be turned back on. This is written to the admin log.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void revokeAllKeys()}>Revoke all keys</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>}
  </>;
}
