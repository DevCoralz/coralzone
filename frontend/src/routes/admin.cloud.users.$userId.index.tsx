import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudUserDetail } from '@/components/admin-cloud-user-detail';

export const Route = createFileRoute('/admin/cloud/users/$userId/')({
  head: () => cloudAdminHead('User', 'One person: space, buckets, files and history.'),
  component: UserOverviewPage,
});

function UserOverviewPage() {
  const { userId } = Route.useParams();
  return <AdminCloudUserDetail userId={userId} />;
}
