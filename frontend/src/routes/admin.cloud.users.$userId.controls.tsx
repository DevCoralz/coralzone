import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudUserControlsPage } from '@/components/admin-cloud-user-controls-page';

export const Route = createFileRoute('/admin/cloud/users/$userId/controls')({
  head: () => cloudAdminHead('User controls', "Change one person's plan, limits and access."),
  component: UserControlsPage,
});

function UserControlsPage() {
  const { userId } = Route.useParams();
  return <AdminCloudUserControlsPage userId={userId} />;
}
