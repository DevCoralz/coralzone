import { createFileRoute } from '@tanstack/react-router';
import { DashboardShell } from '@/components/dashboard-shell';
import { DashboardPage } from '@/components/dashboard-page';
import { getBrandMetadata } from '@/lib/brand.functions';
import { dashboardHead } from '@/lib/dashboard-head';

export const Route = createFileRoute('/drops')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Drops', 'Discover upcoming Drops on CoralzOne.', '/drops', loaderData?.origin),
  component: Page,
});

function Page() {
  return <DashboardShell><DashboardPage page="drops" /></DashboardShell>;
}
