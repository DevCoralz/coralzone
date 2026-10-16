import { createFileRoute, notFound } from '@tanstack/react-router';
import { getIsAdmin } from '@/lib/admin.functions';
import { AdminShell } from '@/components/admin-shell';
import { AdminSiteSettings } from '@/components/admin-site-settings';

export const Route = createFileRoute('/admin/site-settings')({
  beforeLoad: async () => {
    const isAdmin = await getIsAdmin();
    if (!isAdmin) throw notFound();
  },
  head: () => ({
    meta: [
      { title: 'Site settings — CoralzOne Admin' },
      { name: 'description', content: 'Name, colours, images, currency and homepage text.' },
      { property: 'og:title', content: 'Site settings — CoralzOne Admin' },
      { property: 'og:description', content: 'Name, colours, images, currency and homepage text.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: () => <AdminShell title="Site settings" subtitle="Name, colours, images, currency and homepage text."><AdminSiteSettings /></AdminShell>,
});
