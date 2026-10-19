import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudApiKeyDetail } from '@/components/admin-cloud-api-key-detail';

export const Route = createFileRoute('/admin/cloud/api-keys/$keyId')({
  head: () => cloudAdminHead('API key', 'One key: owner, usage and actions.'),
  component: KeyPage,
});

function KeyPage() {
  const { keyId } = Route.useParams();
  return <AdminCloudApiKeyDetail keyId={keyId} />;
}
