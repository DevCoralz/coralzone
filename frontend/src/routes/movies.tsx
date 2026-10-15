import { createFileRoute } from '@tanstack/react-router';
import { DashboardShell } from '@/components/dashboard-shell';
import { DashboardPage } from '@/components/dashboard-page';
import { getBrandMetadata } from '@/lib/brand.functions';
import { dashboardHead } from '@/lib/dashboard-head';

export const Route = createFileRoute('/movies')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Movies', 'Movie streaming and release updates on CoralzOne.', '/movies', loaderData?.origin),
  component: Page,
});

function Page() {
  return <DashboardShell><DashboardPage page="movies" /></DashboardShell>;
}
