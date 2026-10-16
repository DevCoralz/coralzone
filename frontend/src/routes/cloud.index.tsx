import { useEffect, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { HardDrive, KeyRound, Tags, Activity, BookOpen, ArrowUpRight, Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getStorageStatus, getStorageUsage } from '@/lib/storage.functions';
import { dashboardHead } from '@/lib/dashboard-head';
import { getBrandMetadata } from '@/lib/brand.functions';

export const Route = createFileRoute('/cloud/')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Cloud overview', 'Your CoralzOne Cloud at a glance — plan, storage and API activity.', '/cloud', loaderData?.origin),
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
    getStorageUsage().then(setUsage);
  }, []);

  const connected = status?.configured && status.online;
  const percent = usage && usage.bytesQuota > 0 ? Math.min(100, (usage.bytesUsed / usage.bytesQuota) * 100) : 0;

  return <>
    <p className="text-xs text-muted-foreground">Everything CoralzOne Cloud, in one place.</p>
    <h1 className="mt-2 font-display text-3xl font-normal sm:text-4xl">Cloud overview</h1>

    <section className="balance-hero mt-8 flex flex-col justify-between gap-6 py-7 sm:flex-row sm:items-end sm:py-9" aria-label="Cloud plan">
      <div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Cloud size={16} />Current plan</p>
        <p className="mt-3 text-4xl font-normal sm:text-5xl">Free<span className="ml-3 text-xl text-muted-foreground">plan</span></p>
        <p className="mt-4 text-xs text-muted-foreground">Storage, API keys and usage — upgrade any time.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="crystal" className="h-11 px-6 font-normal"><Link to="/cloud/pricing">See plans<Tags /></Link></Button>
        <Button asChild variant="glass" className="h-11 px-5 font-normal"><Link to="/cloud/storage"><HardDrive />Manage storage</Link></Button>
      </div>
    </section>

    <div className="mt-6 grid gap-3 sm:grid-cols-3 sm:gap-5">
      <div className="dashboard-panel dashboard-stat block p-3 sm:p-5"><HardDrive size={18} className="text-primary-glow" /><p className="mt-4 text-[10px] text-muted-foreground sm:text-xs">Storage used</p><p className="mt-1 text-2xl font-normal sm:text-3xl">{usage?.configured ? formatBytes(usage.bytesUsed) : '0 GB'}</p><p className="mt-2 text-[9px] text-muted-foreground sm:text-xs">{usage?.configured && usage.bytesQuota ? `of ${formatBytes(usage.bytesQuota)}` : 'Free allowance'}</p></div>
      <div className="dashboard-panel dashboard-stat block p-3 sm:p-5"><Activity size={18} className="text-primary-glow" /><p className="mt-4 text-[10px] text-muted-foreground sm:text-xs">API requests</p><p className="mt-1 text-2xl font-normal sm:text-3xl">{usage?.configured ? usage.requests.toLocaleString() : '0'}</p><p className="mt-2 text-[9px] text-muted-foreground sm:text-xs">This month</p></div>
      <div className="dashboard-panel dashboard-stat block p-3 sm:p-5"><KeyRound size={18} className="text-primary-glow" /><p className="mt-4 text-[10px] text-muted-foreground sm:text-xs">Service status</p><p className="mt-1 flex items-center gap-2 text-lg font-normal sm:text-xl">{connected ? 'Online' : 'Not connected'}</p><p className="mt-2 text-[9px] text-muted-foreground sm:text-xs">{connected ? 'Storage service reachable' : 'Connect from the admin area'}</p></div>
    </div>

    <section className="dashboard-panel mt-6 p-5 sm:p-7">
      <h2 className="font-display text-xl font-normal">Storage allowance</h2>
      <p className="mt-2 text-xs text-muted-foreground">How much of your plan you have used</p>
      <progress className="dashboard-progress mt-6" value={percent} max="100" aria-label="Storage allowance" />
      <p className="mt-3 text-xs text-muted-foreground">{usage?.configured ? `${formatBytes(usage.bytesUsed)} used${usage.bytesQuota ? ` of ${formatBytes(usage.bytesQuota)}` : ''}` : 'Live numbers appear once your storage service is connected.'}</p>
    </section>

    <section className="mt-8">
      <h2 className="font-display text-xl font-normal">Inside Cloud</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[{ to: '/cloud/pricing' as const, icon: Tags, title: 'Pricing', text: 'Compare Starter, Pro and Scale plans.' },
          { to: '/cloud/storage' as const, icon: HardDrive, title: 'Storage', text: 'Browse, upload and manage your files.' },
          { to: '/cloud/api-keys' as const, icon: KeyRound, title: 'API keys', text: 'Create and revoke the keys your apps use.' },
          { to: '/cloud/usage' as const, icon: Activity, title: 'Usage', text: 'Track requests, bandwidth and storage over time.' },
          { to: '/cloud/docs' as const, icon: BookOpen, title: 'Docs', text: 'Endpoints, authentication and code samples.' }].map(item => (
          <Link key={item.title} to={item.to} className="dashboard-panel dashboard-stat flex items-start gap-4 p-4 sm:p-5">
            <span className="dashboard-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"><item.icon size={18} /></span>
            <span><span className="block text-sm">{item.title}</span><span className="mt-1 block text-xs text-muted-foreground">{item.text}</span></span>
            <ArrowUpRight size={14} className="ml-auto shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </section>
  </>;
}
