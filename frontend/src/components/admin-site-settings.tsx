import { useEffect, useState } from 'react';
import { Save, ImageIcon, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import bg from '@/assets/crystal-bg.jpg';

const swatches = [
  { name: 'Royal crystal', value: 'oklch(0.58 0.2 262)' },
  { name: 'Ocean', value: 'oklch(0.6 0.15 220)' },
  { name: 'Amethyst', value: 'oklch(0.55 0.2 300)' },
  { name: 'Emerald', value: 'oklch(0.6 0.15 160)' },
];

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

export function AdminSiteSettings() {
  const [name, setName] = useState('CoralzOne');
  const [description, setDescription] = useState('Movies, REST APIs, foreign numbers and more in one ecosystem.');
  const [intro, setIntro] = useState('Watch movies, plug into REST APIs, grab foreign numbers — all in one crystal-clear place.');
  const [currency, setCurrency] = useState('NGN');
  const [color, setColor] = useState(swatches[0]!.value);
  const [favicon, setFavicon] = useState<File | null>(null);
  const [background, setBackground] = useState<File | null>(null);
  const [notice, setNotice] = useState('');
  const faviconUrl = useObjectUrl(favicon);
  const backgroundUrl = useObjectUrl(background);

  const save = () => {
    if (!name.trim()) { setNotice('Site name cannot be empty.'); return; }
    setNotice('Site settings updated for this preview.');
  };

  return (
    <>
      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section className="dashboard-panel space-y-4 p-5 sm:p-7">
            <h2 className="font-display text-lg font-normal">Identity</h2>
            <label className="block text-xs text-muted-foreground">Site name<Input value={name} maxLength={40} onChange={e => setName(e.target.value)} className="mt-2 rounded-full border-glass-border bg-transparent text-foreground" /></label>
            <label className="block text-xs text-muted-foreground">Search & sharing description<Textarea value={description} maxLength={160} onChange={e => setDescription(e.target.value)} className="mt-2 border-glass-border bg-transparent text-foreground" /><span className="mt-1 block text-right">{description.length}/160</span></label>
            <label className="block text-xs text-muted-foreground">Homepage intro<Textarea value={intro} maxLength={240} onChange={e => setIntro(e.target.value)} className="mt-2 border-glass-border bg-transparent text-foreground" /></label>
            <label className="block text-xs text-muted-foreground">Currency
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="mt-2 rounded-full border-glass-border bg-transparent text-foreground" aria-label="Currency"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="NGN">Nigerian Naira (₦)</SelectItem><SelectItem value="USD">US Dollar ($)</SelectItem><SelectItem value="GHS">Ghanaian Cedi (₵)</SelectItem><SelectItem value="KES">Kenyan Shilling (KSh)</SelectItem></SelectContent>
              </Select>
            </label>
          </section>

          <section className="dashboard-panel p-5 sm:p-7">
            <h2 className="font-display text-lg font-normal">Brand colour</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {swatches.map(s => (
                <button key={s.name} type="button" onClick={() => setColor(s.value)} aria-pressed={color === s.value} className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs ${color === s.value ? 'border-primary-glow' : 'border-glass-border'}`}>
                  <span className="h-4 w-4 rounded-full" style={{ background: s.value }} />{s.name}
                </button>
              ))}
            </div>
          </section>

          <section className="dashboard-panel grid gap-5 p-5 sm:grid-cols-2 sm:p-7">
            <div>
              <h2 className="font-display text-lg font-normal">Favicon</h2>
              <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-glass-border p-4 text-xs text-muted-foreground">
                {faviconUrl ? <img src={faviconUrl} alt="New favicon preview" className="h-10 w-10 rounded" /> : <Upload size={20} />}
                {favicon ? favicon.name : 'Upload PNG or ICO'}
                <input type="file" accept="image/png,image/x-icon,image/svg+xml" className="sr-only" onChange={e => setFavicon(e.target.files?.[0] ?? null)} aria-label="Upload favicon" />
              </label>
            </div>
            <div>
              <h2 className="font-display text-lg font-normal">Background image</h2>
              <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-glass-border p-4 text-xs text-muted-foreground">
                <ImageIcon size={20} />{background ? background.name : 'Upload JPG or PNG'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => setBackground(e.target.files?.[0] ?? null)} aria-label="Upload background image" />
              </label>
            </div>
          </section>
        </div>

        <section className="lg:sticky lg:top-6">
          <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">Live preview</p>
          <div className="relative overflow-hidden rounded-lg border border-glass-border">
            <img src={backgroundUrl ?? bg} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="relative flex min-h-80 items-center justify-center p-6">
              <div className="glass-card w-full p-6 text-center">
                <h3 className="font-display text-3xl font-normal">{name || 'Site name'}</h3>
                <p className="mt-3 text-xs text-muted-foreground">{intro}</p>
                <span className="mt-5 inline-block rounded-full px-6 py-2 text-xs" style={{ background: color }}>Get Started</span>
              </div>
            </div>
          </div>
          <div className="dashboard-panel mt-4 p-4">
            <p className="text-[11px] text-muted-foreground">Search result preview</p>
            <p className="mt-2 text-sm text-primary-glow">{name || 'Site name'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
        </section>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button variant="crystal" onClick={save} className="font-normal"><Save />Save site settings</Button>
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      </div>
    </>
  );
}
