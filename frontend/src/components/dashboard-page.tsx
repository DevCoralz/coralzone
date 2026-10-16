import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Code2, Droplets, Wallet, ArrowDownLeft, ArrowUpRight, Bell, ShieldCheck, LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { transactions } from '@/lib/dashboard-data';

export function DashboardPage({ page }: { page: 'apis' | 'drops' | 'wallet' | 'account' | 'settings' | 'support' }) {
  const [notifications, setNotifications] = useState(true);
  const [updates, setUpdates] = useState(false);
  const [filter, setFilter] = useState<'all' | 'topup' | 'api'>('all');
  const title = { apis: 'APIs', drops: 'Drops', wallet: 'Your wallet', account: 'My account', settings: 'Settings', support: 'Help & support' }[page];
  return <>
    <Link to="/dashboard" className="mb-5 inline-flex items-center gap-2 text-xs text-muted-foreground">Overview <span>/</span> {title}</Link>
    <h1 className="font-display text-4xl font-normal">{title}</h1>
    {['apis', 'drops'].includes(page) && <section className="mt-10 border-y border-glass-border py-12">
      {page === 'apis' ? <Code2 className="h-12 w-12 text-primary-glow" /> : <Droplets className="h-12 w-12 text-primary-glow" />}
      <p className="mt-7 text-xs uppercase tracking-widest text-primary-glow">Coming soon</p>
      <h2 className="mt-3 font-display text-2xl font-normal">{page === 'apis' ? 'Built for your next idea' : 'Something new is on the way'}</h2>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">{page === 'apis' ? 'The REST API catalog is on its way. Your keys and request history will live here.' : 'Drops is taking shape. More details will be announced here.'}</p>
      <Button asChild variant="glass" className="mt-7 h-11 px-5 font-normal"><Link to="/dashboard">Back to overview<ArrowUpRight /></Link></Button>
    </section>}
    {page === 'wallet' && <>
      <section className="balance-hero mt-6 py-8"><p className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet size={17} />Available balance</p><p className="mt-4 text-5xl font-normal">₦24,520<span className="text-2xl text-muted-foreground">.00</span></p><p className="mt-4 text-xs text-muted-foreground">Sample balance · NGN</p><Button variant="crystal" disabled className="mt-6 h-11 px-5 font-normal">Top-ups coming soon</Button></section>
      <section className="mt-8"><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="font-display text-2xl font-normal">Transactions</h2><div className="dashboard-segment flex rounded-full p-1">{(['all', 'topup', 'api'] as const).map(kind => <Button variant="ghost" className={`h-8 rounded-full px-3 text-xs font-normal ${filter === kind ? 'dashboard-selected' : ''}`} key={kind} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>{kind === 'all' ? 'All' : kind === 'topup' ? 'Top-ups' : 'API usage'}</Button>)}</div></div>
        <div className="mt-5 divide-y divide-glass-border">{transactions.filter(t => filter === 'all' || t.kind === filter).map((t, i) => <div key={i} className="flex items-center gap-4 py-5"><ArrowDownLeft size={20} className="text-primary-glow" /><div><p className="text-sm">{t.title}</p><p className="mt-1 text-xs text-muted-foreground">{t.detail}</p></div><p className="ml-auto shrink-0 text-sm">₦{t.amount}</p></div>)}</div>
      </section>
    </>}
    {page === 'account' && <section className="mt-10 max-w-2xl"><div className="flex items-center gap-4"><span className="dashboard-icon flex h-16 w-16 items-center justify-center rounded-full font-display text-2xl">C</span><div><h2 className="text-xl font-normal">Preview account</h2><p className="mt-1 text-xs text-muted-foreground">Developer plan · Sample account</p></div></div><div className="mt-8 flex items-center gap-3 border-y border-glass-border py-6"><ShieldCheck size={22} className="text-primary-glow" /><p className="text-sm text-muted-foreground">Account sign-in and personal details are not connected yet.</p></div><Button asChild variant="glass" className="mt-6 font-normal"><Link to="/auth">Go to sign in<ArrowUpRight /></Link></Button></section>}
    {page === 'settings' && <section className="mt-10 max-w-2xl"><p className="text-xs text-muted-foreground">Preview preferences · Not saved to an account</p>{[{ label: 'Activity notifications', detail: 'Top-ups and API activity', value: notifications, change: setNotifications }, { label: 'Product updates', detail: 'New movies, APIs and Drops', value: updates, change: setUpdates }].map(setting => <div className="flex items-center justify-between gap-5 border-b border-glass-border py-7" key={setting.label}><div><p className="flex items-center gap-2 text-sm"><Bell size={16} />{setting.label}</p><p className="mt-2 text-xs text-muted-foreground">{setting.detail}</p></div><Switch checked={setting.value} onCheckedChange={setting.change} aria-label={setting.label} /></div>)}</section>}
    {page === 'support' && <section className="mt-10 max-w-2xl"><LifeBuoy className="h-12 w-12 text-primary-glow" /><h2 className="mt-6 font-display text-2xl font-normal">How can we help?</h2><div className="mt-7 divide-y divide-glass-border">{[{ q: 'Can I add money to my wallet?', a: 'Payments are not available yet. Balances and transactions currently show sample activity.' }, { q: 'Where can I find my API keys?', a: 'Open the Cloud area — API keys live there alongside storage, usage and docs.' }, { q: 'How does CoralzOne Cloud work?', a: 'Cloud holds your storage, pricing, API keys and usage in one place. Pick a plan on the Pricing page to get started.' }].map(faq => <details className="py-5" key={faq.q}><summary className="cursor-pointer text-sm">{faq.q}</summary><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{faq.a}</p></details>)}</div></section>}
  </>;
}