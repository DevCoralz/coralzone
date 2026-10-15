import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { adminPayments, formatNaira } from '@/lib/admin-data';

const statuses = ['All', 'Completed', 'Pending', 'Review', 'Refunded'] as const;

export function AdminPayments() {
  const [filter, setFilter] = useState<(typeof statuses)[number]>('All');
  const [provider, setProvider] = useState('paystack');
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [min, setMin] = useState('500');
  const [max, setMax] = useState('500000');
  const [enabled, setEnabled] = useState(true);
  const [notice, setNotice] = useState('');
  const rows = adminPayments.filter(p => filter === 'All' || p.status === filter);

  const save = () => {
    const lo = Number(min); const hi = Number(max);
    if (!(lo > 0) || !(hi > 0)) { setNotice('Top-up limits must be greater than zero.'); return; }
    if (lo >= hi) { setNotice('Minimum top-up must be lower than the maximum.'); return; }
    setNotice('Payment settings updated for this preview.');
  };

  return (
    <>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="dashboard-panel p-5 sm:p-7">
          <h2 className="flex items-center gap-2 font-display text-lg font-normal"><KeyRound size={18} className="text-primary-glow" />Payment provider</h2>
          <p className="mt-1 text-xs text-muted-foreground">Keys will be stored securely on your server once it is connected — never in the browser.</p>
          <div className="mt-5 space-y-4">
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="rounded-full border-glass-border bg-transparent" aria-label="Payment provider"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="paystack">Paystack</SelectItem><SelectItem value="flutterwave">Flutterwave</SelectItem><SelectItem value="stripe">Stripe</SelectItem></SelectContent>
            </Select>
            <Input value={publicKey} onChange={e => setPublicKey(e.target.value)} placeholder="Public key" aria-label="Public key" autoComplete="off" className="rounded-full border-glass-border bg-transparent" />
            <div className="relative">
              <Input type={showSecret ? 'text' : 'password'} value={secretKey} onChange={e => setSecretKey(e.target.value)} placeholder="Secret key" aria-label="Secret key" autoComplete="off" className="rounded-full border-glass-border bg-transparent pr-11" />
              <Button variant="ghost" size="icon" type="button" onClick={() => setShowSecret(!showSecret)} aria-label={showSecret ? 'Hide secret key' : 'Show secret key'} className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full">{showSecret ? <EyeOff size={15} /> : <Eye size={15} />}</Button>
            </div>
          </div>
        </section>

        <section className="dashboard-panel p-5 sm:p-7">
          <h2 className="font-display text-lg font-normal">Top-up rules</h2>
          <p className="mt-1 text-xs text-muted-foreground">Limits applied to every wallet top-up.</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">Minimum (₦)<Input type="number" min={1} value={min} onChange={e => setMin(e.target.value)} className="mt-2 rounded-full border-glass-border bg-transparent text-foreground" /></label>
            <label className="text-xs text-muted-foreground">Maximum (₦)<Input type="number" min={1} value={max} onChange={e => setMax(e.target.value)} className="mt-2 rounded-full border-glass-border bg-transparent text-foreground" /></label>
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-glass-border pt-5">
            <div><p className="text-sm">Accept top-ups</p><p className="mt-1 text-xs text-muted-foreground">Turn off to pause all payments.</p></div>
            <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Accept top-ups" />
          </div>
        </section>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button variant="crystal" onClick={save} className="font-normal"><Save />Save payment settings</Button>
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-normal">All payments</h2>
          <div className="dashboard-segment flex flex-wrap rounded-full p-1">
            {statuses.map(s => <Button key={s} variant="ghost" aria-pressed={filter === s} onClick={() => setFilter(s)} className={`h-8 rounded-full px-3 text-xs font-normal ${filter === s ? 'dashboard-selected' : ''}`}>{s}</Button>)}
          </div>
        </div>
        <div className="dashboard-panel mt-4 divide-y divide-glass-border">
          {rows.map(p => (
            <div key={p.id} className="flex items-center gap-3 px-5 py-4">
              <div className="min-w-0"><p className="truncate text-sm">{p.name}</p><p className="truncate text-[11px] text-muted-foreground">{p.id} · {p.method} · {p.date}</p></div>
              <div className="ml-auto shrink-0 text-right"><p className="text-sm tabular-nums">{formatNaira(p.amount)}</p><p className={`text-[11px] ${p.status === 'Completed' ? 'text-online' : 'text-muted-foreground'}`}>{p.status}</p></div>
            </div>
          ))}
          {rows.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted-foreground">No payments with this status.</p>}
        </div>
      </section>
    </>
  );
}
