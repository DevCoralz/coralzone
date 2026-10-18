import { Link, createFileRoute } from '@tanstack/react-router';
import { Check, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dashboardHead } from '@/lib/dashboard-head';
import { getBrandMetadata } from '@/lib/brand.functions';
import { getEffectiveStorageSettings } from '@/lib/storage-settings.functions';
import { describeBucketLimit } from '@/lib/storage-buckets';
import { effectivePlan, type EffectiveStorageSettings } from '@/lib/storage-settings';
import type { StoragePlanId } from '@/lib/storage-plans';
import { formatBytes, formatCount, formatNgn } from '@/lib/format';

const PLAN_ORDER: StoragePlanId[] = ['starter', 'pro', 'scale'];

export const Route = createFileRoute('/cloud/pricing')({
  loader: async () => {
    const [brand, settings] = await Promise.all([getBrandMetadata(), getEffectiveStorageSettings()]);
    return { ...brand, settings };
  },
  head: ({ loaderData }) => dashboardHead('Cloud pricing', 'Monthly plans for storage and API usage.', '/cloud/pricing', loaderData?.origin),
  component: Page,
});

const PERKS: Record<StoragePlanId, string[]> = {
  starter: ['Community support', '7 days of history'],
  pro: ['Priority support', '30 days of history', 'Usage alerts'],
  scale: ['Dedicated support', '90 days of history', 'Usage alerts', 'Custom retention'],
};

// Everything numeric comes from storage-plans.ts (prices, request/key limits)
// merged with the admin's settings (storage, max upload) — so this page can
// never disagree with what uploads actually enforce.
function buildPlans(settings: EffectiveStorageSettings) {
  return PLAN_ORDER.map(id => {
    const plan = effectivePlan(id, settings);
    return {
      id,
      name: plan.label,
      price: formatNgn(plan.priceMonthlyNgn),
      storage: formatBytes(plan.bytesQuota),
      maxUpload: formatBytes(plan.maxUploadBytes),
      requests: plan.requestsPerMonth === null ? 'Unlimited requests' : `${formatCount(plan.requestsPerMonth)} requests a month`,
      keys: plan.apiKeyLimit === null ? 'Unlimited API keys' : `${plan.apiKeyLimit} API key${plan.apiKeyLimit === 1 ? '' : 's'}`,
      buckets: describeBucketLimit(id),
      perks: PERKS[id],
      popular: id === 'pro',
    };
  });
}

function Page() {
  const { settings } = Route.useLoaderData();
  const plans = buildPlans(settings);
  return <>
    <h1 className="font-display text-3xl font-normal sm:text-4xl">Pricing</h1>

    <div className="mt-8 grid gap-4 lg:grid-cols-3">
      {plans.map(plan => (
        <section key={plan.name} className={`dashboard-panel flex flex-col p-6 ${plan.popular ? 'ring-1 ring-primary-glow' : ''}`}>
          {plan.popular && <p className="mb-3 text-[10px] uppercase tracking-widest text-primary-glow">Most popular</p>}
          <h2 className="font-display text-2xl font-normal">{plan.name}</h2>
          <p className="mt-3 text-4xl font-normal">{plan.price}<span className="text-sm text-muted-foreground"> a month</span></p>
          <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><Check size={15} className="text-primary-glow" />{plan.storage} storage</li>
            <li className="flex items-center gap-2"><Check size={15} className="text-primary-glow" />{plan.maxUpload} max file upload</li>
            <li className="flex items-center gap-2"><Check size={15} className="text-primary-glow" />{plan.requests}</li>
            <li className="flex items-center gap-2"><Check size={15} className="text-primary-glow" />{plan.keys}</li>
            <li className="flex items-center gap-2"><Check size={15} className="text-primary-glow" />{plan.buckets}</li>
            {plan.perks.map(perk => <li key={perk} className="flex items-center gap-2"><Check size={15} className="text-primary-glow" />{perk}</li>)}
          </ul>
          <Button asChild variant={plan.popular ? 'crystal' : 'glass'} className="mt-8 h-11 px-5 font-normal">
            <Link to="/cloud/pay" search={{ plan: plan.id }}>Get {plan.name}<ArrowUpRight /></Link>
          </Button>
        </section>
      ))}
    </div>

    <p className="mt-8 text-xs text-muted-foreground">Extra storage costs {formatNgn(settings.extraStoragePriceNgn)} per 10 GB.</p>
  </>;
}
