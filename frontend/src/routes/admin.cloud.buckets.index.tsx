import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudBuckets } from '@/components/admin-cloud-buckets';

export const Route = createFileRoute('/admin/cloud/buckets/')({
  head: () => cloudAdminHead('Buckets', 'Every bucket across all users.'),
  component: AdminCloudBuckets,
});
