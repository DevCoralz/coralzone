import { createFileRoute, notFound } from '@tanstack/react-router';
import { getIsAdmin } from '@/lib/admin.functions';
import { AdminShell } from '@/components/admin-shell';
import { AdminUserDetail } from '@/components/admin-user-detail';

export const Route = createFileRoute('/admin/user/$userId')({
  beforeLoad: async () => {
    const isAdmin = await getIsAdmin();
    if (!isAdmin) throw notFound();
  },
  head: () => ({
    meta: [
      { title: 'User details — CoralzOne Admin' },
      { name: 'description', content: 'Account details and actions for a CoralzOne user.' },
      { property: 'og:title', content: 'User details — CoralzOne Admin' },
      { property: 'og:description', content: 'Account details and actions for a CoralzOne user.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: UserDetailPage,
});

function UserDetailPage() {
  const { userId } = Route.useParams();
  return <AdminShell title="User details" subtitle="Status, role, wallet and usage actions."><AdminUserDetail userId={userId} /></AdminShell>;
}
