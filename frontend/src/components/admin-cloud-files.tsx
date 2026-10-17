import { useEffect, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { formatBytes } from '@/lib/format';
import { getStorageStatus, adminListStorageFiles, adminDeleteStorageFile, type StorageFile } from '@/lib/storage.functions';

// Carried over unchanged from the old single-page /admin/cloud. Step 7 adds
// search, size/type filters, abuse flags and MIME blocking on top of this.
export function AdminCloudFiles() {
  const [connected, setConnected] = useState(false);
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const [status, result] = await Promise.all([getStorageStatus(), adminListStorageFiles()]);
    setConnected(Boolean(status.configured && status.online));
    setFiles(result.files);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function handleDelete(file: StorageFile) {
    if (!file.ownerId) {
      setError(`${file.key} has no recorded owner — delete it from the storage service directly.`);
      return;
    }
    setError(null);
    setBusyKey(file.key);
    const result = await adminDeleteStorageFile({ data: { key: file.key, ownerId: file.ownerId } });
    setBusyKey(null);
    if (!result.ok) setError(`Could not delete ${file.key}.`);
    await refresh();
  }

  return <>
    <AdminCloudHeader
      title="Files & abuse"
      description="Newest files across all users. Abuse filters and file-type blocking arrive in build step 7."
      actions={<Button variant="glass" onClick={refresh} disabled={loading} className="h-10 font-normal"><RefreshCw className={loading ? 'animate-spin' : ''} />Refresh</Button>}
    />

    {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/15 px-4 py-2 text-xs text-destructive">{error}</p>}

    <section className="dashboard-panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-glass-border p-5">
        <h3 className="font-display text-lg font-normal">All user files</h3>
        <p className="text-xs text-muted-foreground">{files.length} item{files.length === 1 ? '' : 's'}</p>
      </div>
      {loading ? <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        : files.length === 0 ? <p className="p-6 text-sm text-muted-foreground">{connected ? 'No files stored yet.' : 'Files appear here once the storage service is connected with its keys.'}</p>
        : <div className="divide-y divide-glass-border">
          {files.map(file => (
            <div key={file.key} className="admin-row flex items-center gap-4 p-4 sm:px-6">
              <div className="min-w-0"><p className="truncate text-sm">{file.name || file.key}</p><p className="mt-1 truncate text-xs text-muted-foreground">{formatBytes(file.size)}{file.updatedAt ? ` · ${file.updatedAt}` : ''}{file.ownerId ? ` · owner ${file.ownerId.slice(0, 8)}` : ' · no owner on record'}</p></div>
              <Button variant="ghost" size="icon" className="ml-auto h-9 w-9 shrink-0 rounded-lg text-destructive" aria-label={`Delete ${file.name || file.key}`} onClick={() => handleDelete(file)} disabled={busyKey === file.key}><Trash2 size={15} /></Button>
            </div>
          ))}
        </div>}
    </section>
  </>;
}
