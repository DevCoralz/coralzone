import { createFileRoute, Outlet } from '@tanstack/react-router';
import { adminRouteGuard } from '@/lib/admin-guard';
import { cloudAdminHead } from '@/lib/admin-cloud-head';
import { AdminShell } from '@/components/admin-shell';
import { AdminCloudNav } from '@/components/admin-cloud-nav';

// Layout route for the whole Cloud admin tree (/admin/cloud/*). The guard
// here runs before every child route loads, so children don't repeat it.
// Each branch is its own file (admin.cloud.<branch>.tsx) and its own page.
export const Route = createFileRoute('/admin/cloud')({
  beforeLoad: adminRouteGuard,
  head: () => cloudAdminHead('Cloud storage', 'Manage the CoralzOne Cloud storage system.'),
  component: CloudAdminLayout,
});

function CloudAdminLayout() {
  return (
    <AdminShell live title="Cloud storage" subtitle="Manage the CoralzOne Cloud storage system.">
      <AdminCloudNav />
      <Outlet />
    </AdminShell>
  );
}
