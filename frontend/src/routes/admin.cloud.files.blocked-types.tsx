import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudBlockedTypes } from '@/components/admin-cloud-blocked-types';

export const Route = createFileRoute('/admin/cloud/files/blocked-types')({
  head: () => cloudAdminHead('Blocked types', 'Choose which file types nobody can upload.'),
  component: AdminCloudBlockedTypes,
});
