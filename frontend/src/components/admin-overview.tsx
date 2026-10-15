import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, CreditCard, Code2, Activity, ArrowUpRight, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { adminUsers, adminPayments, revenueRanges, revenueChartRows, formatNaira } from '@/lib/admin-data';

type Range = keyof typeof revenueRanges;

const stats = [
  { label: 'Total users', value: adminUsers.length.toLocaleString(), sub: '+3 this week', icon: Users, to: '/admin/users' },
  { label: 'Payments', value: adminPayments.length.toLocaleString(), sub: '2 need review', icon: CreditCard, to: '/admin/payments' },
  { label: 'API requests', value: '19.2k', sub: 'This month', icon: Code2, to: '/admin/users' },
  { label: 'Active now', value: '4', sub: 'Last 5 minutes', icon: Activity, to: '/admin/users' },
] as const;

export function AdminOverview() {
  const [range, setRange] = useState<Range>('7d');
  const selected = revenueRanges[range];
  const rows = revenueChartRows(range);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
        {stats.map(stat => (
          <Link key={stat.label} to={stat.to} className="dashboard-panel dashboard-stat block p-4 sm:p-5">
            <div className="flex items-center justify-between"><stat.icon size={18} className="text-primary-glow" /><ArrowUpRight size={14} className="text-muted-foreground" /></div>
            <p className="mt-4 text-xs text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-2xl font-normal tabular-nums sm:text-3xl">{stat.value}</p>
            <p className="mt-2 text-[10px] text-muted-foreground sm:text-xs">{stat.sub}</p>
          </Link>
        ))}
      </div>

      <section className="dashboard-panel mt-6 p-5 sm:p-7" aria-label="Revenue chart">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-normal">Revenue</h2>
          <Select value={range} onValueChange={v => setRange(v as Range)}>
            <SelectTrigger className="w-44 rounded-full border-glass-border bg-transparent text-xs" aria-label="Revenue period"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(revenueRanges) as Range[]).map(key => <SelectItem key={key} value={key}>{revenueRanges[key].label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-5 flex items-end gap-3">
          <span className="text-3xl font-normal tabular-nums sm:text-4xl">{formatNaira(selected.amount)}</span>
          <span className="mb-1 flex items-center gap-1 text-xs text-online"><TrendingUp size={14} />{selected.change}</span>
          <span className="mb-1 text-xs text-muted-foreground">{selected.label}</span>
        </div>
        <div className="dashboard-chart mt-5 h-64 w-full sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 10, right: 10, bottom: 0, left: -8 }} accessibilityLayer>
              <defs>
                <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary-glow)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--primary-glow)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--glass-border)" strokeDasharray="3 6" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} tickFormatter={v => v >= 1000000 ? `₦${(v / 1000000).toFixed(1)}m` : v >= 1000 ? `₦${Math.round(v / 1000)}k` : `₦${v}`} />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                <div className="dashboard-tooltip rounded-lg px-4 py-3 text-xs"><p className="text-muted-foreground">{label}</p><p className="mt-1">{formatNaira(Number(payload[0]?.value ?? 0))}</p></div>
              ) : null} />
              <Area type="monotone" dataKey="revenue" stroke="var(--primary-glow)" strokeWidth={3} fill="url(#revenue-fill)" animationDuration={650} activeDot={{ r: 5, stroke: 'var(--foreground)', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <section className="dashboard-panel p-5 sm:p-7">
          <div className="flex items-center justify-between"><h2 className="font-display text-lg font-normal">Latest users</h2><Button asChild variant="ghost" className="rounded-full text-xs font-normal"><Link to="/admin/users">View all<ArrowUpRight /></Link></Button></div>
          <div className="mt-3 divide-y divide-glass-border">
            {adminUsers.slice(0, 4).map(user => (
              <Link key={user.id} to="/admin/user/$userId" params={{ userId: user.id }} className="flex items-center gap-3 py-3">
                <span className="dashboard-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm">{user.name[0]}</span>
                <div className="min-w-0"><p className="truncate text-sm">{user.name}</p><p className="truncate text-[10px] text-muted-foreground">{user.email}</p></div>
                <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] ${user.status === 'Active' ? 'text-online' : user.status === 'Restricted' ? 'text-primary-glow' : 'text-muted-foreground'}`}>{user.status}</span>
              </Link>
            ))}
          </div>
        </section>
        <section className="dashboard-panel p-5 sm:p-7">
          <div className="flex items-center justify-between"><h2 className="font-display text-lg font-normal">Latest payments</h2><Button asChild variant="ghost" className="rounded-full text-xs font-normal"><Link to="/admin/payments">View all<ArrowUpRight /></Link></Button></div>
          <div className="mt-3 divide-y divide-glass-border">
            {adminPayments.slice(0, 4).map(payment => (
              <div key={payment.id} className="flex items-center gap-3 py-3">
                <span className="dashboard-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-full"><CreditCard size={15} className="text-primary-glow" /></span>
                <div className="min-w-0"><p className="truncate text-sm">{payment.name}</p><p className="truncate text-[10px] text-muted-foreground">{payment.id} · {payment.date}</p></div>
                <span className="ml-auto shrink-0 text-sm tabular-nums">{formatNaira(payment.amount)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
