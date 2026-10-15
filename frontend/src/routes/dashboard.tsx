import { createFileRoute, redirect } from '@tanstack/react-router';
import { DashboardShell } from '@/components/dashboard-shell';
import { DashboardOverview } from '@/components/dashboard-overview';
import { getBrandMetadata } from '@/lib/brand.functions';
import { dashboardHead } from '@/lib/dashboard-head';
import { getSession, type SessionUser } from '@/lib/auth-session.functions';

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    const user = await getSession();
    if (!user) {
      throw redirect({ to: '/auth', search: { next: '/dashboard' } });
    }
    return { user } satisfies { user: SessionUser };
  },
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Dashboard', 'Your CoralzOne balance, API activity and usage at a glance.', '/dashboard', loaderData?.origin),
  component: Page,
});

function Page() {
  const { user } = Route.useRouteContext();
  return <DashboardShell userName={user.name}><DashboardOverview /></DashboardShell>;
}
