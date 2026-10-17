import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudFiles } from '@/components/admin-cloud-files';

export const Route = createFileRoute('/admin/cloud/files')({
  head: () => cloudAdminHead('Cloud files', 'Browse and remove files across all users.'),
  component: AdminCloudFiles,
});
