import { createFileRoute } from '@tanstack/react-router';
import { DashboardShell } from '@/components/dashboard-shell';
import { DashboardPage } from '@/components/dashboard-page';
import { getBrandMetadata } from '@/lib/brand.functions';
import { dashboardHead } from '@/lib/dashboard-head';

export const Route = createFileRoute('/support')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Help & support', 'Answers about your CoralzOne account, wallet and services.', '/support', loaderData?.origin),
  component: Page,
});

function Page() {
  return <DashboardShell><DashboardPage page="support" /></DashboardShell>;
}
