import { createFileRoute, notFound } from '@tanstack/react-router';
import { getIsAdmin } from '@/lib/admin.functions';
import { AdminShell } from '@/components/admin-shell';
import { AdminAds } from '@/components/admin-ads';

export const Route = createFileRoute('/admin/ads')({
  beforeLoad: async () => {
    const isAdmin = await getIsAdmin();
    if (!isAdmin) throw notFound();
  },
  head: () => ({
    meta: [
      { title: 'Ads — CoralzOne Admin' },
      { name: 'description', content: 'Create ads and choose where they appear.' },
      { property: 'og:title', content: 'Ads — CoralzOne Admin' },
      { property: 'og:description', content: 'Create ads and choose where they appear.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: () => <AdminShell title="Ads" subtitle="Create ads and choose where they appear."><AdminAds /></AdminShell>,
});
