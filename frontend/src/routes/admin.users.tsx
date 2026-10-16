import { createFileRoute, notFound } from '@tanstack/react-router';
import { getIsAdmin } from '@/lib/admin.functions';
import { AdminShell } from '@/components/admin-shell';
import { AdminUsers } from '@/components/admin-users';

export const Route = createFileRoute('/admin/users')({
  beforeLoad: async () => {
    const isAdmin = await getIsAdmin();
    if (!isAdmin) throw notFound();
  },
  head: () => ({
    meta: [
      { title: 'Users — CoralzOne Admin' },
      { name: 'description', content: 'Search, review and manage every CoralzOne account.' },
      { property: 'og:title', content: 'Users — CoralzOne Admin' },
      { property: 'og:description', content: 'Search, review and manage every CoralzOne account.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: () => <AdminShell title="Users" subtitle="Search, review and manage every CoralzOne account."><AdminUsers /></AdminShell>,
});
