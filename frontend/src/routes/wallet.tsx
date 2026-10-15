import { createFileRoute } from '@tanstack/react-router';
import { DashboardShell } from '@/components/dashboard-shell';
import { DashboardPage } from '@/components/dashboard-page';
import { getBrandMetadata } from '@/lib/brand.functions';
import { dashboardHead } from '@/lib/dashboard-head';

export const Route = createFileRoute('/wallet')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Wallet', 'Your CoralzOne wallet and transaction activity.', '/wallet', loaderData?.origin),
  component: Page,
});

function Page() {
  return <DashboardShell><DashboardPage page="wallet" /></DashboardShell>;
}
