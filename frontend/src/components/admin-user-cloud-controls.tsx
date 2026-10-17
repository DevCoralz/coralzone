import { useMemo, useState } from 'react';
import { Search, Save, Undo2, Snowflake, Ban, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { STORAGE_PLANS, type StoragePlanId } from '@/lib/storage-plans';
import { STORAGE_SETTINGS_LIMITS as LIMITS } from '@/lib/storage-settings';
import { BAN_REASON_MAX, resolveUserQuota, type AdminUserControls, type UserControlsPatch, type UserEntitlement } from '@/lib/storage-quota';
import { formatBytes } from '@/lib/format';
import { adminLookupUserControls, adminUpdateUserControls } from '@/lib/storage-quota.functions';

const MB = 1024 * 1024;
const GB = 1024 * MB;
const PLAN_IDS: StoragePlanId[] = ['starter', 'pro', 'scale'];
const fieldClass = 'mt-2 rounded-full border-glass-border bg-transparent text-foreground';

// Form state is held as strings so partially-typed numbers behave; it is
// parsed and validated only when computing what to save. The gateway
// re-validates everything — this is for instant feedback.
interface FormState {
  plan: StoragePlanId;
  extraGb: string;
  quotaOverrideGb: string; // empty = follow the plan
  uploadOverrideMb: string; // empty = follow the plan
  frozen: boolean;
  banned: boolean;
  banReason: string;
}

function toForm(entitlement: UserEntitlement, banReason: string | null | undefined): FormState {
  return {
    plan: entitlement.plan,
    extraGb: String(Math.round(entitlement.extraBytes / GB)),
    quotaOverrideGb: entitlement.bytesQuotaOverride === null ? '' : String(Math.round(entitlement.bytesQuotaOverride / GB)),
    uploadOverrideMb: entitlement.maxUploadOverride === null ? '' : String(Math.round(entitlement.maxUploadOverride / MB)),
    frozen: entitlement.frozen,
    banned: entitlement.banned,
    banReason: banReason ?? '',
  };
}

const wholeNumber = (value: string) => (/^\d{1,9}$/.test(value.trim()) ? Number(value.trim()) : NaN);

// The entitlement the form currently describes, or null while any field is
// invalid. Also returns the human-readable problems.
function parseForm(form: FormState): { entitlement: UserEntitlement | null; errors: string[] } {
  const errors: string[] = [];
  const extraGb = form.extraGb.trim() === '' ? 0 : wholeNumber(form.extraGb);
  if (!Number.isFinite(extraGb) || extraGb * GB > LIMITS.planBytesQuota.max) errors.push('Extra storage must be a whole number of GB (0 or more).');

  let bytesQuotaOverride: number | null = null;
  if (form.quotaOverrideGb.trim() !== '') {
    const gb = wholeNumber(form.quotaOverrideGb);
    if (!Number.isFinite(gb) || gb * GB < LIMITS.planBytesQuota.min || gb * GB > LIMITS.planBytesQuota.max) errors.push('Storage override must be 1 GB or more, or empty to follow the plan.');
    else bytesQuotaOverride = gb * GB;
  }
  let maxUploadOverride: number | null = null;
  if (form.uploadOverrideMb.trim() !== '') {
    const mb = wholeNumber(form.uploadOverrideMb);
    if (!Number.isFinite(mb) || mb * MB < LIMITS.planMaxUploadBytes.min || mb * MB > LIMITS.planMaxUploadBytes.max) errors.push('Upload limit override must be between 1 and 4096 MB, or empty to follow the plan.');
    else maxUploadOverride = mb * MB;
  }
  if (bytesQuotaOverride !== null && maxUploadOverride !== null && maxUploadOverride > bytesQuotaOverride) errors.push('Upload limit cannot be larger than the storage override.');
  if (form.banReason.trim().length > BAN_REASON_MAX) errors.push(`Ban reason must be ${BAN_REASON_MAX} characters or fewer.`);

  if (errors.length > 0) return { entitlement: null, errors };
  return {
    entitlement: { plan: form.plan, extraBytes: extraGb * GB, frozen: form.frozen, bytesQuotaOverride, maxUploadOverride, banned: form.banned },
    errors,
  };
}

// Only the fields that differ from what is saved, so the audit log records
// exactly what this admin changed and nothing else.
function buildPatch(next: UserEntitlement, form: FormState, current: UserEntitlement, currentReason: string | null | undefined): UserControlsPatch {
  const patch: UserControlsPatch = {};
  if (next.plan !== current.plan) patch.plan = next.plan;
  if (next.extraBytes !== current.extraBytes) patch.extraBytes = next.extraBytes;
  if (next.frozen !== current.frozen) patch.frozen = next.frozen;
  if (next.bytesQuotaOverride !== current.bytesQuotaOverride) patch.bytesQuotaOverride = next.bytesQuotaOverride;
  if (next.maxUploadOverride !== current.maxUploadOverride) patch.maxUploadOverride = next.maxUploadOverride;
  if (next.banned !== current.banned) patch.banned = next.banned;
  const reason = form.banReason.trim() === '' ? null : form.banReason.trim();
  if (next.banned && (reason ?? null) !== (currentReason ?? null)) patch.banReason = reason;
  return patch;
}

export function AdminUserCloudControls() {
  const [input, setInput] = useState('');
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [data, setData] = useState<AdminUserControls | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmBan, setConfirmBan] = useState(false);

  const current = data?.ok ? data.entitlement ?? null : null;
  const settings = data?.ok ? data.settings ?? null : null;

  const parsed = useMemo(() => (form ? parseForm(form) : { entitlement: null, errors: [] as string[] }), [form]);
  const patch = useMemo(
    () => (parsed.entitlement && form && current ? buildPatch(parsed.entitlement, form, current, data?.banReason) : {}),
    [parsed.entitlement, form, current, data?.banReason],
  );
  const dirty = Object.keys(patch).length > 0;
  const preview = parsed.entitlement && settings ? resolveUserQuota(parsed.entitlement, settings) : null;

  function apply(result: AdminUserControls) {
    setData(result);
    if (result.ok && result.entitlement) setForm(toForm(result.entitlement, result.banReason));
  }

  async function lookup() {
    const value = input.trim();
    if (!value) return;
    setLooking(true);
    setLookupError(null);
    setNotice(null);
    const result = await adminLookupUserControls({ data: value });
    setLooking(false);
    if (result.ok) apply(result);
    else {
      setData(null);
      setForm(null);
      setLookupError(result.error ?? 'Could not look that user up.');
    }
  }

  async function save() {
    if (!data?.user || !dirty) return;
    setSaving(true);
    setNotice(null);
    const result = await adminUpdateUserControls({ data: { user: data.user.id, patch } });
    setSaving(false);
    if (result.ok) {
      apply(result);
      setNotice({ kind: 'ok', text: 'Saved. Changes apply to this user\'s next action right away.' });
    } else {
      setNotice({ kind: 'error', text: result.error ?? 'Could not save changes.' });
    }
  }

  // Banning someone is the one change worth a second look.
  const requestSave = () => (patch.banned === true ? setConfirmBan(true) : void save());

  return <>
    <form className="dashboard-panel flex flex-col gap-3 p-5 sm:flex-row sm:items-end sm:p-7" onSubmit={event => { event.preventDefault(); void lookup(); }} role="search">
      <label className="block flex-1 text-xs text-muted-foreground">Find a user by email address or user id
        <Input value={input} onChange={event => setInput(event.target.value)} placeholder="name@example.com" autoComplete="off" spellCheck={false} maxLength={254} className={fieldClass} />
      </label>
      <Button type="submit" variant="crystal" disabled={looking || !input.trim()} className="h-10 px-5 font-normal"><Search />{looking ? 'Looking…' : 'Look up'}</Button>
    </form>
    {lookupError && <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/15 px-4 py-2 text-xs text-destructive">{lookupError}</p>}

    {data?.ok && data.user && form && current && settings && <div className="mt-6 space-y-6">
      <section className="dashboard-panel flex flex-wrap items-center justify-between gap-3 p-5 sm:p-7" aria-label="Selected user">
        <div className="min-w-0">
          <p className="truncate text-base font-normal">{data.user.name || 'Unnamed user'}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{data.user.email} · {data.user.id}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
          <span className="rounded-full border border-glass-border px-3 py-1 text-muted-foreground">{STORAGE_PLANS[current.plan].label}</span>
          {current.frozen && <span className="flex items-center gap-1 rounded-full border border-primary-glow/50 px-3 py-1 text-primary-glow"><Snowflake size={11} aria-hidden="true" />Frozen</span>}
          {current.banned && <span className="flex items-center gap-1 rounded-full border border-destructive/50 px-3 py-1 text-destructive"><Ban size={11} aria-hidden="true" />Banned</span>}
          {!current.frozen && !current.banned && <span className="flex items-center gap-1 rounded-full border border-glass-border px-3 py-1 text-muted-foreground"><ShieldCheck size={11} aria-hidden="true" />Active</span>}
        </div>
      </section>

      <section className="dashboard-panel space-y-4 p-5 sm:p-7" aria-labelledby="c-plan">
        <h3 id="c-plan" className="font-display text-lg font-normal">Plan & storage</h3>
        <div role="radiogroup" aria-label="Plan" className="flex flex-wrap gap-2">
          {PLAN_IDS.map(id => (
            <Button key={id} type="button" role="radio" aria-checked={form.plan === id} variant={form.plan === id ? 'crystal' : 'glass'} onClick={() => setForm({ ...form, plan: id })} className="h-10 px-5 font-normal">{STORAGE_PLANS[id].label}</Button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-xs text-muted-foreground">Extra storage (GB)
            <Input inputMode="numeric" value={form.extraGb} onChange={event => setForm({ ...form, extraGb: event.target.value })} className={fieldClass} />
          </label>
          <label className="block text-xs text-muted-foreground">Storage override (GB)
            <Input inputMode="numeric" value={form.quotaOverrideGb} placeholder="Follow plan" onChange={event => setForm({ ...form, quotaOverrideGb: event.target.value })} className={fieldClass} />
          </label>
          <label className="block text-xs text-muted-foreground">Upload limit override (MB)
            <Input inputMode="numeric" value={form.uploadOverrideMb} placeholder="Follow plan" onChange={event => setForm({ ...form, uploadOverrideMb: event.target.value })} className={fieldClass} />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">Leave an override empty to follow the plan. An upload limit is always held under the global max ({formatBytes(settings.globalMaxUploadBytes)}). Extra storage is added on top of the plan or the storage override.</p>
        {preview && <p className="rounded-lg border border-glass-border px-4 py-3 text-xs" aria-live="polite">
          <span className="text-muted-foreground">Effective after saving: </span>
          {formatBytes(preview.bytesQuota)} total · {formatBytes(preview.maxUploadBytes)} per file
          {preview.blockReason && preview.blockReason !== 'maintenance' && <span className="text-primary-glow"> · uploads {preview.blockReason === 'banned' ? 'blocked (banned)' : 'paused (frozen)'}</span>}
        </p>}
      </section>

      <section className="dashboard-panel space-y-5 p-5 sm:p-7" aria-labelledby="c-access">
        <h3 id="c-access" className="font-display text-lg font-normal">Access</h3>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p id="c-frozen" className="flex items-center gap-2 text-sm"><Snowflake size={15} className="text-primary-glow" aria-hidden="true" />Freeze uploads</p>
            <p className="mt-1 text-xs text-muted-foreground">Blocks new uploads. Their files stay, and they can still download and delete them.</p>
          </div>
          <Switch checked={form.frozen} onCheckedChange={checked => setForm({ ...form, frozen: checked })} aria-labelledby="c-frozen" />
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-glass-border pt-5">
          <div>
            <p id="c-banned" className="flex items-center gap-2 text-sm"><Ban size={15} className="text-destructive" aria-hidden="true" />Ban from Cloud storage</p>
            <p className="mt-1 text-xs text-muted-foreground">Blocks uploads, downloads and deletes through the app. Files are kept for review. The rest of CoralzOne is unaffected.</p>
          </div>
          <Switch checked={form.banned} onCheckedChange={checked => setForm({ ...form, banned: checked })} aria-labelledby="c-banned" />
        </div>
        {form.banned && <label className="block text-xs text-muted-foreground">Reason (admin-only, never shown to the user)
          <Input value={form.banReason} maxLength={BAN_REASON_MAX} onChange={event => setForm({ ...form, banReason: event.target.value })} placeholder="e.g. Hosting malware" className={fieldClass} />
        </label>}
      </section>

      <div aria-live="polite">
        {parsed.errors.length > 0 && (
          <ul role="alert" className="mb-4 space-y-1 rounded-lg border border-destructive/40 bg-destructive/15 px-4 py-3 text-xs text-destructive">
            {parsed.errors.map(error => <li key={error}>{error}</li>)}
          </ul>
        )}
        {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`mb-4 rounded-lg border px-4 py-2 text-xs ${notice.kind === 'error' ? 'border-destructive/40 bg-destructive/15 text-destructive' : 'border-glass-border text-muted-foreground'}`}>{notice.text}</p>}
      </div>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-glass-border p-3 backdrop-blur" style={{ background: 'var(--dashboard-deep)' }}>
        <Button variant="crystal" onClick={requestSave} disabled={!dirty || parsed.errors.length > 0 || saving} className="h-10 px-5 font-normal"><Save />{saving ? 'Saving…' : 'Save changes'}</Button>
        <Button variant="glass" onClick={() => { setForm(toForm(current, data.banReason)); setNotice(null); }} disabled={!dirty || saving} className="h-10 font-normal"><Undo2 />Discard</Button>
        <p className="ml-auto text-xs text-muted-foreground">Every change is recorded in the admin log.</p>
      </div>

      <AlertDialog open={confirmBan} onOpenChange={setConfirmBan}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ban {data.user.email} from Cloud storage?</AlertDialogTitle>
            <AlertDialogDescription>They will no longer be able to upload, download or delete files. Their files are kept. You can lift the ban at any time from this page.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void save()}>Ban user</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>}
  </>;
}
