import { useEffect, useState } from 'react';
import { Activity, HardDrive, Radio } from 'lucide-react';
import { createFileRoute } from '@tanstack/react-router';
import { getStorageStatus, getMyStorageUsage, type StorageUsage } from '@/lib/storage.functions';
import { dashboardHead } from '@/lib/dashboard-head';
import { getBrandMetadata } from '@/lib/brand.functions';

export const Route = createFileRoute('/cloud/usage')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Cloud usage', 'Requests and storage, updated live.', '/cloud/usage', loaderData?.origin),
  component: Page,
});

const SNAP_KEY = 'cloudone-usage-snapshots';
const REFRESH_MS = 20000;

type Snapshots = { base: number; days: Record<string, number> };
type Day = { date: string; label: string; requests: number };

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

// Last 7 days, oldest first.
function lastSevenDays(): Day[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return { date: dayKey(date), label: date.toLocaleDateString(undefined, { weekday: 'short' }), requests: 0 };
  });
}

// Used only when the service does not send its own daily numbers: turns the
// running request total into per-day counts by remembering each day's last reading.
function trackSnapshots(total: number): Record<string, number> {
  let snaps: Snapshots = { base: total, days: {} };
  try {
    const raw = window.localStorage.getItem(SNAP_KEY);
    if (raw) snaps = JSON.parse(raw) as Snapshots;
  } catch { /* storage unavailable */ }
  snaps.days[dayKey(new Date())] = total;
  const keys = Object.keys(snaps.days).sort().slice(-31);
  snaps.days = Object.fromEntries(keys.map(key => [key, snaps.days[key]]));
  try { window.localStorage.setItem(SNAP_KEY, JSON.stringify(snaps)); } catch { /* storage unavailable */ }

  const perDay: Record<string, number> = {};
  let previous = snaps.base;
  for (const key of keys) {
    const current = snaps.days[key];
    perDay[key] = current >= previous ? current - previous : current;
    previous = current;
  }
  return perDay;
}

function Page() {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [online, setOnline] = useState(false);
  const [days, setDays] = useState<Day[]>(lastSevenDays());
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const [usageResult, statusResult] = await Promise.all([getMyStorageUsage(), getStorageStatus()]);
      if (!active) return;
      setUsage(usageResult);
      setOnline(Boolean(statusResult.configured && statusResult.online));
      if (usageResult.configured) {
        const fromService = Object.fromEntries(usageResult.daily.map(row => [row.date, row.requests]));
        const perDay = usageResult.daily.length ? fromService : trackSnapshots(usageResult.requests);
        setDays(lastSevenDays().map(day => ({ ...day, requests: perDay[day.date] ?? 0 })));
        setUpdated(new Date());
      }
    }
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const live = Boolean(usage?.configured);
  const peak = Math.max(...days.map(day => day.requests), 1);
  const today = days[days.length - 1]?.date;
  const weekTotal = days.reduce((sum, day) => sum + day.requests, 0);

  return <>
    <div className="flex items-center justify-between gap-3">
      <h1 className="font-display text-3xl font-normal sm:text-4xl">Usage</h1>
      <p className={`flex items-center gap-2 text-xs ${live && online ? 'text-online' : 'text-muted-foreground'}`}>
        <Radio size={14} className={live && online ? 'animate-pulse' : ''} />{live && online ? 'Live' : 'Offline'}
      </p>
    </div>

    <div className="mt-6 grid gap-3 sm:grid-cols-3 sm:gap-5">
      <div className="dashboard-panel dashboard-stat block p-3 sm:p-5"><Activity size={18} className="text-primary-glow" /><p className="mt-4 text-[10px] text-muted-foreground sm:text-xs">Requests this month</p><p className="mt-1 text-2xl font-normal sm:text-3xl">{live ? usage!.requests.toLocaleString() : '0'}</p></div>
      <div className="dashboard-panel dashboard-stat block p-3 sm:p-5"><Activity size={18} className="text-primary-glow" /><p className="mt-4 text-[10px] text-muted-foreground sm:text-xs">Last 7 days</p><p className="mt-1 text-2xl font-normal sm:text-3xl">{weekTotal.toLocaleString()}</p></div>
      <div className="dashboard-panel dashboard-stat block p-3 sm:p-5"><HardDrive size={18} className="text-primary-glow" /><p className="mt-4 text-[10px] text-muted-foreground sm:text-xs">Storage used</p><p className="mt-1 text-2xl font-normal sm:text-3xl">{live ? formatBytes(usage!.bytesUsed) : '0 B'}</p></div>
    </div>

    <section className="dashboard-panel mt-6 p-5 sm:p-7">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-normal">Requests per day</h2>
        {updated && <p className="text-[11px] text-muted-foreground">Updated {updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>}
      </div>
      <div className="mt-8 flex h-52 items-end gap-2 sm:gap-3" role="img" aria-label="Bar chart of requests per day for the last 7 days">
        {days.map(day => (
          <div key={day.date} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span className="text-[10px] tabular-nums text-muted-foreground">{day.requests > 0 ? day.requests.toLocaleString() : ''}</span>
            <div className={`w-full rounded-t-sm transition-all duration-500 ${day.date === today ? 'bg-primary-glow' : 'bg-primary-glow/50'}`} style={{ height: `${Math.max((day.requests / peak) * 100, day.requests > 0 ? 4 : 1)}%` }} title={`${day.requests} requests`} />
            <span className={`text-[10px] ${day.date === today ? 'text-foreground' : 'text-muted-foreground'}`}>{day.label}</span>
          </div>
        ))}
      </div>
      {!live && <p className="mt-6 border-t border-glass-border pt-4 text-xs text-muted-foreground">Storage is offline, so there is nothing to show yet.</p>}
    </section>
  </>;
}
