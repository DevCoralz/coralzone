import { createFileRoute } from '@tanstack/react-router';
import { DashboardShell } from '@/components/dashboard-shell';
import { DashboardPage } from '@/components/dashboard-page';
import { getBrandMetadata } from '@/lib/brand.functions';
import { dashboardHead } from '@/lib/dashboard-head';

export const Route = createFileRoute('/account')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('My account', 'Your CoralzOne account and membership.', '/account', loaderData?.origin),
  component: Page,
});

function Page() {
  return <DashboardShell><DashboardPage page="account" /></DashboardShell>;
}
