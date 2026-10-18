import { useCallback, useEffect, useState } from 'react';
import { Ban, RefreshCw, ShieldCheck, Snowflake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { AdminCloudUserTabs } from '@/components/admin-cloud-user-tabs';
import { AdminUserControlsPanel } from '@/components/admin-user-cloud-controls';
import { STORAGE_PLANS } from '@/lib/storage-plans';
import { displayName } from '@/lib/storage-users';
import type { AdminUserControls } from '@/lib/storage-quota';
import { adminLookupUserControls } from '@/lib/storage-quota.functions';

// The page around the controls: loads the user, shows who it is, then hands
// the editable part to the panel. Reloading remounts the panel on purpose,
// so it always starts from what is really saved.
export function AdminCloudUserControlsPage({ userId }: { userId: string }) {
  const [data, setData] = useState<AdminUserControls | null>(null);
  const [loading, setLoading] = useState(true);
  const [round, setRound] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setData(await adminLookupUserControls({ data: userId }));
    setRound(n => n + 1);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

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
      </>}
  </>;
}
