import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudSettings } from '@/components/admin-cloud-settings';

export const Route = createFileRoute('/admin/cloud/settings')({
  head: () => cloudAdminHead('System settings', 'Global limits and defaults for the storage service.'),
  component: AdminCloudSettings,
});
