import { useEffect, useState } from 'react';
import { Activity, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, createFileRoute } from '@tanstack/react-router';
import { getStorageUsage } from '@/lib/storage.functions';
import { dashboardHead } from '@/lib/dashboard-head';
import { getBrandMetadata } from '@/lib/brand.functions';

export const Route = createFileRoute('/cloud/usage')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Cloud usage', 'Track CoralzOne Cloud requests, bandwidth and storage over time.', '/cloud/usage', loaderData?.origin),
  component: Page,
});

const days = [
  { label: 'Mon', requests: 420 }, { label: 'Tue', requests: 512 }, { label: 'Wed', requests: 388 },
  { label: 'Thu', requests: 640 }, { label: 'Fri', requests: 705 }, { label: 'Sat', requests: 298 }, { label: 'Sun', requests: 240 },
];

function Page() {
  const [usage, setUsage] = useState<{ configured: boolean; bytesUsed: number; bytesQuota: number; requests: number } | null>(null);
  useEffect(() => { getStorageUsage().then(setUsage); }, []);

  const peak = Math.max(...days.map(d => d.requests), 1);
  const live = usage?.configured;

  return <>
    <p className="text-xs text-muted-foreground">Your Cloud activity, day by day.</p>
    <h1 className="mt-2 font-display text-3xl font-normal sm:text-4xl">Usage</h1>

    <div className="mt-8 grid gap-3 sm:grid-cols-3 sm:gap-5">
      <div className="dashboard-panel dashboard-stat block p-3 sm:p-5"><Activity size={18} className="text-primary-glow" /><p className="mt-4 text-[10px] text-muted-foreground sm:text-xs">API requests</p><p className="mt-1 text-2xl font-normal sm:text-3xl">{live ? usage!.requests.toLocaleString() : '3,203'}</p><p className="mt-2 text-[9px] text-muted-foreground sm:text-xs">{live ? 'Live this month' : 'Sample · this month'}</p></div>
      <div className="dashboard-panel dashboard-stat block p-3 sm:p-5"><p className="mt-1 text-[10px] text-muted-foreground sm:text-xs">Bandwidth</p><p className="mt-1 text-2xl font-normal sm:text-3xl">18.4 GB</p><p className="mt-2 text-[9px] text-muted-foreground sm:text-xs">Sample · this month</p></div>
      <div className="dashboard-panel dashboard-stat block p-3 sm:p-5"><p className="mt-1 text-[10px] text-muted-foreground sm:text-xs">Uptime</p><p className="mt-1 text-2xl font-normal sm:text-3xl">99.98%</p><p className="mt-2 text-[9px] text-muted-foreground sm:text-xs">Last 30 days</p></div>
    </div>

    <section className="dashboard-panel mt-6 p-5 sm:p-7">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-normal">Requests this week</h2>
        <Button asChild variant="ghost" className="rounded-lg text-xs font-normal"><Link to="/cloud/pricing">Upgrade<ArrowUpRight /></Link></Button>
      </div>
      <div className="mt-8 flex h-48 items-end gap-3" role="img" aria-label="Bar chart of requests per day this week">
        {days.map(day => (
          <div key={day.label} className="flex flex-1 flex-col items-center gap-2">
            <div className="w-full rounded-t-sm bg-primary-glow/70 transition-all" style={{ height: `${(day.requests / peak) * 100}%` }} title={`${day.requests} requests`} />
            <span className="text-[10px] text-muted-foreground">{day.label}</span>
          </div>
        ))}
      </div>
      {!live && <p className="mt-6 border-t border-glass-border pt-4 text-xs text-muted-foreground">Live counters appear here automatically once your storage service is connected.</p>}
    </section>
  </>;
}
