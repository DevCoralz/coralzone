import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react';
import { KeyRound, Copy, Trash2, Plus, Check, RefreshCw, X, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { dashboardHead } from '@/lib/dashboard-head';
import { getBrandMetadata } from '@/lib/brand.functions';
import { formatDateTime } from '@/lib/format';
import {
  KEY_NAME_MAX, canCreateKey, describeKeyLimit, describeLastUsed, describeRequests, describeScope, maskedKey, validateKeyName, type ApiKey,
} from '@/lib/storage-apikeys';
import type { MyBucket } from '@/lib/storage-buckets';
import type { StoragePlanId } from '@/lib/storage-plans';
import { createMyApiKey, listMyApiKeys, revokeMyApiKey } from '@/lib/storage-apikeys.functions';
import { listMyBuckets } from '@/lib/storage-buckets.functions';

export const Route = createFileRoute('/cloud/api-keys')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Cloud API keys', 'Create and manage your API keys.', '/cloud/api-keys', loaderData?.origin),
  component: Page,
});

type Notice = { kind: 'success' | 'error'; text: string } | null;

// Older builds kept fake keys in this browser. They never worked on the server,
// so they are cleared once and nothing is read from here any more.
const OLD_LOCAL_KEYS = 'coralzone-cloud-api-keys';

function Page() {
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [plan, setPlan] = useState<StoragePlanId>('starter');
  const [planLabel, setPlanLabel] = useState('Starter');
  const [activeKeys, setActiveKeys] = useState(0);
  const [rateLimit, setRateLimit] = useState(60);
  const [banned, setBanned] = useState(false);
  const [buckets, setBuckets] = useState<MyBucket[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState('');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  // The full key, held in memory only until the person dismisses it.
  const [fresh, setFresh] = useState<{ name: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [toRevoke, setToRevoke] = useState<ApiKey | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const [list, bucketList] = await Promise.all([listMyApiKeys(), listMyBuckets()]);
    if (list.ok) {
      setKeys(list.keys);
      setPlan(list.plan);
      setPlanLabel(list.planLabel);
      setActiveKeys(list.activeKeys);
      setRateLimit(list.rateLimitPerMinute);
      setBanned(list.banned);
      setLoadError(null);
    } else {
      setLoadError(list.error);
    }
    setBuckets(bucketList.ok ? bucketList.buckets.filter(b => !b.frozen) : []);
    setLoading(false);
  }

  useEffect(() => {
    try { window.localStorage.removeItem(OLD_LOCAL_KEYS); } catch { /* storage unavailable */ }
    void refresh();
  }, []);

  const nameCheck = validateKeyName(name);
  const createCheck = canCreateKey(plan, activeKeys);
  const canSubmit = nameCheck.ok && createCheck.ok && !creating && !banned;

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setCreating(true);
    setNotice(null);
    const result = await createMyApiKey({ data: { name, bucketId: scope || null } });
    setCreating(false);
    if (result.ok) {
      setFresh({ name: result.key.name, secret: result.secret });
      setCopied(false);
      setName('');
      setScope('');
      await refresh();
    } else {
      setNotice({ kind: 'error', text: result.error });
    }
  }

  async function copy() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable: the key is still on screen to select */ }
  }

  async function confirmRevoke() {
    const key = toRevoke;
    if (!key) return;
    setToRevoke(null);
    setBusyId(key.id);
    const result = await revokeMyApiKey({ data: key.id });
    setBusyId(null);
    if (result.ok) { setNotice({ kind: 'success', text: `Revoked “${key.name}”. It stops working straight away.` }); await refresh(); }
    else setNotice({ kind: 'error', text: result.error ?? 'Could not revoke the key.' });
  }

  // Active keys first, revoked ones tucked underneath.
  const ordered = [...keys.filter(k => !k.revoked), ...keys.filter(k => k.revoked)];

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-normal sm:text-4xl">API keys</h1>
        <p className="mt-1 text-xs text-muted-foreground">{planLabel} plan · {describeKeyLimit(plan)} · {rateLimit.toLocaleString('en-NG')} requests a minute per key.</p>
      </div>
      <Button variant="glass" onClick={() => void refresh()} disabled={loading} className="h-11 w-11 p-0" aria-label="Refresh"><RefreshCw className={loading ? 'animate-spin' : ''} /></Button>
    </div>
    <p className="mt-3 max-w-xl text-sm text-muted-foreground">Send your key in the <code className="text-primary-glow">X-API-Key</code> header. Keep it on your server, never in a web page or an app. If one leaks, revoke it and make a new one. <Link to="/cloud/docs" className="text-primary-glow underline-offset-4 hover:underline">Read the docs</Link>.</p>

    {notice && <div role="status" className={`mt-5 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${notice.kind === 'success' ? 'border-online/40 bg-online/15 text-online' : 'border-destructive/40 bg-destructive/15 text-destructive'}`}>
      <span className="min-w-0 flex-1">{notice.text}</span>
      <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100"><X size={14} /></button>
    </div>}

    {fresh && <section className="dashboard-panel mt-5 border-primary-glow/50 p-5 sm:p-6" aria-label="Your new key" aria-live="polite">
      <p className="flex items-center gap-2 text-sm"><TriangleAlert size={16} className="text-primary-glow" aria-hidden="true" />Copy “{fresh.name}” now. You will not be able to see it again.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 select-all break-all rounded-lg border border-glass-border bg-black/30 px-3 py-2 font-mono text-xs">{fresh.secret}</code>
        <Button variant="crystal" onClick={() => void copy()} className="h-10 px-4 font-normal">{copied ? <><Check />Copied</> : <><Copy />Copy</>}</Button>
        <Button variant="glass" onClick={() => { setFresh(null); setCopied(false); }} className="h-10 px-4 font-normal">I have saved it</Button>
      </div>
    </section>}

    <form onSubmit={handleCreate} className="dashboard-panel mt-5 p-4 sm:p-5">
      <label htmlFor="key-name" className="text-sm">New key</label>
      <div className="mt-2 flex flex-wrap gap-2">
        <Input id="key-name" value={name} onChange={event => setName(event.target.value)} maxLength={KEY_NAME_MAX + 20}
          placeholder="Name, e.g. Mobile app" autoComplete="off" disabled={!createCheck.ok || banned}
          className="min-w-[180px] flex-1 rounded-full border-glass-border bg-transparent" aria-describedby="key-hint" />
        <select value={scope} onChange={event => setScope(event.target.value)} aria-label="What this key can reach" disabled={!createCheck.ok || banned}
          className="h-10 rounded-full border border-glass-border bg-transparent px-4 text-sm text-foreground">
          <option value="" className="bg-background">All buckets</option>
          {buckets.map(bucket => <option key={bucket.id} value={bucket.id} className="bg-background">Only {bucket.name}</option>)}
        </select>
        <Button type="submit" variant="crystal" disabled={!canSubmit} className="h-10 px-5 font-normal"><Plus />{creating ? 'Creating' : 'Create'}</Button>
      </div>
      <p id="key-hint" className="mt-2 text-xs text-muted-foreground">
        {banned ? 'Your Cloud storage access is suspended, so new keys cannot be made.' : !createCheck.ok ? createCheck.reason : name && !nameCheck.ok ? nameCheck.error : 'A key limited to one bucket can only see that bucket. If you delete the bucket, the key is revoked.'}
      </p>
      {!createCheck.ok && <Button asChild variant="glass" className="mt-3 h-9 font-normal"><Link to="/cloud/pricing">See plans</Link></Button>}
    </form>

    <section className="dashboard-panel mt-5 overflow-hidden">
      <div className="border-b border-glass-border p-5"><h2 className="font-display text-xl font-normal">Your keys</h2></div>
      {loadError ? <p role="alert" className="p-6 text-sm text-destructive">{loadError}</p>
        : loading && keys.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Loading</p>
        : keys.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No keys yet.</p>
        : <ul className="divide-y divide-glass-border">
          {ordered.map(entry => (
            <li key={entry.id} className={`flex flex-wrap items-center gap-3 p-4 sm:px-6 ${entry.revoked ? 'opacity-60' : ''}`}>
              <span className="dashboard-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"><KeyRound size={17} /></span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm"><span className="truncate">{entry.name}</span>
                  {entry.revoked && <span className="shrink-0 rounded-full border border-glass-border px-2 py-0.5 text-[10px] text-muted-foreground">Revoked</span>}
                </p>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{maskedKey(entry.prefix)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {describeScope(entry)} · created {formatDateTime(entry.createdAt)} · {entry.revoked ? `revoked ${formatDateTime(entry.revokedAt)}` : `${describeLastUsed(entry)} · ${describeRequests(entry.requests)}`}
                </p>
              </div>
              {!entry.revoked && (busyId === entry.id
                ? <RefreshCw size={16} className="mr-2 shrink-0 animate-spin text-muted-foreground" />
                : <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-lg text-destructive" aria-label={`Revoke ${entry.name}`} onClick={() => setToRevoke(entry)}><Trash2 size={15} /></Button>)}
            </li>
          ))}
        </ul>}
    </section>

    <AlertDialog open={toRevoke !== null} onOpenChange={open => { if (!open) setToRevoke(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke “{toRevoke?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>Anything using this key stops working straight away. A revoked key cannot be turned back on; you would make a new one.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction onClick={() => void confirmRevoke()}>Revoke key</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
