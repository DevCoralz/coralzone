import { Link, createFileRoute } from '@tanstack/react-router';
import { Check, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dashboardHead } from '@/lib/dashboard-head';
import { getBrandMetadata } from '@/lib/brand.functions';

export const Route = createFileRoute('/cloud/pricing')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Cloud pricing', 'Monthly plans for storage and API usage.', '/cloud/pricing', loaderData?.origin),
  component: Page,
});

const plans = [
  { name: 'Starter', price: '₦2,500', storage: '50 GB', requests: '10,000 requests a month', keys: '1 API key', perks: ['Community support', '7 days of history'] },
  { name: 'Pro', price: '₦9,500', storage: '500 GB', requests: '100,000 requests a month', keys: '5 API keys', perks: ['Priority support', '30 days of history', 'Usage alerts'], popular: true },
  { name: 'Scale', price: '₦29,500', storage: '2 TB', requests: '1,000,000 requests a month', keys: 'Unlimited API keys', perks: ['Dedicated support', '90 days of history', 'Usage alerts', 'Custom retention'] },
];

function Page() {
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
            <li className="flex items-center gap-2"><Check size={15} className="text-primary-glow" />{plan.requests}</li>
            <li className="flex items-center gap-2"><Check size={15} className="text-primary-glow" />{plan.keys}</li>
            {plan.perks.map(perk => <li key={perk} className="flex items-center gap-2"><Check size={15} className="text-primary-glow" />{perk}</li>)}
          </ul>
          <Button asChild variant={plan.popular ? 'crystal' : 'glass'} className="mt-8 h-11 px-5 font-normal">
            <Link to="/cloud/pay" search={{ plan: plan.name.toLowerCase() }}>Get {plan.name}<ArrowUpRight /></Link>
          </Button>
        </section>
      ))}
    </div>

    <p className="mt-8 text-xs text-muted-foreground">Extra storage costs ₦40 per 10 GB.</p>
  </>;
}
