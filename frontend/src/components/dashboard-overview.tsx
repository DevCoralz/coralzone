import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight, Plus, Eye, EyeOff, Code2, Tv, Droplets, ArrowDownLeft, ChevronRight, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DashboardChart } from '@/components/dashboard-chart';
import { transactions } from '@/lib/dashboard-data';

export function DashboardOverview() {
  const [visible, setVisible] = useState(true);
  return <>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs text-muted-foreground">A little of everything. All in one place.</p><h1 className="mt-2 font-display text-3xl font-normal sm:text-4xl">Your overview</h1></div>
      <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-online" />All systems operational</span>
    </div>
    <section className="balance-hero mt-8 flex flex-col justify-between gap-6 py-7 sm:flex-row sm:items-end sm:py-9" aria-label="Wallet balance">
      <div><div className="flex items-center gap-3 text-sm text-muted-foreground"><Wallet size={16} />Available balance<Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" aria-label={visible ? 'Hide balance' : 'Show balance'} onClick={() => setVisible(!visible)}>{visible ? <Eye size={15} /> : <EyeOff size={15} />}</Button></div>
        <p className="mt-3 text-5xl font-normal tabular-nums sm:text-6xl">{visible ? <><span className="mr-2 text-3xl text-primary-glow">₦</span>24,520<span className="text-2xl text-muted-foreground">.00</span></> : '••••••'}</p>
        <p className="mt-4 text-xs text-muted-foreground">NGN wallet <span className="mx-2">·</span> Sample balance & activity</p>
      </div>
      <div className="flex gap-3"><Button asChild variant="crystal" className="h-11 px-6 font-normal"><Link to="/wallet"><Plus />Top up</Link></Button><Button asChild variant="glass" className="h-11 px-5 font-normal"><Link to="/wallet">Transactions<ArrowUpRight /></Link></Button></div>
    </section>
    <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-5">
      {[{ icon: Code2, label: 'API requests', value: '3,240', sub: 'This month', to: '/apis' }, { icon: Tv, label: 'Movies', value: '0', sub: 'Coming soon', to: '/movies' }, { icon: Droplets, label: 'Active drops', value: '0', sub: 'Coming soon', to: '/drops' }].map(item => <Link key={item.label} to={item.to as '/apis' | '/movies' | '/drops'} className="dashboard-panel dashboard-stat block p-3 sm:p-5"><div className="flex items-center justify-between"><item.icon size={18} className="text-primary-glow" /><ArrowUpRight size={14} className="text-muted-foreground" /></div><p className="mt-4 text-[10px] text-muted-foreground sm:text-xs">{item.label}</p><p className="mt-1 text-2xl font-normal sm:text-3xl">{item.value}</p><p className="mt-2 text-[9px] text-muted-foreground sm:text-xs">{item.sub}</p></Link>)}
    </div>
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.65fr_1fr]">
      <DashboardChart />
      <section className="dashboard-panel p-5 sm:p-7"><h2 className="font-display text-xl font-normal">Usage summary</h2><p className="mt-2 text-xs text-muted-foreground">Your monthly snapshot</p>
        <div className="mt-6 space-y-5">{[{ label: 'API allowance', value: '3,240 / 10,000', percent: 32.4, type: 'api' }, { label: 'Wallet top-ups', value: '₦15,000', percent: 75, type: 'topup' }].map(row => <div key={row.label}><div className="mb-2 flex justify-between gap-2 text-xs"><span className="text-muted-foreground">{row.label}</span><span>{row.value}</span></div><progress className={`dashboard-progress ${row.type === 'topup' ? 'topup-progress' : ''}`} value={row.percent} max="100" aria-label={row.label} /></div>)}</div>
        <div className="mt-7 flex items-center gap-3 border-t border-glass-border pt-5"><span className="dashboard-icon flex h-9 w-9 items-center justify-center rounded-full"><Code2 size={16} /></span><div><p className="text-xs">Developer plan</p><p className="mt-1 text-[10px] text-muted-foreground">Sample account</p></div><Button asChild variant="ghost" size="icon" className="ml-auto rounded-full" aria-label="View APIs"><Link to="/apis"><ChevronRight /></Link></Button></div>
      </section>
    </div>
    <section className="mt-9"><div className="flex items-center justify-between"><h2 className="font-display text-xl font-normal">Recent activity</h2><Button asChild variant="ghost" className="rounded-full text-xs font-normal"><Link to="/wallet">View all<ArrowUpRight /></Link></Button></div>
      <div className="mt-3 divide-y divide-glass-border">{transactions.map((transaction, i) => <div className="flex items-center gap-3 py-4" key={i}><span className={`dashboard-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${transaction.kind === 'topup' ? 'text-online' : 'text-primary-glow'}`}>{transaction.kind === 'topup' ? <ArrowDownLeft size={18} /> : <Code2 size={18} />}</span><div className="min-w-0"><p className="text-sm">{transaction.title}</p><p className="mt-1 text-[10px] text-muted-foreground sm:text-xs">{transaction.detail}</p></div><span className={`ml-auto shrink-0 text-sm tabular-nums ${transaction.kind === 'topup' ? 'text-online' : ''}`}>₦{transaction.amount}</span></div>)}</div>
    </section>
  </>;
}