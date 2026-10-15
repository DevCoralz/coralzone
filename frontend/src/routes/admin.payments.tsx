import { createFileRoute } from '@tanstack/react-router';
import { AdminShell } from '@/components/admin-shell';
import { AdminPayments } from '@/components/admin-payments';

export const Route = createFileRoute('/admin/payments')({
  head: () => ({
    meta: [
      { title: 'Payments — CoralzOne Admin' },
      { name: 'description', content: 'Provider keys, top-up limits and every payment.' },
      { property: 'og:title', content: 'Payments — CoralzOne Admin' },
      { property: 'og:description', content: 'Provider keys, top-up limits and every payment.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: () => <AdminShell title="Payments" subtitle="Provider keys, top-up limits and every payment."><AdminPayments /></AdminShell>,
});
