import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { AdminCloudPlanned } from '@/components/admin-cloud-planned';

export const Route = createFileRoute('/admin/cloud/users')({
  head: () => cloudAdminHead("Users & usage", "Look up a user and control their storage."),
  component: AdminCloudUsers,
});

function AdminCloudUsers() {
  return <>
    <AdminCloudHeader title={"Users & usage"} description={"Look up a user and control their storage."} />
    <AdminCloudPlanned step={5} items={[
      "Search a user and see all their buckets, total GB and requests",
      "Cap a user's upload size",
      "Reset a user's API key",
      "Ban an abusive user",
    ]} />
  </>;
}
