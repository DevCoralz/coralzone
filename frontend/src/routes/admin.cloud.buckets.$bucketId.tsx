import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudBucketDetail } from '@/components/admin-cloud-bucket-detail';

export const Route = createFileRoute('/admin/cloud/buckets/$bucketId')({
  head: () => cloudAdminHead('Bucket', 'One bucket: owner, files and actions.'),
  component: BucketPage,
});

function BucketPage() {
  const { bucketId } = Route.useParams();
  return <AdminCloudBucketDetail bucketId={bucketId} />;
}
