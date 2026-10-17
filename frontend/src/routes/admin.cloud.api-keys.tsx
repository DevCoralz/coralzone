import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { AdminCloudPlanned } from '@/components/admin-cloud-planned';

export const Route = createFileRoute('/admin/cloud/api-keys')({
  head: () => cloudAdminHead("API keys", "Keys across all users."),
  component: AdminCloudApiKeys,
});

function AdminCloudApiKeys() {
  return <>
    <AdminCloudHeader title={"API keys"} description={"Keys across all users."} />
    <AdminCloudPlanned step={6} items={[
      "List keys with last used time and request count",
      "Revoke a key",
      "Rate-limit a key",
    ]} />
  </>;
}
