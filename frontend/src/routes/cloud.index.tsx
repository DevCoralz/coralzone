import { useEffect, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { HardDrive, KeyRound, Tags, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getStorageStatus, getMyStorageUsage } from '@/lib/storage.functions';
import { dashboardHead } from '@/lib/dashboard-head';
import { getBrandMetadata } from '@/lib/brand.functions';

export const Route = createFileRoute('/cloud/')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Cloud overview', 'Your plan, storage and API activity.', '/cloud', loaderData?.origin),
  component: Page,
});

function formatBytes(bytes: number) {
  if (!bytes) return '0 GB';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function Page() {
  const [status, setStatus] = useState<{ configured: boolean; online: boolean; detail: string } | null>(null);
  const [usage, setUsage] = useState<{ configured: boolean; bytesUsed: number; bytesQuota: number; requests: number } | null>(null);

  useEffect(() => {
    getStorageStatus().then(setStatus);
    getMyStorageUsage().then(setUsage);
  }, []);

  const connected = status?.configured && status.online;
  const percent = usage && usage.bytesQuota > 0 ? Math.min(100, (usage.bytesUsed / usage.bytesQuota) * 100) : 0;

  return <>
    <section className="balance-hero flex flex-col justify-between gap-6 py-6 sm:flex-row sm:items-end sm:py-8" aria-label="Plan">
      <div>
        <p className="text-sm text-muted-foreground">Your plan</p>
        <p className="mt-2 text-4xl font-normal sm:text-5xl">Free</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="crystal" className="h-11 px-6 font-normal"><Link to="/cloud/pricing">Upgrade<Tags /></Link></Button>
        <Button asChild variant="glass" className="h-11 px-5 font-normal"><Link to="/cloud/storage"><HardDrive />Open storage</Link></Button>
      </div>
    </section>

    <div className="mt-6 grid gap-3 sm:grid-cols-3 sm:gap-5">
      <div className="dashboard-panel dashboard-stat block p-3 sm:p-5"><HardDrive size={18} className="text-primary-glow" /><p className="mt-4 text-[10px] text-muted-foreground sm:text-xs">Storage used</p><p className="mt-1 text-2xl font-normal sm:text-3xl">{usage?.configured ? formatBytes(usage.bytesUsed) : '0 GB'}</p><p className="mt-2 text-[9px] text-muted-foreground sm:text-xs">{usage?.configured && usage.bytesQuota ? `of ${formatBytes(usage.bytesQuota)}` : 'Free plan'}</p></div>
      <div className="dashboard-panel dashboard-stat block p-3 sm:p-5"><Activity size={18} className="text-primary-glow" /><p className="mt-4 text-[10px] text-muted-foreground sm:text-xs">Requests</p><p className="mt-1 text-2xl font-normal sm:text-3xl">{usage?.configured ? usage.requests.toLocaleString() : '0'}</p><p className="mt-2 text-[9px] text-muted-foreground sm:text-xs">This month</p></div>
      <div className="dashboard-panel dashboard-stat block p-3 sm:p-5"><KeyRound size={18} className="text-primary-glow" /><p className="mt-4 text-[10px] text-muted-foreground sm:text-xs">Status</p><p className="mt-1 text-lg font-normal sm:text-xl">{connected ? 'Online' : 'Offline'}</p><p className="mt-2 text-[9px] text-muted-foreground sm:text-xs">{connected ? 'All good' : 'Not reachable'}</p></div>
    </div>

    <section className="dashboard-panel mt-6 p-5 sm:p-7">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-normal">Storage</h2>
        <p className="text-xs text-muted-foreground">{usage?.configured ? `${formatBytes(usage.bytesUsed)}${usage.bytesQuota ? ` of ${formatBytes(usage.bytesQuota)}` : ''}` : 'No data yet'}</p>
      </div>
      <progress className="dashboard-progress mt-5" value={percent} max="100" aria-label="Storage used" />
    </section>
  </>;
}
