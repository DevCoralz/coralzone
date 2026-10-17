import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { AdminCloudPlanned } from '@/components/admin-cloud-planned';

export const Route = createFileRoute('/admin/cloud/billing')({
  head: () => cloudAdminHead("Billing & extra storage", "Extra-storage purchases and payment problems."),
  component: AdminCloudBilling,
});

function AdminCloudBilling() {
  return <>
    <AdminCloudHeader title={"Billing & extra storage"} description={"Extra-storage purchases and payment problems."} />
    <AdminCloudPlanned step={8} items={[
      "See who bought extra 10 GB blocks",
      "Manually add or remove extra storage for a user",
      "See failed payments",
    ]} />
  </>;
}
