import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudFiles } from '@/components/admin-cloud-files';

export const Route = createFileRoute('/admin/cloud/files/')({
  head: () => cloudAdminHead('Files and abuse', 'Find any file, flag it, remove it or block its type.'),
  component: AdminCloudFiles,
});
