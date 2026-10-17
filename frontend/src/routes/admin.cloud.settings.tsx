import { createFileRoute } from '@tanstack/react-router';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminCloudHeader } from '@/components/admin-cloud-header';
import { AdminCloudPlanned } from '@/components/admin-cloud-planned';

export const Route = createFileRoute('/admin/cloud/settings')({
  head: () => cloudAdminHead("System settings", "Global limits and defaults for the storage service."),
  component: AdminCloudSettings,
});

function AdminCloudSettings() {
  return <>
    <AdminCloudHeader title={"System settings"} description={"Global limits and defaults for the storage service."} />
    <AdminCloudPlanned step={2} items={[
      "Set global max upload size, extra-storage price and allowed file types",
      "Set the default quota for Starter, Pro and Scale",
      "Turn maintenance mode on for storage only",
    ]} />
  </>;
}
