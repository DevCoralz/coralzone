import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Trash2, RefreshCw, Download, Pin, PinOff, MoreVertical, File as FileIcon, Image as ImageIcon, Film, Music, FileText, Check, X, Search, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getStorageStatus, getMyStorageAccess, listMyStorageFiles, deleteMyStorageFile, startMyUpload, finishMyUpload, downloadMyStorageFile, type StorageFile } from '@/lib/storage.functions';
import { runChunkedUpload, cancelUpload, UploadError, type UploadPhase } from '@/lib/chunked-upload';
import type { QuotaSummary } from '@/lib/storage-quota';
import { SELECTED_BUCKET_KEY, type MyBucket } from '@/lib/storage-buckets';
import { listMyBuckets, listMyBucketFiles } from '@/lib/storage-buckets.functions';
import { dashboardHead } from '@/lib/dashboard-head';
import { getBrandMetadata } from '@/lib/brand.functions';

export const Route = createFileRoute('/cloud/storage')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Cloud storage', 'Upload and manage your files.', '/cloud/storage', loaderData?.origin),
  component: Page,
});

const NAMES_KEY = 'cloudone-file-names';
const PINS_KEY = 'cloudone-pinned-files';
const TOAST_MS = 3500;

// The styled Select cannot hold an empty value, so "no bucket" is this word.
const ALL_BUCKETS = '__all__';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatDate(value: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function iconFor(name: string, type: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return ImageIcon;
  if (type.startsWith('video/') || ['mp4', 'mov', 'mkv', 'webm'].includes(ext)) return Film;
  if (type.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return Music;
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'xls', 'xlsx', 'csv'].includes(ext)) return FileText;
  return FileIcon;
}

type Toast = { id: number; kind: 'success' | 'error'; text: string };
type UploadItem = { id: number; name: string; percent: number; phase: UploadPhase; status: 'uploading' | 'done' | 'error'; error?: string };

// Big files cannot pass through our own server (Vercel caps request bodies at
// about 4.5 MB), so: ask the server for an upload session, send the chunks
// straight to the storage service, then ask the server to finish. The server
// checks the user's plan, ban and free space at the start and again at the end.
async function uploadFile(
  file: File,
  bucketId: string | null,
  onProgress: (percent: number, phase: UploadPhase) => void,
  signal: AbortSignal,
): Promise<{ configured: boolean; ok: boolean; id: string; error?: string }> {
  const started = await startMyUpload({ data: { name: file.name, size: file.size, bucketId } });
  if (!started.ok || !started.session) {
    return { configured: started.configured, ok: false, id: '', error: started.error };
  }
  const session = started.session;
  try {
    const stored = await runChunkedUpload({
      file,
      session,
      signal,
      onProgress: ({ percent, phase }) => onProgress(percent, phase),
      finish: () => finishMyUpload({ data: { uploadId: session.id, bucketId } }),
    });
    return { configured: true, ok: true, id: stored.id };
  } catch (error) {
    // Cancelled or failed: free the half sent file on the server straight away.
    if (!(error instanceof UploadError && error.message === 'This upload expired. Please start it again.')) void cancelUpload(session);
    return { configured: true, ok: false, id: '', error: error instanceof UploadError ? error.message : 'Upload failed' };
  }
}

function Page() {
  const [online, setOnline] = useState(false);
  // Plan, per-file limit and any block (ban/freeze/maintenance). null = not
  // loaded or could not be verified; the server enforces either way.
  const [access, setAccess] = useState<QuotaSummary | null>(null);
  const [files, setFiles] = useState<StorageFile[]>([]);
  // The user's buckets and the one currently selected ('' = all files, and
  // uploads then go in without a bucket). Choosing a bucket both filters the
  // list and sets where new uploads land.
  const [buckets, setBuckets] = useState<MyBucket[]>([]);
  const [bucketId, setBucketId] = useState<string>(() => {
    try { return typeof window === 'undefined' ? '' : window.localStorage.getItem(SELECTED_BUCKET_KEY) ?? ''; } catch { return ''; }
  });
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const uploading = uploads.some(item => item.status === 'uploading');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [pins, setPins] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  // One controller per running upload, so the cancel button can stop just that one.
  const controllers = useRef(new Map<number, AbortController>());

  useEffect(() => {
    setNames(readJson<Record<string, string>>(NAMES_KEY, {}));
    setPins(readJson<string[]>(PINS_KEY, []));
  }, []);

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts(current => [...current, { id, kind, text }]);
    setTimeout(() => setToasts(current => current.filter(item => item.id !== id)), TOAST_MS);
  }, []);

  const dismiss = (id: number) => setToasts(current => current.filter(item => item.id !== id));

  async function refresh() {
    setLoading(true);
    const [statusResult, accessResult, bucketsResult] = await Promise.all([getStorageStatus(), getMyStorageAccess(), listMyBuckets()]);
    const known = bucketsResult.ok ? bucketsResult.buckets : [];
    // A bucket that was deleted since last visit falls back to "all files".
    const activeId = bucketId && known.some(b => b.id === bucketId) ? bucketId : '';
    if (bucketsResult.ok) setBuckets(known);
    if (activeId !== bucketId) setBucketId(activeId);
    const filesResult = activeId ? await listMyBucketFiles({ data: activeId }) : await listMyStorageFiles();
    setOnline(Boolean(statusResult.configured && statusResult.online));
    setFiles(filesResult.files);
    setAccess(accessResult);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [bucketId]);

  function chooseBucket(id: string) {
    setBucketId(id);
    try { window.localStorage.setItem(SELECTED_BUCKET_KEY, id); } catch { /* storage unavailable */ }
  }

  // Closing the tab mid upload loses the file, so ask the browser to confirm.
  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploading]);

  const displayName = (file: StorageFile) => file.name || names[file.key] || file.key;

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!picked.length) return;
    if (access?.blockMessage) {
      toast('error', access.blockMessage);
      return;
    }

    const items: UploadItem[] = picked.map((file, i) => ({ id: Date.now() + i, name: file.name, percent: 0, phase: 'uploading', status: 'uploading' }));
    setUploads(current => [...current, ...items]);

    const saved = { ...names };
    for (let i = 0; i < picked.length; i++) {
      const file = picked[i];
      const itemId = items[i].id;
      // Refuse an oversized file here, before sending gigabytes the server
      // would only reject. The server enforces the same limit regardless.
      if (access && file.size > access.maxUploadBytes) {
        const message = `${file.name} is larger than your ${access.planLabel} plan allows (max ${formatBytes(access.maxUploadBytes)}).`;
        setUploads(current => current.map(u => (u.id === itemId ? { ...u, status: 'error', error: message } : u)));
        toast('error', message);
        continue;
      }
      const controller = new AbortController();
      controllers.current.set(itemId, controller);
      try {
        const result = await uploadFile(file, bucketId || null, (percent, phase) => {
          setUploads(current => current.map(u => (u.id === itemId ? { ...u, percent, phase } : u)));
        }, controller.signal);
        if (result.ok) {
          if (result.id) saved[result.id] = file.name;
          setUploads(current => current.map(u => (u.id === itemId ? { ...u, percent: 100, status: 'done' } : u)));
          toast('success', `${file.name} uploaded`);
        } else if (controller.signal.aborted) {
          setUploads(current => current.filter(u => u.id !== itemId));
          toast('success', `Cancelled ${file.name}`);
        } else {
          const message = result.error || (result.configured ? `Could not upload ${file.name}` : 'Storage is offline');
          setUploads(current => current.map(u => (u.id === itemId ? { ...u, status: 'error', error: message } : u)));
          toast('error', message);
        }
      } catch {
        setUploads(current => current.map(u => (u.id === itemId ? { ...u, status: 'error', error: 'Upload failed' } : u)));
        toast('error', `Upload failed for ${file.name}`);
      } finally {
        controllers.current.delete(itemId);
      }
    }
    setNames(saved);
    writeJson(NAMES_KEY, saved);
    // Clear finished entries after a beat so success/error states are visible
    // before they disappear, rather than vanishing the instant a file lands.
    setTimeout(() => {
      setUploads(current => current.filter(u => u.status === 'uploading'));
    }, 2500);
    await refresh();
  }

  async function handleDelete(file: StorageFile) {
    setBusyKey(file.key);
    const result = await deleteMyStorageFile({ data: file.key });
    setBusyKey(null);
    if (result.ok) {
      toast('success', `${displayName(file)} deleted`);
      const nextPins = pins.filter(key => key !== file.key);
      setPins(nextPins);
      writeJson(PINS_KEY, nextPins);
    } else {
      toast('error', `Could not delete ${displayName(file)}`);
    }
    await refresh();
  }

  async function handleDownload(file: StorageFile) {
    setBusyKey(file.key);
    const result = await downloadMyStorageFile({ data: file.key });
    setBusyKey(null);
    if (!result.ok) {
      toast('error', `Could not download ${displayName(file)}`);
      return;
    }
    const bytes = Uint8Array.from(atob(result.dataBase64), char => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: result.contentType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = displayName(file);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function togglePin(file: StorageFile) {
    const next = pins.includes(file.key) ? pins.filter(key => key !== file.key) : [...pins, file.key];
    setPins(next);
    writeJson(PINS_KEY, next);
    toast('success', pins.includes(file.key) ? 'Unpinned' : 'Pinned');
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return files
      .filter(file => !needle || displayName(file).toLowerCase().includes(needle))
      .sort((a, b) => Number(pins.includes(b.key)) - Number(pins.includes(a.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, query, pins, names]);

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-3xl font-normal sm:text-4xl">Storage</h1>
      <div className="flex gap-2">
        <Button variant="glass" onClick={refresh} disabled={loading} className="h-11 w-11 p-0" aria-label="Refresh"><RefreshCw className={loading ? 'animate-spin' : ''} /></Button>
        <Button variant="crystal" onClick={() => fileInput.current?.click()} disabled={uploading || Boolean(access?.blocked) || Boolean(buckets.find(b => b.id === bucketId)?.frozen)} className="h-11 px-5 font-normal"><Upload />{uploading ? 'Uploading' : 'Upload'}</Button>
        <input ref={fileInput} type="file" multiple className="hidden" onChange={handleUpload} aria-label="Choose files to upload" />
      </div>
    </div>

    {buckets.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
      <span id="bucket-select-label" className="text-muted-foreground">Bucket</span>
      <Select value={bucketId || ALL_BUCKETS} onValueChange={value => chooseBucket(value === ALL_BUCKETS ? '' : value)} disabled={uploading}>
        <SelectTrigger id="bucket-select" aria-labelledby="bucket-select-label" className="h-10 w-auto min-w-[220px] max-w-full rounded-full border-glass-border bg-transparent px-4 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_BUCKETS}>All files (no bucket for new uploads)</SelectItem>
          {buckets.map(b => <SelectItem key={b.id} value={b.id}>{b.name}{b.frozen ? ' (frozen)' : ''}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>}

    {access?.blockMessage && <div role="status" className="dashboard-panel mt-5 flex items-start gap-3 px-4 py-3 text-sm">
      <ShieldAlert size={16} className="mt-0.5 shrink-0 text-primary-glow" aria-hidden="true" />
      <p className="min-w-0 flex-1">{access.blockMessage}</p>
    </div>}

    {access && !access.blockMessage && <p className="mt-3 text-xs text-muted-foreground">{access.planLabel} plan · up to {formatBytes(access.maxUploadBytes)} per file</p>}

    {uploads.length > 0 && <div className="mt-5 space-y-2">
      {uploads.map(item => (
        <div key={item.id} className="dashboard-panel flex items-center gap-3 px-4 py-3">
          <span className="dashboard-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
            {item.status === 'error' ? <X size={14} /> : item.status === 'done' ? <Check size={14} /> : <Upload size={14} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{item.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{item.status === 'error' ? 'Failed' : item.status === 'uploading' && item.phase === 'processing' ? 'Finishing' : `${item.percent}%`}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-glass-border">
              <div
                className={`h-full rounded-full transition-all ${item.status === 'error' ? 'bg-destructive' : 'bg-primary-glow'}`}
                style={{ width: `${item.status === 'error' ? 100 : item.percent}%` }}
              />
            </div>
            {item.status === 'error' && item.error && <p className="mt-1 text-xs text-destructive">{item.error}</p>}
          </div>
          {item.status === 'uploading' && item.phase === 'uploading' && (
            <button type="button" onClick={() => controllers.current.get(item.id)?.abort()} aria-label={`Cancel ${item.name}`} className="shrink-0 opacity-70 hover:opacity-100"><X size={14} /></button>
          )}
        </div>
      ))}
    </div>}

    {files.length > 4 && <div className="relative mt-5">
      <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search files" aria-label="Search files"
        className="h-11 w-full rounded-lg border border-glass-border bg-transparent pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary-glow" />
    </div>}

    <section className="dashboard-panel mt-5 overflow-hidden">
      {loading && files.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Loading</p>
        : visible.length === 0 ? <div className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="dashboard-icon flex h-12 w-12 items-center justify-center rounded-lg"><Upload size={20} /></span>
          <p className="text-sm text-muted-foreground">{!online ? 'Storage is offline.' : query ? 'No match.' : 'No files yet.'}</p>
          {online && !query && <Button variant="glass" onClick={() => fileInput.current?.click()} className="h-10 px-5 font-normal">Upload a file</Button>}
        </div>
        : <ul className="divide-y divide-glass-border">
          {visible.map(file => {
            const name = displayName(file);
            const Icon = iconFor(name, file.contentType);
            const pinned = pins.includes(file.key);
            const inBucket = !bucketId ? buckets.find(b => b.id === file.bucketId)?.name : undefined;
            const meta = [formatBytes(file.size), formatDate(file.updatedAt), inBucket ? `in ${inBucket}` : ''].filter(Boolean).join(' · ');
            return (
              <li key={file.key} className="flex items-center gap-4 p-4 sm:px-6">
                <span className="dashboard-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"><Icon size={17} /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm"><span className="truncate">{name}</span>{pinned && <Pin size={12} className="shrink-0 text-primary-glow" aria-label="Pinned" />}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{meta}</p>
                </div>
                {busyKey === file.key ? <RefreshCw size={16} className="mr-2 shrink-0 animate-spin text-muted-foreground" /> : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-lg" aria-label={`Actions for ${name}`}><MoreVertical size={16} /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onSelect={() => handleDownload(file)}><Download size={15} />Download</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => togglePin(file)}>{pinned ? <PinOff size={15} /> : <Pin size={15} />}{pinned ? 'Unpin' : 'Pin'}</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => handleDelete(file)} className="text-destructive focus:text-destructive"><Trash2 size={15} />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ul>}
    </section>

    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map(item => (
        <div key={item.id} role="status"
          className={`pointer-events-auto flex max-w-sm items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur-xl ${item.kind === 'success' ? 'border-online/40 bg-online/15 text-online' : 'border-destructive/40 bg-destructive/15 text-destructive'}`}>
          {item.kind === 'success' ? <Check size={16} className="shrink-0" /> : <X size={16} className="shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{item.text}</span>
          <button type="button" onClick={() => dismiss(item.id)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100"><X size={14} /></button>
        </div>
      ))}
    </div>
  </>;
}
