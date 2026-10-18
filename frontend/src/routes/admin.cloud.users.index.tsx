import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudUsers } from '@/components/admin-cloud-users';

export const Route = createFileRoute('/admin/cloud/users/')({
  head: () => cloudAdminHead('Users and usage', 'Everyone on CoralzOne and what they use.'),
  component: AdminCloudUsers,
});
