import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react';
import { HardDrive, Upload, Trash2, RefreshCw, PlugZap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getStorageStatus, listStorageFiles, getStorageUsage, deleteStorageFile, uploadStorageFile, type StorageFile } from '@/lib/storage.functions';
import { dashboardHead } from '@/lib/dashboard-head';
import { getBrandMetadata } from '@/lib/brand.functions';

export const Route = createFileRoute('/cloud/storage')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Cloud storage', 'Browse, upload and manage the files stored in CoralzOne Cloud.', '/cloud/storage', loaderData?.origin),
  component: Page,
});

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function Page() {
  const [status, setStatus] = useState<{ configured: boolean; online: boolean; detail: string } | null>(null);
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    const [statusResult, filesResult] = await Promise.all([getStorageStatus(), listStorageFiles()]);
    setStatus(statusResult);
    setFiles(filesResult.files);
    setConfigured(filesResult.configured);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setNotice(null);
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(new Error('Could not read the file'));
      reader.readAsDataURL(file);
    });
    const result = await uploadStorageFile({ data: { name: file.name, contentType: file.type || 'application/octet-stream', dataBase64 } });
    setUploading(false);
    setNotice(result.ok ? `${file.name} uploaded.` : result.configured ? 'The storage service rejected the upload.' : 'Connect your storage service to enable uploads.');
    await refresh();
  }

  async function handleDelete(key: string) {
    setBusyKey(key);
    const result = await deleteStorageFile({ data: key });
    setBusyKey(null);
    setNotice(result.ok ? `${key} deleted.` : result.configured ? 'The storage service rejected the delete.' : 'Connect your storage service first.');
    await refresh();
  }

  const connected = status?.configured && status.online;

  return <>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs text-muted-foreground">Files live here. The storage address stays private.</p>
        <h1 className="mt-2 font-display text-3xl font-normal sm:text-4xl">Storage</h1>
      </div>
      <div className="flex gap-3">
        <Button variant="glass" onClick={refresh} disabled={loading} className="h-11 px-4 font-normal"><RefreshCw className={loading ? 'animate-spin' : ''} />Refresh</Button>
        <Button variant="crystal" onClick={() => fileInput.current?.click()} disabled={uploading} className="h-11 px-5 font-normal"><Upload />{uploading ? 'Uploading…' : 'Upload file'}</Button>
        <input ref={fileInput} type="file" className="hidden" onChange={handleUpload} aria-label="Choose a file to upload" />
      </div>
    </div>

    {notice && <p className="dashboard-panel mt-5 p-4 text-sm" role="status">{notice}</p>}

    {!connected && <section className="dashboard-panel mt-6 flex items-start gap-4 p-6">
      <PlugZap size={22} className="mt-0.5 shrink-0 text-primary-glow" />
      <div>
        <h2 className="font-display text-xl font-normal">Storage service not connected{status?.configured ? ' or unreachable' : ''}</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">Once the storage service keys are set by the owner, this page lists live files and supports uploads and deletes. Until then you see an empty workspace — the storage address is never shown to users.</p>
      </div>
    </section>}

    <section className="dashboard-panel mt-6 overflow-hidden">
      <div className="flex items-center justify-between border-b border-glass-border p-5">
        <h2 className="font-display text-xl font-normal">Files</h2>
        <p className="text-xs text-muted-foreground">{files.length} item{files.length === 1 ? '' : 's'}</p>
      </div>
      {loading ? <p className="p-6 text-sm text-muted-foreground">Loading files…</p>
        : files.length === 0 ? <p className="p-6 text-sm text-muted-foreground">{connected ? 'No files yet — upload your first file.' : 'Files appear here once the storage service is connected.'}</p>
        : <div className="divide-y divide-glass-border">
          {files.map(file => (
            <div key={file.key} className="flex items-center gap-4 p-4 sm:px-6">
              <span className="dashboard-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"><HardDrive size={17} /></span>
              <div className="min-w-0"><p className="truncate text-sm">{file.key}</p><p className="mt-1 text-xs text-muted-foreground">{formatBytes(file.size)}{file.updatedAt ? ` · ${file.updatedAt}` : ''}</p></div>
              <Button variant="ghost" size="icon" className="ml-auto h-9 w-9 shrink-0 rounded-lg text-destructive" aria-label={`Delete ${file.key}`} onClick={() => handleDelete(file.key)} disabled={busyKey === file.key}>
                {busyKey === file.key ? <RefreshCw size={15} className="animate-spin" /> : <Trash2 size={15} />}
              </Button>
            </div>
          ))}
        </div>}
    </section>
  </>;
}
