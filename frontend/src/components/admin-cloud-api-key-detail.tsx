import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Ban, Gauge, RefreshCw, Save, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { formatDateTime } from '@/lib/format';
import {
  API_RATE_DEFAULTS, RATE_LIMIT_RANGE, describeLastUsed, describeRequests, describeScope, maskedKey, parseRateLimitInput, type AdminApiKeyRow,
} from '@/lib/storage-apikeys';
import { adminGetApiKey, adminRevokeApiKey, adminSetApiKeyRateLimit } from '@/lib/storage-apikeys.functions';

// One key: whose it is, how it is used, and the two things an admin can do to
// it. The key itself is never here: only its first characters.
export function AdminCloudApiKeyDetail({ keyId }: { keyId: string }) {
  const [row, setRow] = useState<AdminApiKeyRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [limitText, setLimitText] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await adminGetApiKey({ data: keyId });
    if (result.ok) {
      setRow(result.row);
      setLimitText(result.row.rateLimitPerMinute === null ? '' : String(result.row.rateLimitPerMinute));
      setError(null);
    } else {
      setError(result.error);
      setNotFound(Boolean(result.notFound));
    }
    setLoading(false);
  }, [keyId]);

  useEffect(() => { void load(); }, [load]);

  const parsed = parseRateLimitInput(limitText);
  const current = row?.rateLimitPerMinute ?? null;
  const dirty = parsed.ok && parsed.value !== current;

  async function saveLimit() {
    if (!row || !parsed.ok || !dirty) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    const result = await adminSetApiKeyRateLimit({ data: { id: row.id, value: parsed.value } });
    setBusy(false);
    if (result.ok) setNotice(parsed.value === null ? 'This key now follows its plan\'s limit.' : `Limit set to ${parsed.value.toLocaleString('en-NG')} requests a minute.`);
    else setError(result.error ?? 'Could not change the limit.');
    await load();
  }

  async function revoke() {
    if (!row) return;
    setConfirmRevoke(false);
    setBusy(true);
    setNotice(null);
    setError(null);
    const result = await adminRevokeApiKey({ data: row.id });
    setBusy(false);
    if (result.ok) setNotice('Revoked. The key stopped working straight away.');
    else setError(result.error ?? 'Could not revoke the key.');
    await load();
  }

  return <>
    <AdminCloudHeader
      title={row?.name ?? 'API key'}
      description="One key: whose it is, how it is used, and what you can do about it."
      actions={<Button variant="glass" onClick={() => void load()} disabled={loading || busy} className="h-10 font-normal"><RefreshCw className={loading ? 'animate-spin' : ''} />Refresh</Button>}
    />
    <p className="-mt-3 mb-5 text-xs"><Link to="/admin/cloud/api-keys" className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><ArrowLeft size={13} aria-hidden="true" />All keys</Link></p>

    {error && !notFound && <p role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/15 px-4 py-2 text-xs text-destructive">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-lg border border-glass-border px-4 py-2 text-xs">{notice}</p>}

    {loading && !row ? <p className="text-sm text-muted-foreground">Loading…</p>
      : notFound ? <p className="dashboard-panel p-6 text-sm text-muted-foreground">This key no longer exists.</p>
      : row && <div className="space-y-5">
        <section className="dashboard-panel grid gap-5 p-5 sm:grid-cols-2 sm:p-7">
          <div>
            <h3 className="font-display text-lg font-normal">Key</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Status</dt><dd className={row.revoked ? 'text-destructive' : ''}>{row.revoked ? `Revoked ${formatDateTime(row.revokedAt)}` : 'Active'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Starts with</dt><dd className="truncate font-mono text-xs">{maskedKey(row.prefix)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Reaches</dt><dd>{describeScope(row)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Created</dt><dd>{formatDateTime(row.createdAt)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Last used</dt><dd>{describeLastUsed(row)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Requests</dt><dd>{describeRequests(row.requests)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Key id</dt><dd className="truncate font-mono text-xs">{row.id}</dd></div>
            </dl>
          </div>
          <div>
            <h3 className="font-display text-lg font-normal">Owner</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Email</dt><dd className="truncate">{row.owner.email}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Plan</dt><dd>{row.planLabel}</dd></div>
              {row.ownerBanned && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Account</dt><dd className="text-destructive">Banned from Cloud, so this key does not work</dd></div>}
            </dl>
            <Button asChild variant="glass" className="mt-4 h-9 font-normal"><Link to="/admin/cloud/users/$userId" params={{ userId: row.owner.id }}><UserRound />Open this user</Link></Button>
          </div>
        </section>

        <section className="dashboard-panel p-5 sm:p-7" aria-labelledby="k-rate">
          <h3 id="k-rate" className="flex items-center gap-2 font-display text-lg font-normal"><Gauge size={17} className="text-primary-glow" aria-hidden="true" />Rate limit</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Right now this key may make <span className="text-foreground">{row.effectiveRateLimit.toLocaleString('en-NG')}</span> requests a minute
            {row.customRateLimit ? ', set by an admin' : `, which is the ${row.planLabel} plan's default`}.
          </p>
          <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void saveLimit(); }}>
            <label className="block min-w-[200px] flex-1 text-xs text-muted-foreground">Requests a minute
              <Input inputMode="numeric" value={limitText} onChange={event => setLimitText(event.target.value)} placeholder={`Follow plan (${API_RATE_DEFAULTS[row.plan]})`}
                disabled={busy || row.revoked} className="mt-2 rounded-full border-glass-border bg-transparent text-foreground" />
            </label>
            <Button type="submit" variant="crystal" disabled={!dirty || busy || row.revoked} className="h-10 px-5 font-normal"><Save />Save limit</Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">Whole numbers from {RATE_LIMIT_RANGE.min} to {RATE_LIMIT_RANGE.max.toLocaleString('en-NG')}. Leave it empty to follow the plan. It applies on the key's next request.</p>
          {!parsed.ok && <p role="alert" className="mt-2 text-xs text-destructive">{parsed.error}</p>}
        </section>

        <section className="dashboard-panel p-5 sm:p-7" aria-labelledby="k-revoke">
          <h3 id="k-revoke" className="font-display text-lg font-normal">Revoke</h3>
          <p className="mt-2 text-sm text-muted-foreground">Stops this key for good, at once. The owner can make a new one. Their files are not touched. The change is written to the admin log.</p>
          <Button variant="glass" onClick={() => setConfirmRevoke(true)} disabled={busy || row.revoked} className="mt-4 h-10 font-normal text-destructive"><Ban />{row.revoked ? 'Already revoked' : 'Revoke this key'}</Button>
        </section>

        <AlertDialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke “{row.name}”?</AlertDialogTitle>
              <AlertDialogDescription>Anything using this key will stop working straight away for {row.owner.email}. A revoked key cannot be turned back on.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction onClick={() => void revoke()}>Revoke key</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>}
  </>;
}
