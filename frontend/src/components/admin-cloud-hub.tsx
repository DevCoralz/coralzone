import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { RefreshCw, HardDrive, Activity, ShieldCheck, ArrowUpRight, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { CLOUD_ADMIN_SECTIONS } from '@/lib/admin-cloud-sections';
import { formatBytes, formatCount } from '@/lib/format';
import { getStorageStatus, adminGetStorageUsage } from '@/lib/storage.functions';
import { adminGetStorageSettings } from '@/lib/storage-settings.functions';

type Status = Awaited<ReturnType<typeof getStorageStatus>>;
type Usage = Awaited<ReturnType<typeof adminGetStorageUsage>>;

export function AdminCloudHub() {
  const [status, setStatus] = useState<Status | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [maintenance, setMaintenance] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const [statusResult, usageResult, settingsResult] = await Promise.all([getStorageStatus(), adminGetStorageUsage(), adminGetStorageSettings()]);
    setStatus(statusResult);
    setUsage(usageResult);
    setMaintenance(settingsResult.ok && settingsResult.effective.maintenance.enabled);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  const connected = Boolean(status?.configured && status.online);
  const branches = CLOUD_ADMIN_SECTIONS.filter(section => section.to !== '/admin/cloud');

  return <>
    <AdminCloudHeader
      title="Overview"
      description="Service health and platform-wide totals. Service keys stay on the server — users never see the storage URL."
      actions={<Button variant="glass" onClick={refresh} disabled={loading} className="h-10 font-normal"><RefreshCw className={loading ? 'animate-spin' : ''} />Refresh</Button>}
    />

    {maintenance && (
      <Link to="/admin/cloud/settings" role="status" className="mb-5 flex items-center gap-3 rounded-lg border border-primary-glow/50 px-4 py-3 text-sm">
        <Wrench size={16} className="shrink-0 text-primary-glow" aria-hidden="true" />
        <span>Storage maintenance mode is <strong className="font-normal text-primary-glow">ON</strong> — new uploads are blocked. Open settings to turn it off.</span>
      </Link>
    )}

    <div className="grid gap-3 sm:grid-cols-3 sm:gap-5">
      <div className="dashboard-panel p-5"><ShieldCheck size={18} className="text-primary-glow" /><p className="mt-4 text-xs text-muted-foreground">Service status</p><p className="mt-1 text-2xl font-normal">{loading ? '…' : connected ? 'Online' : status?.configured ? 'Unreachable' : 'Not configured'}</p></div>
      <div className="dashboard-panel p-5"><HardDrive size={18} className="text-primary-glow" /><p className="mt-4 text-xs text-muted-foreground">Storage used (all users)</p><p className="mt-1 text-2xl font-normal">{usage?.configured ? formatBytes(usage.bytesUsed) : '—'}</p></div>
      <div className="dashboard-panel p-5"><Activity size={18} className="text-primary-glow" /><p className="mt-4 text-xs text-muted-foreground">Files stored</p><p className="mt-1 text-2xl font-normal">{usage?.configured ? formatCount(usage.requests) : '—'}</p></div>
    </div>

    <h3 className="mt-10 font-display text-lg font-normal">Manage</h3>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
      {branches.map(section => (
        <Link key={section.to} to={section.to} className="dashboard-panel dashboard-stat block p-5">
          <div className="flex items-center justify-between">
            <section.icon size={18} className="text-primary-glow" aria-hidden="true" />
            <ArrowUpRight size={14} className="text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="mt-4 text-base font-normal">{section.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{section.description}</p>
          <p className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">{section.status === 'live' ? 'Live' : section.status === 'partial' ? `Partly live · more in step ${section.step}` : `Step ${section.step}`}</p>
        </Link>
      ))}
    </div>
  </>;
}
