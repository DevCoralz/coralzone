import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { RefreshCw, Trash2, HardDrive, Activity, ShieldCheck } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { Button } from '@/components/ui/button';
import { getStorageStatus, getStorageUsage, listStorageFiles, deleteStorageFile, type StorageFile } from '@/lib/storage.functions';

export const Route = createFileRoute('/admin/cloud')({
  head: () => ({
    meta: [
      { title: 'Cloud storage — CoralzOne Admin' },
      { name: 'description', content: 'Manage the CoralzOne Cloud storage system.' },
      { property: 'og:title', content: 'Cloud storage — CoralzOne Admin' },
      { property: 'og:description', content: 'Manage the CoralzOne Cloud storage system.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: () => <AdminShell title="Cloud storage" subtitle="Manage the CoralzOne Cloud storage system."><AdminCloud /></AdminShell>,
});

function formatBytes(bytes: number) {
  if (!bytes) return '0 GB';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function AdminCloud() {
  const [status, setStatus] = useState<{ configured: boolean; online: boolean; detail: string } | null>(null);
  const [usage, setUsage] = useState<{ configured: boolean; bytesUsed: number; bytesQuota: number; requests: number } | null>(null);
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const [statusResult, usageResult, filesResult] = await Promise.all([getStorageStatus(), getStorageUsage(), listStorageFiles()]);
    setStatus(statusResult);
    setUsage(usageResult);
    setFiles(filesResult.files);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function handleDelete(key: string) {
    setBusyKey(key);
    await deleteStorageFile({ data: key });
    setBusyKey(null);
    await refresh();
  }

  const connected = status?.configured && status.online;

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">Service keys stay on the server — users never see the storage URL.</p>
      <Button variant="glass" onClick={refresh} disabled={loading} className="h-10 font-normal"><RefreshCw className={loading ? 'animate-spin' : ''} />Refresh</Button>
    </div>

    <div className="mt-6 grid gap-3 sm:grid-cols-3 sm:gap-5">
      <div className="dashboard-panel p-5"><ShieldCheck size={18} className="text-primary-glow" /><p className="mt-4 text-xs text-muted-foreground">Service status</p><p className="mt-1 text-2xl font-normal">{connected ? 'Online' : status?.configured ? 'Unreachable' : 'Not configured'}</p></div>
      <div className="dashboard-panel p-5"><HardDrive size={18} className="text-primary-glow" /><p className="mt-4 text-xs text-muted-foreground">Storage used</p><p className="mt-1 text-2xl font-normal">{usage?.configured ? formatBytes(usage.bytesUsed) : '—'}</p></div>
      <div className="dashboard-panel p-5"><Activity size={18} className="text-primary-glow" /><p className="mt-4 text-xs text-muted-foreground">API requests</p><p className="mt-1 text-2xl font-normal">{usage?.configured ? usage.requests.toLocaleString() : '—'}</p></div>
    </div>

    {usage?.configured && usage.bytesQuota > 0 && (
      <section className="dashboard-panel mt-6 p-5">
        <h2 className="font-display text-lg font-normal">Quota</h2>
        <progress className="dashboard-progress mt-4" value={Math.min(100, (usage.bytesUsed / usage.bytesQuota) * 100)} max="100" aria-label="Storage quota" />
        <p className="mt-3 text-xs text-muted-foreground">{formatBytes(usage.bytesUsed)} of {formatBytes(usage.bytesQuota)} used</p>
      </section>
    )}

    <section className="dashboard-panel mt-6 overflow-hidden">
      <div className="flex items-center justify-between border-b border-glass-border p-5">
        <h2 className="font-display text-lg font-normal">All user files</h2>
        <p className="text-xs text-muted-foreground">{files.length} item{files.length === 1 ? '' : 's'}</p>
      </div>
      {loading ? <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        : files.length === 0 ? <p className="p-6 text-sm text-muted-foreground">{connected ? 'No files stored yet.' : 'Files appear here once the storage service is connected with its keys.'}</p>
        : <div className="divide-y divide-glass-border">
          {files.map(file => (
            <div key={file.key} className="admin-row flex items-center gap-4 p-4 sm:px-6">
              <div className="min-w-0"><p className="truncate text-sm">{file.key}</p><p className="mt-1 text-xs text-muted-foreground">{formatBytes(file.size)}{file.updatedAt ? ` · ${file.updatedAt}` : ''}</p></div>
              <Button variant="ghost" size="icon" className="ml-auto h-9 w-9 shrink-0 rounded-lg text-destructive" aria-label={`Delete ${file.key}`} onClick={() => handleDelete(file.key)} disabled={busyKey === file.key}><Trash2 size={15} /></Button>
            </div>
          ))}
        </div>}
    </section>
  </>;
}
