import { createFileRoute } from '@tanstack/react-router';
import { DashboardShell } from '@/components/dashboard-shell';
import { DashboardPage } from '@/components/dashboard-page';
import { getBrandMetadata } from '@/lib/brand.functions';
import { dashboardHead } from '@/lib/dashboard-head';

export const Route = createFileRoute('/apis')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('APIs', 'Your CoralzOne REST API workspace and request activity.', '/apis', loaderData?.origin),
  component: Page,
});

function Page() {
  return <DashboardShell><DashboardPage page="apis" /></DashboardShell>;
}
