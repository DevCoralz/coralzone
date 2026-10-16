import { createFileRoute, notFound } from '@tanstack/react-router';
import { getIsAdmin } from '@/lib/admin.functions';
import { AdminShell } from '@/components/admin-shell';
import { AdminOverview } from '@/components/admin-overview';

export const Route = createFileRoute('/admin/')({
  beforeLoad: async () => {
    const isAdmin = await getIsAdmin();
    if (!isAdmin) throw notFound();
  },
  head: () => ({
    meta: [
      { title: 'Admin overview — CoralzOne Admin' },
      { name: 'description', content: 'Revenue, users and activity across CoralzOne.' },
      { property: 'og:title', content: 'Admin overview — CoralzOne Admin' },
      { property: 'og:description', content: 'Revenue, users and activity across CoralzOne.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: () => <AdminShell title="Overview" subtitle="Revenue, users and activity across CoralzOne."><AdminOverview /></AdminShell>,
});
