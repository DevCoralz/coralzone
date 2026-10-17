import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { AdminCloudPlanned } from '@/components/admin-cloud-planned';

export const Route = createFileRoute('/admin/cloud/buckets')({
  head: () => cloudAdminHead("Buckets", "Every bucket across all users."),
  component: AdminCloudBuckets,
});

function AdminCloudBuckets() {
  return <>
    <AdminCloudHeader title={"Buckets"} description={"Every bucket across all users."} />
    <AdminCloudPlanned step={4} items={[
      "List buckets with owner, name, storage used and file count",
      "Filter buckets that are more than 80% full",
      "View the files inside a bucket",
      "Freeze or delete a bucket",
    ]} />
  </>;
}
