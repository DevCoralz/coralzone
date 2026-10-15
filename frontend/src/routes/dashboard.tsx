import { createFileRoute } from '@tanstack/react-router';
import { DashboardShell } from '@/components/dashboard-shell';
import { DashboardOverview } from '@/components/dashboard-overview';
import { getBrandMetadata } from '@/lib/brand.functions';
import { dashboardHead } from '@/lib/dashboard-head';

export const Route = createFileRoute('/dashboard')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Dashboard', 'Your CoralzOne balance, API activity and usage at a glance.', '/dashboard', loaderData?.origin),
  component: Page,
});

function Page() {
  return <DashboardShell><DashboardOverview /></DashboardShell>;
}
