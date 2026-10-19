import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudApiKeys } from '@/components/admin-cloud-api-keys';

export const Route = createFileRoute('/admin/cloud/api-keys/')({
  head: () => cloudAdminHead('API keys', 'Keys across all users.'),
  component: AdminCloudApiKeys,
});
