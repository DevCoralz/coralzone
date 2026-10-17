import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, Undo2, RotateCcw, Info, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { STORAGE_PLANS, type StoragePlanId } from '@/lib/storage-plans';
import {
  FILE_GROUPS, STORAGE_SETTINGS_LIMITS as LIMITS, DEFAULT_MAINTENANCE_MESSAGE,
  type EffectiveStorageSettings, type FileGroupId, type StorageSettingsOverrides,
} from '@/lib/storage-settings';
import { formatDateTime, formatBytes } from '@/lib/format';
import { adminGetStorageSettings, adminUpdateStorageSettings } from '@/lib/storage-settings.functions';

const MB = 1024 * 1024;
const GB = 1024 * MB;
const PLAN_IDS: StoragePlanId[] = ['starter', 'pro', 'scale'];

// Form state is held as strings so partially-typed numbers behave; it is
// parsed and validated only when computing what to save.
interface FormState {
  globalMaxUploadMb: string;
  extraPrice: string;
  groups: FileGroupId[];
  plans: Record<StoragePlanId, { quotaGb: string; uploadMb: string }>;
  maintenanceEnabled: boolean;
  maintenanceMessage: string;
}

function toForm(s: EffectiveStorageSettings): FormState {
  return {
    globalMaxUploadMb: String(Math.round(s.globalMaxUploadBytes / MB)),
    extraPrice: String(s.extraStoragePriceNgn),
    groups: [...s.allowedFileGroups],
    plans: {
      starter: { quotaGb: String(Math.round(s.planQuotas.starter.bytesQuota / GB)), uploadMb: String(Math.round(s.planQuotas.starter.maxUploadBytes / MB)) },
      pro: { quotaGb: String(Math.round(s.planQuotas.pro.bytesQuota / GB)), uploadMb: String(Math.round(s.planQuotas.pro.maxUploadBytes / MB)) },
      scale: { quotaGb: String(Math.round(s.planQuotas.scale.bytesQuota / GB)), uploadMb: String(Math.round(s.planQuotas.scale.maxUploadBytes / MB)) },
    },
    maintenanceEnabled: s.maintenance.enabled,
    maintenanceMessage: s.maintenance.message,
  };
}

const wholeNumber = (value: string) => (/^\d{1,9}$/.test(value.trim()) ? Number(value.trim()) : NaN);
const inRange = (n: number, r: { min: number; max: number }) => Number.isSafeInteger(n) && n >= r.min && n <= r.max;

// Turns the form into (a) the minimal patch to send — only settings that
// differ from what is currently applied — and (b) any validation errors.
// The gateway re-validates everything; this just gives instant feedback.
function buildPatch(form: FormState, current: EffectiveStorageSettings) {
  const errors: string[] = [];
  const patch: StorageSettingsOverrides = {};

  const globalBytes = wholeNumber(form.globalMaxUploadMb) * MB;
  if (!inRange(globalBytes, LIMITS.globalMaxUploadBytes)) errors.push('Global max upload must be between 1 MB and 4096 MB (4 GB).');
  else if (globalBytes !== current.globalMaxUploadBytes) patch.globalMaxUploadBytes = globalBytes;

  const price = wholeNumber(form.extraPrice);
  if (!inRange(price, LIMITS.extraStoragePriceNgn)) errors.push('Extra-storage price must be a whole number of naira (0 – 1,000,000).');
  else if (price !== current.extraStoragePriceNgn) patch.extraStoragePriceNgn = price;

  if (form.groups.length === 0) errors.push('Allow at least one file type group.');
  else if (form.groups.join() !== current.allowedFileGroups.join()) patch.allowedFileGroups = form.groups;

  const quotas = {} as Record<StoragePlanId, { bytesQuota: number; maxUploadBytes: number }>;
  let plansValid = true;
  let plansChanged = false;
  for (const id of PLAN_IDS) {
    const bytesQuota = wholeNumber(form.plans[id].quotaGb) * GB;
    const maxUploadBytes = wholeNumber(form.plans[id].uploadMb) * MB;
    const label = STORAGE_PLANS[id].label;
    if (!inRange(bytesQuota, LIMITS.planBytesQuota)) { errors.push(`${label}: storage must be between 1 GB and 102,400 GB (100 TB).`); plansValid = false; }
    else if (!inRange(maxUploadBytes, LIMITS.planMaxUploadBytes)) { errors.push(`${label}: max upload must be between 1 MB and 4096 MB.`); plansValid = false; }
    else if (maxUploadBytes > bytesQuota) { errors.push(`${label}: max upload cannot exceed its storage quota.`); plansValid = false; }
    else {
      quotas[id] = { bytesQuota, maxUploadBytes };
      const cur = current.planQuotas[id];
      if (cur.bytesQuota !== bytesQuota || cur.maxUploadBytes !== maxUploadBytes) plansChanged = true;
    }
  }
  if (plansValid && plansChanged) patch.planQuotas = quotas;

  const message = form.maintenanceMessage.replace(/\s+/g, ' ').trim();
  if (message.length > LIMITS.maintenanceMessageMax) errors.push(`Maintenance message is limited to ${LIMITS.maintenanceMessageMax} characters.`);
  else if (form.maintenanceEnabled !== current.maintenance.enabled || message !== current.maintenance.message) {
    patch.maintenance = { enabled: form.maintenanceEnabled, message };
  }

  return { patch, errors };
}

const fieldClass = 'mt-2 rounded-full border-glass-border bg-transparent text-foreground';

export function AdminCloudSettings() {
  const [current, setCurrent] = useState<EffectiveStorageSettings | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await adminGetStorageSettings();
    if (result.ok) {
      setCurrent(result.effective);
      setForm(toForm(result.effective));
      setUpdatedAt(result.updatedAt);
      setNotice(null);
    } else {
      setNotice({ kind: 'error', text: result.error ?? 'Could not load settings.' });
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const { patch, errors } = useMemo(
    () => (form && current ? buildPatch(form, current) : { patch: {} as StorageSettingsOverrides, errors: [] as string[] }),
    [form, current],
  );
  const dirty = Object.keys(patch).length > 0;

  function update(next: Partial<FormState>) {
    setNotice(null);
    setForm(prev => (prev ? { ...prev, ...next } : prev));
  }

  function updatePlan(id: StoragePlanId, field: 'quotaGb' | 'uploadMb', value: string) {
    setNotice(null);
    setForm(prev => (prev ? { ...prev, plans: { ...prev.plans, [id]: { ...prev.plans[id], [field]: value } } } : prev));
  }

  function toggleGroup(id: FileGroupId, checked: boolean) {
    if (!form) return;
    const next = FILE_GROUPS.map(g => g.id).filter(gid => (gid === id ? checked : form.groups.includes(gid)));
    update({ groups: next });
  }

  async function submit(body: Record<string, unknown>, success: string) {
    setSaving(true);
    setNotice(null);
    const result = await adminUpdateStorageSettings({ data: body });
    setSaving(false);
    if (result.ok) {
      setCurrent(result.effective);
      setForm(toForm(result.effective));
      setUpdatedAt(result.updatedAt);
      setNotice({ kind: 'ok', text: success });
    } else {
      setNotice({ kind: 'error', text: result.error ?? 'Could not save settings.' });
    }
  }

  const save = () => submit(patch as Record<string, unknown>, 'Settings saved. Changes apply to new uploads right away.');
  const resetAll = () => submit(
    { globalMaxUploadBytes: null, extraStoragePriceNgn: null, allowedFileGroups: null, planQuotas: null, maintenance: null },
    'All settings reset to their defaults.',
  );

  const refreshButton = (
    <Button variant="glass" onClick={() => void load()} disabled={loading || saving} className="h-10 font-normal">
      <RefreshCw className={loading ? 'animate-spin' : ''} />Reload
    </Button>
  );

  if (!form || !current) {
    return <>
      <AdminCloudHeader title="System settings" description="Global limits and defaults for the storage service." actions={refreshButton} />
      {notice
        ? <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/15 px-4 py-2 text-xs text-destructive">{notice.text}</p>
        : <p className="text-sm text-muted-foreground">Loading…</p>}
    </>;
  }

  return <>
    <AdminCloudHeader
      title="System settings"
      description={updatedAt ? `Global limits and defaults for the storage service. Last saved ${formatDateTime(updatedAt)}.` : 'Global limits and defaults for the storage service. Nothing saved yet — built-in defaults apply.'}
      actions={refreshButton}
    />

    <div className="space-y-6">
      <section className="dashboard-panel space-y-4 p-5 sm:p-7" aria-labelledby="s-upload">
        <h3 id="s-upload" className="font-display text-lg font-normal">Upload limit</h3>
        <label className="block text-xs text-muted-foreground">Global max upload per file (MB)
          <Input inputMode="numeric" value={form.globalMaxUploadMb} onChange={e => update({ globalMaxUploadMb: e.target.value })} className={`${fieldClass} max-w-xs`} aria-describedby="s-upload-help" />
        </label>
        <p id="s-upload-help" className="text-xs text-muted-foreground">
          No single file can exceed this, whatever the plan says. 4096 MB (4 GB) is the ceiling and needs a Telegram Premium session; on a standard session
          set it to 2000 MB. The storage service enforces its own <code>STORAGE_MAX_UPLOAD_MB</code> too — keep them matched.
        </p>
      </section>

      <section className="dashboard-panel p-5 sm:p-7" aria-labelledby="s-plans">
        <h3 id="s-plans" className="font-display text-lg font-normal">Plan quotas</h3>
        <p className="mt-1 text-xs text-muted-foreground">Storage and per-file upload size each plan gets. Prices and API-key limits are fixed in code.</p>
        <div className="mt-4 divide-y divide-glass-border">
          {PLAN_IDS.map(id => {
            const uploadMb = wholeNumber(form.plans[id].uploadMb);
            const globalMb = wholeNumber(form.globalMaxUploadMb);
            const capped = Number.isFinite(uploadMb) && Number.isFinite(globalMb) && globalMb < uploadMb;
            return (
              <div key={id} className="grid gap-3 py-4 sm:grid-cols-[8rem_1fr_1fr] sm:items-start">
                <p className="pt-2 text-sm">{STORAGE_PLANS[id].label}</p>
                <label className="block text-xs text-muted-foreground">Storage (GB)
                  <Input inputMode="numeric" value={form.plans[id].quotaGb} onChange={e => updatePlan(id, 'quotaGb', e.target.value)} className={fieldClass} />
                </label>
                <label className="block text-xs text-muted-foreground">Max upload (MB)
                  <Input inputMode="numeric" value={form.plans[id].uploadMb} onChange={e => updatePlan(id, 'uploadMb', e.target.value)} className={fieldClass} />
                  {capped && <span className="mt-1 block text-[11px] text-primary-glow">Effective: {formatBytes(globalMb * MB)} (global limit is lower)</span>}
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <section className="dashboard-panel space-y-4 p-5 sm:p-7" aria-labelledby="s-extra">
        <h3 id="s-extra" className="font-display text-lg font-normal">Extra storage</h3>
        <label className="block text-xs text-muted-foreground">Price per 10 GB block (₦)
          <Input inputMode="numeric" value={form.extraPrice} onChange={e => update({ extraPrice: e.target.value })} className={`${fieldClass} max-w-xs`} />
        </label>
      </section>

      <section className="dashboard-panel p-5 sm:p-7" aria-labelledby="s-types">
        <h3 id="s-types" className="font-display text-lg font-normal">Allowed file types</h3>
        <p className="mt-1 text-xs text-muted-foreground">Uploads outside the ticked groups are rejected. The storage service checks the file's real content, not its name.</p>
        <ul className="mt-4 space-y-3">
          {FILE_GROUPS.map(group => (
            <li key={group.id} className="flex items-start gap-3">
              <Checkbox id={`g-${group.id}`} checked={form.groups.includes(group.id)} onCheckedChange={checked => toggleGroup(group.id, checked === true)} className="mt-0.5" />
              <label htmlFor={`g-${group.id}`} className="cursor-pointer text-sm">
                {group.label}<span className="ml-2 text-xs text-muted-foreground">{group.description}</span>
                {group.caution && form.groups.includes(group.id) && <span className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground"><Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />{group.caution}</span>}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="dashboard-panel space-y-4 p-5 sm:p-7" aria-labelledby="s-maint">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 id="s-maint" className="flex items-center gap-2 font-display text-lg font-normal"><Wrench size={16} className="text-primary-glow" aria-hidden="true" />Storage maintenance mode</h3>
            <p className="mt-1 text-xs text-muted-foreground">Blocks new uploads only. Downloads, listing and the rest of CoralzOne keep working.</p>
          </div>
          <Switch checked={form.maintenanceEnabled} onCheckedChange={checked => update({ maintenanceEnabled: checked })} aria-labelledby="s-maint" />
        </div>
        <label className="block text-xs text-muted-foreground">Message shown to users
          <Textarea value={form.maintenanceMessage} maxLength={LIMITS.maintenanceMessageMax} placeholder={DEFAULT_MAINTENANCE_MESSAGE} onChange={e => update({ maintenanceMessage: e.target.value })} className="mt-2 border-glass-border bg-transparent text-foreground" />
        </label>
      </section>
    </div>

    <div className="mt-6" aria-live="polite">
      {errors.length > 0 && (
        <ul role="alert" className="mb-4 space-y-1 rounded-lg border border-destructive/40 bg-destructive/15 px-4 py-3 text-xs text-destructive">
          {errors.map(error => <li key={error}>{error}</li>)}
        </ul>
      )}
      {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`mb-4 rounded-lg border px-4 py-2 text-xs ${notice.kind === 'error' ? 'border-destructive/40 bg-destructive/15 text-destructive' : 'border-glass-border text-muted-foreground'}`}>{notice.text}</p>}
    </div>

    <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-glass-border p-3 backdrop-blur" style={{ background: 'var(--dashboard-deep)' }}>
      <Button variant="crystal" onClick={() => void save()} disabled={!dirty || errors.length > 0 || saving} className="h-10 px-5 font-normal"><Save />{saving ? 'Saving…' : 'Save changes'}</Button>
      <Button variant="glass" onClick={() => { setForm(toForm(current)); setNotice(null); }} disabled={!dirty || saving} className="h-10 font-normal"><Undo2 />Discard</Button>
      <AlertDialog>
        <AlertDialogTrigger asChild><Button variant="ghost" disabled={saving} className="ml-auto h-10 font-normal text-destructive"><RotateCcw />Reset all to defaults</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset every storage setting?</AlertDialogTitle>
            <AlertDialogDescription>Limits, plan quotas, extra-storage price, allowed file types and maintenance mode all go back to the built-in defaults, and maintenance mode turns off. This is recorded in the admin log.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void resetAll()}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </>;
}
