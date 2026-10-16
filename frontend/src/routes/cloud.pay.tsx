import { useState } from 'react';
import { useSearch, createFileRoute } from '@tanstack/react-router';
import { CreditCard, Building2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dashboardHead } from '@/lib/dashboard-head';
import { getBrandMetadata } from '@/lib/brand.functions';

export const Route = createFileRoute('/cloud/pay')({
  validateSearch: (search: Record<string, unknown>): { plan?: string } => ({
    plan: typeof search.plan === 'string' ? search.plan : undefined,
  }),
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Cloud checkout', 'Choose a plan and complete your CoralzOne Cloud payment.', '/cloud/pay', loaderData?.origin),
  component: Page,
});

const plans = {
  starter: { label: 'Starter', price: 2500, storage: '50 GB' },
  pro: { label: 'Pro', price: 9500, storage: '500 GB' },
  scale: { label: 'Scale', price: 29500, storage: '2 TB' },
};

function Page() {
  const { plan } = useSearch({ from: '/cloud/pay' });
  const selected = plan && plan in plans ? plan : 'pro';
  const details = selected === 'starter' ? plans.starter : selected === 'scale' ? plans.scale : plans.pro;
  const [method, setMethod] = useState<'card' | 'transfer'>('card');
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');

  const monthly = details.price;
  const total = period === 'yearly' ? monthly * 10 : monthly;

  return <>
    <p className="text-xs text-muted-foreground">Checkout</p>
    <h1 className="mt-2 font-display text-3xl font-normal sm:text-4xl">Pay for Cloud</h1>

    <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <section className="dashboard-panel p-6">
        <h2 className="font-display text-xl font-normal">1 · Billing period</h2>
        <div className="mt-4 flex gap-3">
          {(['monthly', 'yearly'] as const).map(option => (
            <Button key={option} variant="ghost" onClick={() => setPeriod(option)} aria-pressed={period === option}
              className={`h-10 rounded-lg px-4 font-normal capitalize ${period === option ? 'dashboard-selected' : ''}`}>
              {option}{option === 'yearly' ? ' · 2 months free' : ''}
            </Button>
          ))}
        </div>

        <h2 className="mt-8 font-display text-xl font-normal">2 · Payment method</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setMethod('card')} aria-pressed={method === 'card'}
            className={`dashboard-panel dashboard-stat flex items-center gap-3 p-4 text-left ${method === 'card' ? 'ring-1 ring-primary-glow' : ''}`}>
            <CreditCard size={18} className="text-primary-glow" />
            <span><span className="block text-sm">Card</span><span className="mt-1 block text-xs text-muted-foreground">Visa, Mastercard, Verve</span></span>
          </button>
          <button type="button" onClick={() => setMethod('transfer')} aria-pressed={method === 'transfer'}
            className={`dashboard-panel dashboard-stat flex items-center gap-3 p-4 text-left ${method === 'transfer' ? 'ring-1 ring-primary-glow' : ''}`}>
            <Building2 size={18} className="text-primary-glow" />
            <span><span className="block text-sm">Bank transfer</span><span className="mt-1 block text-xs text-muted-foreground">NGN account details</span></span>
          </button>
        </div>

        <div className="mt-8 flex items-start gap-3 border-t border-glass-border pt-6">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary-glow" />
          <p className="text-xs leading-relaxed text-muted-foreground">Payments are being connected right now. Your plan selection is remembered — card and bank payments will activate here the moment the payment provider is switched on.</p>
        </div>
        <Button variant="crystal" disabled className="mt-6 h-11 px-6 font-normal">Complete payment — coming soon</Button>
      </section>

      <aside className="dashboard-panel h-fit p-6">
        <h2 className="font-display text-xl font-normal">Order summary</h2>
        <div className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span>{details.label}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Storage</span><span>{details.storage}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Billing</span><span className="capitalize">{period}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span className="capitalize">{method === 'card' ? 'Card' : 'Bank transfer'}</span></div>
        </div>
        <div className="mt-6 flex justify-between border-t border-glass-border pt-5 text-lg"><span>Total</span><span className="tabular-nums">₦{total.toLocaleString()}{period === 'yearly' && <span className="ml-1 text-xs text-muted-foreground">/ year</span>}{period === 'monthly' && <span className="ml-1 text-xs text-muted-foreground">/ month</span>}</span></div>
        <p className="mt-4 text-[11px] text-muted-foreground">Changing your mind later is easy — plans adjust at the next billing date.</p>
      </aside>
    </div>
  </>;
}
