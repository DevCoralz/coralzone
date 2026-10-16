import { createFileRoute, Outlet } from '@tanstack/react-router';
import { CloudShell } from '@/components/cloud-shell';
import { getBrandMetadata } from '@/lib/brand.functions';
import { dashboardHead } from '@/lib/dashboard-head';

export const Route = createFileRoute('/cloud')({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => dashboardHead('Cloud', 'CloudOne: storage, API keys, usage and docs.', '/cloud', loaderData?.origin),
  component: () => <CloudShell><Outlet /></CloudShell>,
});
