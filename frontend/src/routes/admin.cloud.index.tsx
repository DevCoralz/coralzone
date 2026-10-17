import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudHub } from '@/components/admin-cloud-hub';

export const Route = createFileRoute('/admin/cloud/')({
  head: () => cloudAdminHead('Cloud overview', 'Service health and platform-wide storage totals.'),
  component: AdminCloudHub,
});
