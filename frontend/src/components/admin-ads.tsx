import { useEffect, useState } from 'react';
import { Megaphone, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';

const placements = ['Homepage', 'Dashboard', 'Movies page', 'APIs page'] as const;
type Ad = { id: number; title: string; description: string; link: string; image: string | null; placements: string[]; active: boolean };

export function AdminAds() {
  const [ads, setAds] = useState<Ad[]>([
    { id: 1, title: 'Developer plan — 20% off', description: 'Get more API requests every month for less.', link: '/apis', image: null, placements: ['Dashboard'], active: true },
  ]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [where, setWhere] = useState<string[]>(['Homepage']);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const reader = new FileReader();
    reader.onload = () => setPreview(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  }, [file]);

  const toggleWhere = (p: string) => setWhere(w => (w.includes(p) ? w.filter(x => x !== p) : [...w, p]));
  const create = () => {
    if (!title.trim()) { setError('Add a title for the ad.'); return; }
    if (where.length === 0) { setError('Choose at least one place for the ad to appear.'); return; }
    setAds(a => [{ id: Date.now(), title: title.trim(), description: description.trim(), link: link.trim(), image: preview, placements: where, active: true }, ...a]);
    setTitle(''); setDescription(''); setLink(''); setFile(null); setWhere(['Homepage']); setError('');
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.2fr]">
      <section className="dashboard-panel space-y-4 p-5 sm:p-7">
        <h2 className="font-display text-lg font-normal">New ad</h2>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-glass-border p-4 text-xs text-muted-foreground">
          {preview ? <img src={preview} alt="Ad image preview" className="h-14 w-20 rounded object-cover" /> : <Upload size={20} />}
          {file ? file.name : 'Upload ad image'}
          <input type="file" accept="image/*" className="sr-only" onChange={e => setFile(e.target.files?.[0] ?? null)} aria-label="Upload ad image" />
        </label>
        <Input value={title} maxLength={60} onChange={e => setTitle(e.target.value)} placeholder="Title" aria-label="Ad title" className="rounded-full border-glass-border bg-transparent" />
        <Textarea value={description} maxLength={140} onChange={e => setDescription(e.target.value)} placeholder="Short description" aria-label="Ad description" className="border-glass-border bg-transparent" />
        <Input value={link} onChange={e => setLink(e.target.value)} placeholder="Link (optional)" aria-label="Ad link" className="rounded-full border-glass-border bg-transparent" />
        <fieldset>
          <legend className="text-xs text-muted-foreground">Show on</legend>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {placements.map(p => (
              <label key={p} className="flex items-center gap-2 text-sm"><Checkbox checked={where.includes(p)} onCheckedChange={() => toggleWhere(p)} aria-label={p} />{p}</label>
            ))}
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-primary-glow">{error}</p>}
        <Button variant="crystal" onClick={create} className="font-normal"><Plus />Create ad</Button>
      </section>

      <section>
        <h2 className="font-display text-lg font-normal">Ads ({ads.length})</h2>
        <div className="mt-4 space-y-4">
          {ads.map(ad => (
            <article key={ad.id} className={`dashboard-panel overflow-hidden ${ad.active ? '' : 'opacity-60'}`}>
              <div className="flex gap-4 p-4">
                {ad.image ? <img src={ad.image} alt="" className="h-20 w-28 shrink-0 rounded object-cover" /> : <span className="dashboard-icon flex h-20 w-28 shrink-0 items-center justify-center rounded"><Megaphone className="text-primary-glow" /></span>}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Sponsored</p>
                  <h3 className="mt-1 truncate text-sm">{ad.title}</h3>
                  {ad.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{ad.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">{ad.placements.map(p => <span key={p} className="glass-chip px-2 py-0.5 text-[10px]">{p}</span>)}</div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-glass-border px-4 py-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={ad.active} onCheckedChange={v => setAds(a => a.map(x => x.id === ad.id ? { ...x, active: v } : x))} aria-label={`Show ${ad.title}`} />{ad.active ? 'Live' : 'Paused'}</label>
                <Button variant="ghost" size="icon" onClick={() => setAds(a => a.filter(x => x.id !== ad.id))} aria-label={`Delete ${ad.title}`} className="rounded-full"><Trash2 size={15} /></Button>
              </div>
            </article>
          ))}
          {ads.length === 0 && <p className="dashboard-panel px-5 py-10 text-center text-sm text-muted-foreground">No ads yet — create one to get started.</p>}
        </div>
      </section>
    </div>
  );
}
