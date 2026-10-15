import { useState } from 'react';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Code2, ArrowDownToLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { activity, monthlyActivity } from '@/lib/dashboard-data';

export function DashboardChart() {
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [metric, setMetric] = useState<'api' | 'topup'>('api');
  const rows = range === 'week' ? activity : monthlyActivity;
  const total = rows.reduce((sum, row) => sum + row[metric], 0);
  return <section className="dashboard-panel min-w-0 p-5 sm:p-7" aria-label="Usage chart">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-display text-xl font-normal">Activity overview</h2>
      <div className="dashboard-segment flex rounded-full p-1" aria-label="Chart period">
        {(['week', 'month'] as const).map(period => <Button key={period} variant="ghost" aria-pressed={range === period} onClick={() => setRange(period)} className={`h-7 rounded-full px-3 text-xs font-normal ${range === period ? 'dashboard-selected' : ''}`}>{period === 'week' ? '7 days' : '30 days'}</Button>)}
      </div>
    </div>
    <div className="mt-5 flex gap-4">
      <Button variant="ghost" onClick={() => setMetric('api')} aria-pressed={metric === 'api'} className={`h-8 rounded-full px-0 text-xs font-normal hover:bg-transparent ${metric === 'api' ? 'text-primary-glow' : 'text-muted-foreground'}`}><Code2 />API usage</Button>
      <Button variant="ghost" onClick={() => setMetric('topup')} aria-pressed={metric === 'topup'} className={`h-8 rounded-full px-0 text-xs font-normal hover:bg-transparent ${metric === 'topup' ? 'text-chart-topup' : 'text-muted-foreground'}`}><ArrowDownToLine />Top-ups</Button>
    </div>
    <div className="mt-4 flex items-end gap-3"><span className="text-3xl font-normal tabular-nums">{metric === 'topup' ? '₦' : ''}{total.toLocaleString()}</span><span className="mb-1 text-xs text-muted-foreground">{metric === 'api' ? 'requests' : 'added'}</span><TrendingUp size={18} className="mb-1 ml-auto text-online" /></div>
    <div className="dashboard-chart mt-5 h-56 w-full sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 10, right: 10, bottom: 0, left: -22 }} accessibilityLayer>
          <defs><linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={metric === 'api' ? 'var(--primary-glow)' : 'var(--chart-topup)'} stopOpacity={0.35} /><stop offset="100%" stopColor="var(--primary-glow)" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="var(--glass-border)" strokeDasharray="3 6" />
          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} dy={8} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} tickFormatter={v => v >= 1000 ? `${v / 1000}k` : v} />
          <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="dashboard-tooltip rounded-lg px-4 py-3 text-xs"><p className="text-muted-foreground">{label}</p><p className="mt-1">{Number(payload[0]?.value ?? 0).toLocaleString()} {metric === 'api' ? 'requests' : 'NGN added'}</p></div> : null} />
          <Area type="monotone" dataKey={metric} stroke={metric === 'api' ? 'var(--primary-glow)' : 'var(--chart-topup)'} strokeWidth={3} fill="url(#activity-fill)" animationDuration={650} activeDot={{ r: 5, stroke: 'var(--foreground)', strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </section>;
}