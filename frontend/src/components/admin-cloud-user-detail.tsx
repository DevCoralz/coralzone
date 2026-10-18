import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Ban, Boxes, FileText, HardDrive, KeyRound, RefreshCw, SlidersHorizontal, Snowflake, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { AdminCloudUserTabs } from '@/components/admin-cloud-user-tabs';
import { formatBytes, formatCount, formatDateTime } from '@/lib/format';
import { formatPercent } from '@/lib/storage-buckets';
import { bucketLabel, displayName } from '@/lib/storage-users';
import { adminGetCloudUserOverview, type AdminUserOverviewResult } from '@/lib/storage-users.functions';

type Ready = Extract<AdminUserOverviewResult, { ok: true }>;

const UNKNOWN = 'Unknown';

// One person: what they hold, where it sits, what changed lately. Read only.
// Changing anything happens on the Controls page, so this one stays calm.
export function AdminCloudUserDetail({ userId }: { userId: string }) {
  const [data, setData] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await adminGetCloudUserOverview({ data: userId });
    if (result.ok) { setData(result); setError(null); setNotFound(false); }
    else { setError(result.error); setNotFound(Boolean(result.notFound)); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const overview = data?.overview;
  const percent = overview?.ratio == null ? 0 : Math.min(100, Math.round(overview.ratio * 100));

  return <>
    <AdminCloudHeader
      title={overview ? displayName(overview.user) : 'User'}
      description="One person: their space, buckets and files, and what has been changed for them."
      actions={<Button variant="glass" onClick={() => void load()} disabled={loading} className="h-10 font-normal"><RefreshCw className={loading ? 'animate-spin' : ''} />Refresh</Button>}
    />
    <AdminCloudUserTabs userId={userId} active="overview" />

    {error && !notFound && <p role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/15 px-4 py-2 text-xs text-destructive">{error}</p>}

    {loading && !overview ? <p className="text-sm text-muted-foreground">Loading…</p>
      : notFound ? <p className="dashboard-panel p-6 text-sm text-muted-foreground">This user no longer exists.</p>
      : overview && data && <div className="space-y-5">
        {!data.storageOnline && <p role="status" className="flex items-center gap-2 rounded-lg border border-glass-border px-4 py-2 text-xs text-muted-foreground">
          <TriangleAlert size={14} aria-hidden="true" />The storage service could not be reached, so sizes, counts and files are not shown.
        </p>}

        <section className="dashboard-panel flex flex-wrap items-start justify-between gap-4 p-5 sm:p-7" aria-label="Who this is">
          <div className="min-w-0">
            <p className="truncate text-base font-normal">{displayName(overview.user)}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{overview.user.email}</p>
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{overview.user.id}</p>
            <p className="mt-2 text-xs text-muted-foreground">Joined {formatDateTime(overview.user.createdAt)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest">
            <span className="rounded-full border border-glass-border px-3 py-1 text-muted-foreground">{overview.planLabel}</span>
            {overview.frozen && <span className="flex items-center gap-1 rounded-full border border-primary-glow/50 px-3 py-1 text-primary-glow"><Snowflake size={11} aria-hidden="true" />Frozen</span>}
            {overview.banned && <span className="flex items-center gap-1 rounded-full border border-destructive/50 px-3 py-1 text-destructive"><Ban size={11} aria-hidden="true" />Banned</span>}
          </div>
          {overview.banned && overview.banReason && <p className="w-full text-xs text-muted-foreground">Ban reason (only admins see this): {overview.banReason}</p>}
          <div className="w-full">
            <Button asChild variant="glass" className="h-9 font-normal"><Link to="/admin/cloud/users/$userId/controls" params={{ userId }}><SlidersHorizontal />Plan, limits, freeze and ban</Link></Button>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
          <div className="dashboard-panel p-5">
            <HardDrive size={18} className="text-primary-glow" aria-hidden="true" />
            <p className="mt-4 text-xs text-muted-foreground">Space used</p>
            <p className={`mt-1 text-2xl font-normal ${overview.nearlyFull ? 'text-destructive' : ''}`}>{overview.ownerBytes === null ? UNKNOWN : formatBytes(overview.ownerBytes)}</p>
            <p className="mt-1 text-xs text-muted-foreground">of {formatBytes(overview.bytesQuota)}{overview.ratio === null ? '' : ` (${formatPercent(overview.ratio)})`}</p>
            <progress className="dashboard-progress mt-3" value={percent} max="100" aria-label="Share of the allowance in use" />
          </div>
          <div className="dashboard-panel p-5">
            <FileText size={18} className="text-primary-glow" aria-hidden="true" />
            <p className="mt-4 text-xs text-muted-foreground">Files</p>
            <p className="mt-1 text-2xl font-normal">{overview.ownerFiles === null ? UNKNOWN : formatCount(overview.ownerFiles)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Largest upload {formatBytes(overview.maxUploadBytes)}</p>
          </div>
          <div className="dashboard-panel p-5">
            <Boxes size={18} className="text-primary-glow" aria-hidden="true" />
            <p className="mt-4 text-xs text-muted-foreground">Buckets</p>
            <p className="mt-1 text-2xl font-normal">{overview.buckets.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">{overview.bucketLimit === null ? 'Plan allows unlimited' : `Plan allows ${overview.bucketLimit}`}</p>
          </div>
          <div className="dashboard-panel p-5">
            <KeyRound size={18} className="text-primary-glow" aria-hidden="true" />
            <p className="mt-4 text-xs text-muted-foreground">API keys</p>
            <p className="mt-1 text-2xl font-normal">{overview.apiKeys.total === 0 ? 'None yet' : `${formatCount(overview.apiKeys.active)} active`}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {overview.apiKeys.total === 0 ? 'Request counts start with API keys' : `${formatCount(overview.apiKeys.requests)} request${overview.apiKeys.requests === 1 ? '' : 's'} in total`}
            </p>
          </div>
        </div>

        <section className="dashboard-panel overflow-hidden" aria-label="Buckets">
          <div className="flex items-center justify-between border-b border-glass-border p-5">
            <h3 className="font-display text-lg font-normal">Buckets</h3>
            <p className="text-xs text-muted-foreground">{overview.buckets.length} of {overview.bucketLimit === null ? 'unlimited' : overview.bucketLimit}</p>
          </div>
          {overview.buckets.length === 0 && !overview.outside ? <p className="p-6 text-sm text-muted-foreground">This user has no buckets yet.</p>
            : <ul className="divide-y divide-glass-border">
              {overview.buckets.map(bucket => (
                <li key={bucket.id}>
                  <Link to="/admin/cloud/buckets/$bucketId" params={{ bucketId: bucket.id }} className="admin-row flex items-center gap-4 p-4 sm:px-6">
                    <span className="dashboard-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">{bucket.frozen ? <Snowflake size={16} /> : <Boxes size={16} />}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm"><span className="truncate">{bucket.name}</span>
                        {bucket.frozen && <span className="shrink-0 rounded-full border border-glass-border px-2 py-0.5 text-[10px] text-muted-foreground">Frozen</span>}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {bucket.usage ? `${formatBytes(bucket.usage.bytes)} · ${formatCount(bucket.usage.files)} file${bucket.usage.files === 1 ? '' : 's'}` : 'Usage unavailable'} · created {formatDateTime(bucket.createdAt)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
              {overview.outside && <li className="flex items-center gap-4 p-4 sm:px-6">
                <span className="dashboard-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"><FileText size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">Not in any bucket</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatBytes(overview.outside.bytes)}{overview.outside.files === null ? '' : ` · ${formatCount(overview.outside.files)} file${overview.outside.files === 1 ? '' : 's'}`}. Usually uploads from before buckets existed.
                  </p>
                </div>
              </li>}
            </ul>}
        </section>

        <section className="dashboard-panel overflow-hidden" aria-label="Newest files">
          <div className="flex items-center justify-between border-b border-glass-border p-5">
            <h3 className="font-display text-lg font-normal">Newest files</h3>
            <p className="text-xs text-muted-foreground">
              {data.storageOnline ? `Showing ${data.files.length}${overview.ownerFiles !== null && overview.ownerFiles > data.files.length ? ` of ${formatCount(overview.ownerFiles)}` : ''}` : 'Storage service unreachable'}
            </p>
          </div>
          {data.files.length === 0 ? <p className="p-6 text-sm text-muted-foreground">{data.storageOnline ? 'This user has no files.' : 'Files cannot be listed right now.'}</p>
            : <ul className="divide-y divide-glass-border">
              {data.files.map(file => (
                <li key={file.key} className="admin-row p-4 sm:px-6">
                  <p className="truncate text-sm">{file.name || file.key}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {formatBytes(file.size)} · {bucketLabel(file.bucketId, overview.buckets)}{file.contentType ? ` · ${file.contentType}` : ''}{file.updatedAt ? ` · ${formatDateTime(file.updatedAt)}` : ''}
                  </p>
                </li>
              ))}
            </ul>}
          <p className="border-t border-glass-border p-4 text-xs text-muted-foreground">Removing single files and blocking file types arrives with Files and abuse.</p>
        </section>

        <section className="dashboard-panel overflow-hidden" aria-label="Recent admin actions">
          <div className="border-b border-glass-border p-5">
            <h3 className="font-display text-lg font-normal">Recent admin actions</h3>
            <p className="mt-1 text-xs text-muted-foreground">The last changes an admin made to this person's storage controls.</p>
          </div>
          {overview.recentActions.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Nothing has been changed for this user.</p>
            : <ul className="divide-y divide-glass-border">
              {overview.recentActions.map(action => (
                <li key={action.id} className="p-4 sm:px-6">
                  <p className="text-sm">{action.summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(action.at)}{action.by ? ` · by ${action.by}` : ''}</p>
                </li>
              ))}
            </ul>}
        </section>
      </div>}
  </>;
}
