import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Trash2, RefreshCw, Download, Pin, PinOff, MoreVertical, File as FileIcon, Image as ImageIcon, Film, Music, FileText, Check, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getStorageStatus, listStorageFiles, deleteStorageFile, uploadStorageFile, downloadStorageFile, type StorageFile } from '@/lib/storage.functions';
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

function Page() {
  const [online, setOnline] = useState(false);
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [pins, setPins] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

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
    const [statusResult, filesResult] = await Promise.all([getStorageStatus(), listStorageFiles()]);
    setOnline(Boolean(statusResult.configured && statusResult.online));
    setFiles(filesResult.files);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  const displayName = (file: StorageFile) => file.name || names[file.key] || file.key;

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!picked.length) return;
    setUploading(true);
    const saved = { ...names };
    for (const file of picked) {
      let dataBase64 = '';
      try {
        dataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
          reader.onerror = () => reject(new Error('read failed'));
          reader.readAsDataURL(file);
        });
      } catch {
        toast('error', `Could not read ${file.name}`);
        continue;
      }
      try {
        const result = await uploadStorageFile({ data: { name: file.name, contentType: file.type || 'application/octet-stream', dataBase64 } });
        if (result.ok) {
          if (result.id) saved[result.id] = file.name;
          toast('success', `${file.name} uploaded`);
        } else {
          toast('error', result.configured ? `Could not upload ${file.name}` : 'Storage is offline');
        }
      } catch {
        toast('error', `Upload failed for ${file.name}`);
      }
    }
    setNames(saved);
    writeJson(NAMES_KEY, saved);
    setUploading(false);
    await refresh();
  }

  async function handleDelete(file: StorageFile) {
    setBusyKey(file.key);
    const result = await deleteStorageFile({ data: file.key });
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
    const result = await downloadStorageFile({ data: file.key });
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
        <Button variant="crystal" onClick={() => fileInput.current?.click()} disabled={uploading} className="h-11 px-5 font-normal"><Upload />{uploading ? 'Uploading' : 'Upload'}</Button>
        <input ref={fileInput} type="file" multiple className="hidden" onChange={handleUpload} aria-label="Choose files to upload" />
      </div>
    </div>

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
            const meta = [formatBytes(file.size), formatDate(file.updatedAt)].filter(Boolean).join(' · ');
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
