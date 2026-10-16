import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react';
import { KeyRound, Copy, Trash2, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dashboardHead } from '@/lib/dashboard-head';
import { getBrandMetadata } from '@/lib/brand.functions';

export const Route = createFileRoute('/cloud/api-keys')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Cloud API keys', 'Create and manage your API keys.', '/cloud/api-keys', loaderData?.origin),
  component: Page,
});

interface ApiKey { id: string; label: string; key: string; created: string; }

const STORAGE_KEY = 'coralzone-cloud-api-keys';

function loadKeys(): ApiKey[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ApiKey[]) : [];
  } catch {
    return [];
  }
}

function Page() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [label, setLabel] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);

  useEffect(() => { setKeys(loadKeys()); }, []);

  function persist(next: ApiKey[]) {
    setKeys(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  }

  function createKey() {
    const name = label.trim() || 'My app';
    const secret = `cz_live_${[...crypto.getRandomValues(new Uint8Array(20))].map(b => b.toString(16).padStart(2, '0')).join('')}`;
    persist([...keys, { id: crypto.randomUUID(), label: name, key: secret, created: new Date().toISOString().slice(0, 10) }]);
    setLabel('');
  }

  function revoke(id: string) {
    persist(keys.filter(k => k.id !== id));
  }

  async function copy(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* clipboard unavailable */ }
  }

  const masked = (key: string) => `${key.slice(0, 12)}${'•'.repeat(18)}`;

  return <>
    <h1 className="font-display text-3xl font-normal sm:text-4xl">API keys</h1>
    <p className="mt-3 max-w-xl text-sm text-muted-foreground">Send your key in the <code className="text-primary-glow">X-API-Key</code> header. If one leaks, delete it and make a new one.</p>

    <section className="dashboard-panel mt-8 p-6">
      <h2 className="font-display text-xl font-normal">New key</h2>
      <div className="mt-4 flex flex-wrap gap-3">
        <input
          value={label}
          onChange={event => setLabel(event.target.value)}
          placeholder="Name, e.g. Mobile app"
          aria-label="API key name"
          className="h-11 flex-1 rounded-lg border border-glass-border bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary-glow"
        />
        <Button variant="crystal" onClick={createKey} className="h-11 px-5 font-normal"><Plus />Create</Button>
      </div>
    </section>

    <section className="dashboard-panel mt-6 overflow-hidden">
      <div className="border-b border-glass-border p-5"><h2 className="font-display text-xl font-normal">Your keys</h2></div>
      {keys.length === 0
        ? <p className="p-6 text-sm text-muted-foreground">No keys yet.</p>
        : <div className="divide-y divide-glass-border">
          {keys.map(entry => (
            <div key={entry.id} className="flex flex-wrap items-center gap-3 p-4 sm:px-6">
              <span className="dashboard-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"><KeyRound size={17} /></span>
              <div className="min-w-0">
                <p className="text-sm">{entry.label}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{revealed === entry.id ? entry.key : masked(entry.key)} · {entry.created}</p>
              </div>
              <div className="ml-auto flex shrink-0 gap-2">
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" aria-label={revealed === entry.id ? 'Hide key' : 'Reveal key'} onClick={() => setRevealed(revealed === entry.id ? null : entry.id)}>{revealed === entry.id ? '••' : '👁'}</Button>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" aria-label="Copy key" onClick={() => copy(entry.key)}>{copied === entry.key ? <Check size={15} className="text-online" /> : <Copy size={15} />}</Button>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-destructive" aria-label={`Delete ${entry.label}`} onClick={() => revoke(entry.id)}><Trash2 size={15} /></Button>
              </div>
            </div>
          ))}
        </div>}
    </section>

  </>;
}
