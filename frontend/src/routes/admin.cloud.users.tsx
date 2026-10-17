import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { AdminCloudPlanned } from '@/components/admin-cloud-planned';
import { AdminUserCloudControls } from '@/components/admin-user-cloud-controls';

export const Route = createFileRoute('/admin/cloud/users')({
  head: () => cloudAdminHead("Users & usage", "Look up a user and control their storage."),
  component: AdminCloudUsers,
});

function AdminCloudUsers() {
  return <>
    <AdminCloudHeader title={"Users & usage"} description={"Look up a user and control their storage."} />
    <AdminUserCloudControls />
    <div className="mt-10">
      <AdminCloudPlanned step={5} items={[
        "Search users by name or email, with a list of everyone using storage",
        "See each user's buckets, total GB used and request count",
        "Reset a user's API key (arrives with the API-keys step)",
      ]} />
    </div>
  </>;
}
