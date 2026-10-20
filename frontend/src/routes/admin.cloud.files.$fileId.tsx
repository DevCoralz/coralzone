import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudFileDetail } from '@/components/admin-cloud-file-detail';

export const Route = createFileRoute('/admin/cloud/files/$fileId')({
  head: () => cloudAdminHead('File', 'One file: owner, flag, remove or block its type.'),
  component: FilePage,
});

function FilePage() {
  const { fileId } = Route.useParams();
  return <AdminCloudFileDetail fileId={fileId} />;
}
