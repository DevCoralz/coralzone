import { createFileRoute, redirect, Outlet } from '@tanstack/react-router';
import { CloudShell } from '@/components/cloud-shell';
import { getBrandMetadata } from '@/lib/brand.functions';
import { dashboardHead } from '@/lib/dashboard-head';
import { getSession } from '@/lib/auth-session.functions';

export const Route = createFileRoute('/cloud')({
  // Every /cloud/* page now calls server functions that derive the file
  // owner from the session (storage.functions.ts) and throw if nobody's
  // signed in. Before this, an anonymous visitor could reach these pages
  // and quietly act as the one hardcoded "coralzone-admin" owner — this
  // gate (same pattern as /dashboard) replaces that with a proper sign-in
  // redirect instead of every call failing with an unhandled error.
  beforeLoad: async () => {
    const user = await getSession();
    if (!user) {
      throw redirect({ to: '/auth', search: { next: '/cloud/storage' } });
    }
  },
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Cloud', 'CloudOne: storage, API keys, usage and docs.', '/cloud', loaderData?.origin),
  component: () => <CloudShell><Outlet /></CloudShell>,
});
